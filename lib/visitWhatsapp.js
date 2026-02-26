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

  const contactName = visit.executive?.name || "SDRC Lab";
  const contactPhone = visit.executive?.phone || "9849110001";

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

  // 3️⃣ Build META-compliant payload
  const payload = {
    source: templates.default_source,
    destination: formattedPhone,
    message: {
      type: "template",
      template: {
        name: templateConfig.campaign,
        language: {
          policy: "deterministic",
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
    }
  };

  // 4️⃣ Send to Twixor META wrapper
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

if (!response.ok) {
  throw new Error(
    result?.message ||
    `WhatsApp failed: ${response.status} ${text}`
  );
}

return result;
}