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

async function loadConfig(labId) {
  const { data, error } = await supabase
    .from("labs_apis")
    .select("base_url, auth_details, templates")
    .eq("lab_id", labId)
    .eq("api_name", "whatsapp_outbound")
    .single();

  if (error || !data) {
    throw new Error("WhatsApp outbound config missing for campaign");
  }
  return data;
}

function resolveApiKey(authDetails = {}) {
  return (
    authDetails.api_key ||
    authDetails.apikey ||
    authDetails.apiKey ||
    ""
  ).toString();
}

export async function sendCampaignTemplate({
  labId,
  phone,
  templateName,
  templateParams = [],
  sender = null
}) {
  const config = await loadConfig(labId);
  const apiKey = resolveApiKey(config.auth_details || {});
  if (!apiKey) throw new Error("WhatsApp api key missing");

  const templates = parseTemplates(config.templates);
  const languageCode = String(
    templates?.templates?.[templateName]?.language ||
      templates?.default_language ||
      "en"
  ).trim();

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode || "en" },
      components: [
        {
          type: "body",
          parameters: (templateParams || []).map((value) => ({
            type: "text",
            text: String(value ?? "")
          }))
        }
      ]
    }
  };

  const response = await fetch(config.base_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
      "x-lab-id": String(labId || "")
    },
    body: JSON.stringify(payload)
  });

  const raw = await response.text();
  let result = {};
  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    result = { raw };
  }

  try {
    await supabase.from("whatsapp_messages").insert({
      lab_id: labId,
      phone,
      message: `Template: ${templateName}`,
      direction: response.ok ? "outbound" : "status",
      payload: {
        sender,
        request: payload,
        response: result
      }
    });
  } catch (logError) {
    console.error("[campaign-whatsapp] log insert failed", logError);
  }

  if (!response.ok) {
    throw new Error(result?.message || `WhatsApp failed: ${response.status} ${raw}`);
  }

  return result;
}

