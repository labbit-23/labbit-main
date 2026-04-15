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

function normalizeTemplateKeys(rawKeys) {
  if (!Array.isArray(rawKeys)) return [];
  return rawKeys
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
}

function fallbackTemplateSettings() {
  const templateName = String(process.env.CAMPAIGN_TEMPLATE_NAME || "trend_campaign_v1").trim();
  const keysRaw = String(process.env.CAMPAIGN_TEMPLATE_PARAM_KEYS || "name").trim();
  const keys = keysRaw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  return {
    templateName: templateName || "trend_campaign_v1",
    paramKeys: keys.length > 0 ? keys : ["name"],
    languageCode: "en",
    source: "env_fallback"
  };
}

function resolveTemplateRegistry(templates = {}) {
  const parsed = parseTemplates(templates);
  if (parsed?.templates && typeof parsed.templates === "object") return parsed.templates;
  return {};
}

function resolveTemplateLanguage({ marketingTemplates, outboundTemplates, templateName }) {
  const name = String(templateName || "").trim();
  const marketingParsed = parseTemplates(marketingTemplates);
  const outboundParsed = parseTemplates(outboundTemplates);
  const marketingRegistry = resolveTemplateRegistry(marketingParsed);
  const outboundRegistry = resolveTemplateRegistry(outboundParsed);

  const fromMarketing = String(
    marketingRegistry?.[name]?.language || marketingParsed?.default_language || ""
  ).trim();
  if (fromMarketing) return fromMarketing;

  const fromOutbound = String(
    outboundRegistry?.[name]?.language || outboundParsed?.default_language || ""
  ).trim();
  if (fromOutbound) return fromOutbound;

  return "en";
}

async function loadOutboundConfig(labId) {
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

async function loadMarketingConfig(labId) {
  const { data, error } = await supabase
    .from("labs_apis")
    .select("templates")
    .eq("lab_id", labId)
    .eq("api_name", "whatsapp_marketing")
    .maybeSingle();

  if (error) {
    console.error("[campaign-whatsapp] failed to load whatsapp_marketing config", {
      labId,
      error: error.message
    });
    return null;
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

export async function resolveCampaignTemplateSettings({
  labId,
  templateName = "",
  paramKeys = []
}) {
  const fallback = fallbackTemplateSettings();
  const namedTemplate = String(templateName || "").trim();
  const explicitParamKeys = normalizeTemplateKeys(paramKeys);
  const marketingConfig = await loadMarketingConfig(labId);
  const marketingTemplates = parseTemplates(marketingConfig?.templates);
  const marketingRegistry = resolveTemplateRegistry(marketingTemplates);

  const defaultTemplateName = String(
    marketingTemplates?.default_template || fallback.templateName
  ).trim();

  const resolvedTemplateName = namedTemplate || defaultTemplateName || fallback.templateName;
  const templateMeta = marketingRegistry?.[resolvedTemplateName] || null;
  const metaParamKeys = normalizeTemplateKeys(templateMeta?.params_order);

  const resolvedParamKeys =
    explicitParamKeys.length > 0
      ? explicitParamKeys
      : metaParamKeys.length > 0
        ? metaParamKeys
        : fallback.paramKeys;

  return {
    templateName: resolvedTemplateName,
    paramKeys: resolvedParamKeys,
    languageCode: String(templateMeta?.language || "").trim() || fallback.languageCode,
    source:
      explicitParamKeys.length > 0
        ? "request_override"
        : metaParamKeys.length > 0
          ? "whatsapp_marketing"
          : fallback.source
  };
}

export async function sendCampaignTemplate({
  labId,
  phone,
  templateName,
  templateParams = [],
  sender = null
}) {
  const config = await loadOutboundConfig(labId);
  const apiKey = resolveApiKey(config.auth_details || {});
  if (!apiKey) throw new Error("WhatsApp api key missing");

  const marketingConfig = await loadMarketingConfig(labId);
  const languageCode = resolveTemplateLanguage({
    marketingTemplates: marketingConfig?.templates,
    outboundTemplates: config.templates,
    templateName
  });

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
