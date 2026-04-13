// File: /lib/visitWhatsapp.js

import { supabase } from "@/lib/supabaseServer";

function parseTemplates(templates) {
  if (!templates) return {};
  if (typeof templates === "string") {
    try {
      return JSON.parse(templates);
    } catch {
      return {};
    }
  }
  return typeof templates === "object" ? templates : {};
}

function normalizeStatusLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "UPDATED";
  return raw.replace(/_/g, " ").toUpperCase();
}

function resolveTemplateConfig({ templates, templateKey }) {
  const parsed = parseTemplates(templates);
  const named = String(templateKey || "").trim();

  const fromKey = named
    ? parsed?.templates?.[named] || parsed?.[named] || null
    : null;

  if (fromKey) return fromKey;

  const defaultCampaign = String(parsed?.default_campaign || "").trim();
  if (defaultCampaign && parsed?.templates?.[defaultCampaign]) {
    return parsed.templates[defaultCampaign];
  }

  return null;
}

export async function sendPatientVisitWhatsapp(visitId, options = {}) {
  try {
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

    const templateConfig = resolveTemplateConfig({
      templates,
      templateKey: options?.templateKey
    });

    if (!templateConfig) {
      throw new Error("Template config missing");
    }

    const contactName = visit.executive?.name
      ? `our Medical Technologist ${visit.executive.name}`
      : "SDRC - Secunderabad Diagnostics";

    const contactPhone =
      visit.executive?.phone || "9849025601";

    const paramMap = {
      name: visit.patient?.name || "",
      status: normalizeStatusLabel(options?.statusLabel || visit.status),
      date: visit.visit_date || "",
      time_slot: visit.time_slot?.slot_name || "",
      contact_name: contactName,
      contact_phone: contactPhone
    };

    const orderedParams = templateConfig.params_order.map(
      key => paramMap[key] || ""
    );

    // 3️⃣ Build payload
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: formattedPhone,
      type: "template",
      template: {
        name: templateConfig.template_name || templateConfig.campaign,
        language: { code: "en" },
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

    // 4️⃣ Send
    const response = await fetch(apiConfig.base_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": authDetails.api_key
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

    console.log("WHATSAPP RESPONSE:", result);

    // 5️⃣ Log to whatsapp_messages
    try {
      await supabase.from("whatsapp_messages").insert({
        lab_id: visit.lab_id,
        phone: formattedPhone,
        name: visit.patient?.name || null,
        message: `Template: ${templateConfig.campaign}`,
        direction: response.ok ? "outbound" : "status",
        payload: {
          request: payload,
          response: result,
          visit_id: visit.id
        }
      });
    } catch (logError) {
      console.error("Failed to log WhatsApp message:", logError);
      // DO NOT throw — logging should never break flow
    }

    if (!response.ok) {
      throw new Error(
        result?.message ||
        `WhatsApp failed: ${response.status} ${rawText}`
      );
    }

    return result;

  } catch (err) {
    console.error("sendPatientVisitWhatsapp error:", err.message);
    throw err;
  }
}
