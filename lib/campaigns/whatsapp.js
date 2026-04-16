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

function asText(value) {
  return String(value ?? "").trim();
}

function parseDateToEnIn(value) {
  const raw = asText(value);
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function getPathValue(source, path) {
  const key = asText(path);
  if (!key || !source || typeof source !== "object") return undefined;
  const parts = key.split(".").map((part) => asText(part)).filter(Boolean);
  let current = source;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function applyTransform(value, transform) {
  const mode = asText(transform).toLowerCase();
  if (!mode) return value;

  if (mode === "trim") return asText(value);
  if (mode === "lowercase") return asText(value).toLowerCase();
  if (mode === "uppercase") return asText(value).toUpperCase();
  if (mode === "phone_last10") return asText(value).replace(/\D+/g, "").slice(-10);
  if (mode === "date_en_in") return parseDateToEnIn(value);
  return value;
}

function resolveApiKey(authDetails = {}) {
  return (
    authDetails.api_key ||
    authDetails.apikey ||
    authDetails.apiKey ||
    ""
  ).toString();
}

function normalizeTemplateParams(rawParams) {
  if (!Array.isArray(rawParams)) return [];

  return rawParams.map((row, index) => {
    const item = row && typeof row === "object" ? row : {};
    const name = asText(item.name || `p${index + 1}`);
    const field = asText(item.field || item.source_field || "");
    const aliases = Array.isArray(item.aliases)
      ? item.aliases.map((alias) => asText(alias)).filter(Boolean)
      : [];
    const required = item.required === undefined ? true : Boolean(item.required);
    const fallback = item.default ?? item.fallback ?? "";
    const transform = asText(item.transform || "");
    const constantValue = item.value ?? item.constant ?? null;

    return {
      name: name || `p${index + 1}`,
      field,
      aliases,
      required,
      fallback,
      transform,
      constantValue
    };
  });
}

async function loadOutboundConfig(labId) {
  const { data, error } = await supabase
    .from("labs_apis")
    .select("base_url, auth_details")
    .eq("lab_id", labId)
    .eq("api_name", "whatsapp_outbound")
    .single();

  if (error || !data) {
    throw new Error("WhatsApp outbound config missing for campaign");
  }

  const baseUrl = asText(data.base_url);
  if (!baseUrl) throw new Error("WhatsApp outbound base_url missing");

  return data;
}

async function loadMarketingConfig(labId) {
  const { data, error } = await supabase
    .from("labs_apis")
    .select("templates")
    .eq("lab_id", labId)
    .eq("api_name", "whatsapp_marketing")
    .single();

  if (error || !data) {
    throw new Error("whatsapp_marketing config missing for campaign");
  }
  return data;
}

export async function resolveCampaignTemplateSettings({ labId, templateName = "" }) {
  const marketingConfig = await loadMarketingConfig(labId);
  const templates = parseTemplates(marketingConfig?.templates);
  const registry = templates?.templates && typeof templates.templates === "object" ? templates.templates : {};

  const requestedName = asText(templateName);
  const defaultTemplate = asText(templates?.default_template);
  const resolvedTemplateName = requestedName || defaultTemplate;
  if (!resolvedTemplateName) {
    throw new Error("whatsapp_marketing.default_template is missing");
  }

  const templateMetaRaw = registry?.[resolvedTemplateName];
  if (!templateMetaRaw || typeof templateMetaRaw !== "object") {
    throw new Error(`Template '${resolvedTemplateName}' missing in whatsapp_marketing.templates`);
  }

  const templateMeta = templateMetaRaw;
  const resolvedApiTemplateName =
    asText(templateMeta.template_name) || resolvedTemplateName;
  const languageCode =
    asText(templateMeta.language) ||
    asText(templates?.default_language) ||
    "en";
  const params = normalizeTemplateParams(templateMeta.params);

  if (params.length === 0) {
    throw new Error(`Template '${resolvedTemplateName}' has no params[] mapping`);
  }

  return {
    templateName: resolvedApiTemplateName,
    templateKey: resolvedTemplateName,
    languageCode,
    params
  };
}

export function inspectRecipientTemplateParams({ recipient, templateSettings }) {
  const context = recipient && typeof recipient === "object" ? recipient : {};
  const params = Array.isArray(templateSettings?.params) ? templateSettings.params : [];
  const missing = [];
  const resolved = [];

  const values = params.map((param, index) => {
    let rawValue = param.constantValue;

    if (rawValue == null) {
      rawValue = getPathValue(context, param.field);
    }
    if (rawValue == null && Array.isArray(param.aliases)) {
      for (const alias of param.aliases) {
        rawValue = getPathValue(context, alias);
        if (rawValue != null) break;
      }
    }
    if (rawValue == null || asText(rawValue) === "") {
      rawValue = param.fallback;
    }

    const transformed = applyTransform(rawValue, param.transform);
    const text = asText(transformed);
    resolved.push({
      position: index + 1,
      name: param.name,
      field: param.field,
      required: param.required,
      transform: param.transform || null,
      value: text
    });
    if (param.required && !text) {
      missing.push({
        position: index + 1,
        name: param.name,
        field: param.field
      });
    }
    return text;
  });

  return {
    values,
    missing,
    resolved,
    ok: missing.length === 0
  };
}

export function resolveRecipientTemplateParams({ recipient, templateSettings }) {
  const inspected = inspectRecipientTemplateParams({ recipient, templateSettings });
  if (!inspected.ok) {
    const first = inspected.missing[0];
    throw new Error(
      `Missing required template param '${first?.name || "unknown"}' at position ${first?.position || "?"}`
    );
  }
  return inspected.values;
}

export async function sendCampaignTemplate({
  labId,
  phone,
  templateName,
  languageCode = "en",
  templateParams = [],
  sender = null
}) {
  const config = await loadOutboundConfig(labId);
  const apiKey = resolveApiKey(config.auth_details || {});
  if (!apiKey) throw new Error("WhatsApp api key missing");

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: asText(languageCode) || "en" },
      components: [
        {
          type: "body",
          parameters: (templateParams || []).map((value) => ({
            type: "text",
            text: asText(value)
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
