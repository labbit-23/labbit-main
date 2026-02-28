//lib/whatsapp/sender.js

import { supabase } from "@/lib/supabaseServer";

// --------------------------------------------------
// Fetch WhatsApp API Config Per Lab
// --------------------------------------------------
async function getWhatsappConfig(labId) {
  const { data, error } = await supabase
    .from("labs_apis")
    .select("base_url, auth_details")
    .eq("lab_id", labId)
    .eq("api_name", "whatsapp_outbound")
    .single();

  if (error || !data) {
    throw new Error("WhatsApp API config not found for lab");
  }

  return data;
}

// --------------------------------------------------
// Generic Send Function
// --------------------------------------------------
async function sendWhatsApp({ labId, phone, payload, logText }) {
  const apiConfig = await getWhatsappConfig(labId);

  const response = await fetch(apiConfig.base_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiConfig.auth_details.api_key
    },
    body: JSON.stringify(payload)
  });

  const rawText = await response.text();

  let result;
  try {
    result = rawText ? JSON.parse(rawText) : {};
  } catch {
    result = { raw: rawText };
  }

  // Log outbound message safely
  try {
    await supabase.from("whatsapp_messages").insert({
      lab_id: labId,
      phone,
      message: logText || JSON.stringify(payload),
      direction: response.ok ? "outbound" : "status",
      payload: {
        request: payload,
        response: result
      }
    });
  } catch (logError) {
    console.error("Failed to log WhatsApp message:", logError);
  }

  if (!response.ok) {
    throw new Error(
      result?.message ||
      `WhatsApp failed: ${response.status} ${rawText}`
    );
  }

  return result;
}

// --------------------------------------------------
// TEXT MESSAGE
// --------------------------------------------------
export async function sendTextMessage({
  labId,
  phone,
  text
}) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "text",
    text: {
      body: text
    }
  };

  return sendWhatsApp({
    labId,
    phone,
    payload,
    logText: text
  });
}

// --------------------------------------------------
// MAIN MENU (Buttons)
// --------------------------------------------------
export async function sendMainMenu({
  labId,
  phone
}) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "Welcome to SDRC Lab 👋\n\nHow can we assist you today?"
      },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: "REQUEST_REPORTS",
              title: "🧾 Request Reports"
            }
          },
          {
            type: "reply",
            reply: {
              id: "BOOK_HOME_VISIT",
              title: "🏠 Book Home Visit"
            }
          },
          {
            type: "reply",
            reply: {
              id: "MORE_SERVICES",
              title: "➕ More Services"
            }
          }
        ]
      }
    }
  };

  return sendWhatsApp({
    labId,
    phone,
    payload,
    logText: "Main Menu Sent"
  });
}

// --------------------------------------------------
// MORE SERVICES (List)
// --------------------------------------------------
export async function sendMoreServicesMenu({
  labId,
  phone
}) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "interactive",
    interactive: {
      type: "list",
      body: {
        text: "More Services 👇"
      },
      action: {
        button: "View Services",
        sections: [
          {
            title: "Customer Support",
            rows: [
              {
                id: "TALK_EXECUTIVE",
                title: "👤 Talk to Executive"
              },
              {
                id: "LAB_TIMINGS",
                title: "🕒 Lab Timings"
              },
              {
                id: "SEND_LOCATION",
                title: "📍 Send Lab Location"
              },
              {
                id: "FEEDBACK",
                title: "⭐ Feedback"
              }
            ]
          }
        ]
      }
    }
  };

  return sendWhatsApp({
    labId,
    phone,
    payload,
    logText: "More Services Menu Sent"
  });
}

// --------------------------------------------------
// LOCATION MESSAGE
// --------------------------------------------------
export async function sendLocationMessage({
  labId,
  phone,
  latitude,
  longitude,
  name,
  address
}) {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "location",
    location: {
      latitude,
      longitude,
      name,
      address
    }
  };

  return sendWhatsApp({
    labId,
    phone,
    payload,
    logText: "Location Sent"
  });
}