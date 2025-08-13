// =============================================
// File: lib/processBookingMessage.js
// =============================================
import { supabase } from "@/lib/supabaseClient";
import sendWhatsAppMessage from "./sendWhatsAppMessage";

const sessions = {};

async function logStatus(labId, phone, name, message, payload = {}) {
  await supabase.from("whatsapp_messages").insert({
    lab_id: labId,
    phone,
    name,
    message,
    direction: "status",
    payload
  });
}

export default async function processBookingMessage({ labId, phone, name, message, imageUrl }) {
  if (!sessions[phone]) {
    sessions[phone] = { step: "ASK_DATE", name, images: [] };
    await sendWhatsAppMessage(labId, {
      destination: phone,
      userName: name,
      templateParams: [name, "Please provide a preferred visit date (dd-mm-yyyy)"]
    });
    await logStatus(labId, phone, name, "Started booking flow");
    return;
  }

  const session = sessions[phone];

  // Save image if provided at any step
  if (imageUrl) {
    session.images.push(imageUrl);
    await logStatus(labId, phone, name, "Prescription/photo received", { url: imageUrl });
    await sendWhatsAppMessage(labId, {
      destination: phone,
      userName: name,
      templateParams: [name, "📷 Prescription received. Continuing..."]
    });
    return;
  }

  if (session.step === "ASK_DATE") {
    session.date = message;
    session.step = "ASK_ADDRESS";
    await sendWhatsAppMessage(labId, {
      destination: phone,
      userName: name,
      templateParams: [name, "Please provide your full address for the visit"]
    });
    await logStatus(labId, phone, name, `Date provided: ${message}`);

  } else if (session.step === "ASK_ADDRESS") {
    session.address = message;
    session.step = "ASK_TIMESLOT";
    await sendWhatsAppMessage(labId, {
      destination: phone,
      userName: name,
      templateParams: [name, "Please select or type your preferred time slot (e.g., 9-11 AM)"]
    });
    await logStatus(labId, phone, name, `Address provided: ${message}`);

  } else if (session.step === "ASK_TIMESLOT") {
    session.timeslot = message;
    session.step = "CONFIRM";
    await sendWhatsAppMessage(labId, {
      destination: phone,
      userName: name,
      templateParams: [
        name,
        `Confirm booking on ${session.date} at ${session.address} during ${session.timeslot}? Reply YES to confirm.`
      ]
    });
    await logStatus(labId, phone, name, `Timeslot provided: ${message}`);

  } else if (session.step === "CONFIRM") {
    if (/^\s*yes\s*$/i.test(message)) {
      const quickBookPayload = {
        patientName: name,
        phone,
        packageName: "",
        area: session.address,
        date: session.date,
        timeslot: session.timeslot,
        persons: 1,
        whatsapp: true,
        agree: true,
        images: session.images
      };

      try {
        const res = await fetch(`${process.env.APP_BASE_URL || ""}/api/quickbook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(quickBookPayload)
        });

        if (!res.ok) throw new Error(await res.text());

        await sendWhatsAppMessage(labId, {
          destination: phone,
          userName: name,
          templateParams: [name, "✅ Your home visit is booked!"]
        });

        await logStatus(labId, phone, name, "Booking confirmed & saved to quickbookings", quickBookPayload);

      } catch (e) {
        console.error("[QuickBook API Error]", e);
        await sendWhatsAppMessage(labId, {
          destination: phone,
          userName: name,
          templateParams: [name, "❌ There was a problem saving your booking. Please try again."]
        });
      }

      delete sessions[phone];
    } else {
      session.step = "ASK_DATE";
      await sendWhatsAppMessage(labId, {
        destination: phone,
        userName: name,
        templateParams: [name, "Okay, let's start over. Please provide a preferred date again."]
      });
      await logStatus(labId, phone, name, "Booking confirmation denied/restarted");
    }
  }
}
