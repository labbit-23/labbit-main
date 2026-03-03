import { supabase } from "@/lib/supabaseServer";
import {
  getOrCreateSession,
  updateSession,
  handoffToHuman
} from "@/lib/whatsapp/sessions";
import { processMessage } from "@/lib/whatsapp/engine";
import {
  sendTextMessage,
  sendMainMenu,
  sendMoreServicesMenu,
  sendLocationMessage
} from "@/lib/whatsapp/sender";

// --------------------------------------------------
// 🔹 GET Handler (Webhook Verification Safe)
// --------------------------------------------------
export async function GET() {
  return new Response("WhatsApp Webhook Active", { status: 200 });
}

// --------------------------------------------------
// 🔹 POST Handler
// --------------------------------------------------
export async function POST(req) {
  try {

    const body = await req.json();
    console.log("📩 RAW WEBHOOK:", JSON.stringify(body));

    // --------------------------------------------------
    // 1️⃣ Extract Message Safely
    // --------------------------------------------------

    let message = null;

    if (body?.message) {
      message = {
        id: body.message.id,
        from: body.from,
        text:
          body.message.type === "text"
            ? { body: body.message.text }
            : null,
        interactive:
          body.message.type === "interactive"
            ? body.message.interactive
            : null
      };
    }

    if (!message && body?.messages?.length) {
      message = body.messages[0];
    }

    if (!message && body?.entry?.[0]?.changes?.[0]?.value?.messages?.length) {
      message = body.entry[0].changes[0].value.messages[0];
    }

    if (!message && body?.value?.messages?.length) {
      message = body.value.messages[0];
    }

    if (!message) {
      console.log("⚠️ No message found in webhook.");
      return Response.json({ success: true });
    }

    const messageId = message?.id;
    const rawPhone = message?.from;

    if (!messageId || !rawPhone) {
      console.log("⚠️ Missing messageId or phone.");
      return Response.json({ success: true });
    }

    // --------------------------------------------------
    // 2️⃣ Duplicate Protection
    // --------------------------------------------------

    const { data: existing } = await supabase
      .from("whatsapp_messages")
      .select("id")
      .eq("message_id", messageId)
      .maybeSingle();

    if (existing) {
      console.log("🔁 Duplicate ignored:", messageId);
      return Response.json({ success: true });
    }

    // --------------------------------------------------
    // 3️⃣ Extract User Input
    // --------------------------------------------------

    let userInput = null;

    if (message.text?.body) {
      userInput = message.text.body.trim();
    }

    if (message.interactive?.button_reply?.id) {
      userInput = message.interactive.button_reply.id;
    }

    if (message.interactive?.list_reply?.id) {
      userInput = message.interactive.list_reply.id;
    }

    if (!userInput) {
      console.log("⚠️ No usable user input.");
      return Response.json({ success: true });
    }

    // --------------------------------------------------
    // 4️⃣ Extract Country Code
    // --------------------------------------------------

    const match = rawPhone.match(/^\+(\d{1,3})/);
    const countryCode = match ? match[1] : null;

    const phone = rawPhone; // store full E.164

    // --------------------------------------------------
    // 5️⃣ Get/Create Session
    // --------------------------------------------------

    const session = await getOrCreateSession(phone);

    if (!session.country_code) {
      await supabase
        .from("chat_sessions")
        .update({ country_code: countryCode })
        .eq("id", session.id);
    }

    // --------------------------------------------------
    // 6️⃣ Get Lab
    // --------------------------------------------------

    const { data: lab } = await supabase
      .from("labs")
      .select("*")
      .eq("id", session.lab_id)
      .single();

    if (!lab) {
      console.error("❌ Lab not found.");
      return Response.json({ success: true });
    }

    // --------------------------------------------------
    // 7️⃣ Patient Linking / Lead Creation
    // --------------------------------------------------

    let patientId = session.patient_id;

    if (!patientId) {

      const { data: existingPatient } = await supabase
        .from("patients")
        .select("id")
        .eq("phone", phone)
        .maybeSingle();

      if (existingPatient) {
        patientId = existingPatient.id;
      } else {

        const whatsappName = body?.profile?.name || "WhatsApp Lead";

        const { data: newPatient } = await supabase
          .from("patients")
          .insert({
            name: whatsappName,
            phone: phone,
            is_lead: true
          })
          .select()
          .single();

        patientId = newPatient.id;
      }

      await supabase
        .from("chat_sessions")
        .update({
          patient_id: patientId,
          patient_name: body?.profile?.name || null
        })
        .eq("id", session.id);
    }

    // --------------------------------------------------
    // 8️⃣ Log Inbound (Minimal Storage)
    // --------------------------------------------------

    await supabase.from("whatsapp_messages").insert({
      message_id: messageId,
      lab_id: session.lab_id,
      phone: phone,
      message: userInput,
      direction: "inbound",
      payload: null
    });

    // --------------------------------------------------
    // 9️⃣ Human Handoff Mode
    // --------------------------------------------------

    if (session.status === "handoff") {
      console.log("👤 In human handoff mode.");
      return Response.json({ success: true });
    }

    // --------------------------------------------------
    // 🔟 Process Bot Message
    // --------------------------------------------------

    const result = await processMessage(session, userInput, phone);

    // --------------------------------------------------
    // 1️⃣1️⃣ Internal Notify
    // --------------------------------------------------

    if (result.replyType === "INTERNAL_NOTIFY") {
      await sendTextMessage({
        labId: session.lab_id,
        phone: lab.internal_whatsapp_number,
        text: result.notifyText
      });
    }

    // --------------------------------------------------
    // 1️⃣2️⃣ Update Session
    // --------------------------------------------------

    await updateSession(session.id, result.newState, result.context);

    // --------------------------------------------------
    // 1️⃣3️⃣ Send Reply
    // --------------------------------------------------

    switch (result.replyType) {

      case "MAIN_MENU":
        await sendMainMenu({ labId: session.lab_id, phone });
        break;

      case "MORE_SERVICES_MENU":
        await sendMoreServicesMenu({ labId: session.lab_id, phone });
        break;

      case "SEND_LOCATION":
        await sendLocationMessage({
          labId: session.lab_id,
          phone,
          latitude: lab.latitude,
          longitude: lab.longitude,
          name: lab.name,
          address: lab.address
        });
        break;

      case "CALL_QUICKBOOK":
        await fetch("https://lab.sdrc.in/api/quickbook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientName: body?.profile?.name || "WhatsApp User",
            phone,
            packageName: result.context.tests,
            area: result.context.area,
            date: result.context.selected_date,
            timeslot: result.context.selected_slot,
            persons: 1,
            whatsapp: true,
            agree: true
          })
        });

        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text: "Your booking request has been received. Our team will contact you shortly."
        });
        break;

      case "HANDOFF":
        await handoffToHuman(session.id);
        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text: result.replyText
        });
        break;

      case "TEXT":
        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text: result.replyText
        });
        break;

      default:
        await sendMainMenu({ labId: session.lab_id, phone });
    }

    return Response.json({ success: true });

  } catch (err) {
    console.error("🚨 Webhook Error:", err);
    return Response.json({ success: false }, { status: 500 });
  }
}