// File: /lib/visitWhatsapp.js

import { supabase } from "@/lib/supabaseServer";

export async function sendPatientVisitWhatsapp(visitId) {
  // 1️⃣ Fetch visit details
  const { data: visit, error } = await supabase
    .from("visits")
    .select(`
      id,
      lab_id,
      visit_date,
      status,
      patient:patient_id (name, phone),
      executive:executive_id (name, phone),
      time_slot:time_slot (slot_name)
    `)
    .eq("id", visitId)
    .single();

  if (error || !visit) throw new Error("Visit not found");
  if (!visit.patient?.phone) return;

  // Format phone as 91XXXXXXXXXX (NO + sign)
  const formattedPhone = visit.patient.phone.startsWith("91")
    ? visit.patient.phone
    : `91${visit.patient.phone.replace(/^0/, "")}`;

  // 2️⃣ Fetch WhatsApp API config
  const { data: apiConfig, error: apiError } = await supabase
    .from("labs_apis")
    .select("base_url, auth_details, templates")
    .eq("lab_id", visit.lab_id)
    .eq("api_name", "whatsapp_outbound")
    .single();

  if (apiError || !apiConfig) {
    throw new Error("WhatsApp API config not found");
  }

  const templates = apiConfig.templates;
  const authDetails = apiConfig.auth_details;

  const defaultCampaign = templates.default_campaign;
  const templateConfig = templates.templates[defaultCampaign];

  if (!templateConfig) {
    throw new Error("Template config missing");
  }

    const contactName = visit.executive?.name
    ? `Our Medical Technologist ${visit.executive.name}`
    : "SDRC - Secunderabad Diagnostics";  
    const contactPhone = visit.executive?.phone || "9849025601";

  const paramMap = {
    name: visit.patient?.name || "",
    status: visit.status || "",
    date: visit.visit_date || "",
    time_slot: visit.time_slot?.slot_name || "",
    contact_name: contactName,
    contact_phone: contactPhone
  };

  const orderedParams = templateConfig.params_order.map(
    key => paramMap[key] || ""
  );

  // 3️⃣ Build PURE META payload (THIS IS THE FIX)
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: formattedPhone,
    type: "template",
    template: {
      name: templateConfig.campaign, // must match approved template exactly
      language: {
        code: "en"
      },
      components: [
        {
          type: "body",
          parameters: orderedParams.map(value => ({
            type: "text",
            text: value
          }))
        }
      ]
    }
  };

  console.log("WHATSAPP PAYLOAD:", JSON.stringify(payload, null, 2));

  // 4️⃣ Send to Twixor Meta endpoint
  const response = await fetch(apiConfig.base_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": authDetails.api_key
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();

  let result;
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = { raw: text };
  }

  console.log("WHATSAPP RESPONSE:", result);

  if (!response.ok) {
    throw new Error(
      result?.message ||
      `WhatsApp failed: ${response.status} ${text}`
    );
  }

  return result;
}