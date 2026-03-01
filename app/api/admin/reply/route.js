import { supabase } from "@/lib/supabaseServer";
import { sendTextMessage } from "@/lib/whatsapp/sender";

export async function POST(req) {
  try {
    const formData = await req.formData();

    const phone = formData.get("phone");
    const message = formData.get("message");

    if (!phone || !message) {
      return new Response("Missing phone or message", { status: 400 });
    }

    // Fetch session
    const { data: session, error } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("phone", phone)
      .single();

    if (error || !session) {
      return new Response("Session not found", { status: 404 });
    }

    // Send via Mtalkz API
    await sendTextMessage({
      labId: session.lab_id,
      phone,
      text: message
    });

    // Update session timestamps
    await supabase
      .from("chat_sessions")
      .update({
        last_message_at: new Date(),
        updated_at: new Date()
      })
      .eq("id", session.id);

    return Response.redirect(`/admin/whatsapp/${phone}`);

  } catch (err) {
    console.error("Admin reply error:", err);
    return new Response("Internal error", { status: 500 });
  }
}