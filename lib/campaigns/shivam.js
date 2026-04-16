import { toCanonicalIndiaPhone } from "@/lib/phone";
import { supabase } from "@/lib/supabaseServer";

function ensureUrl(value, label) {
  const url = String(value || "").trim();
  if (!url) throw new Error(`${label} is not configured`);
  return url;
}

function withQuery(baseUrl, filters = {}) {
  const url = new URL(baseUrl);
  const mapping = {
    inactiveSince: "inactive_since",
    fromDate: "from_date",
    toDate: "to_date",
    locationId: "location_id",
    cutoffDate: "cutoff_date",
    newCentreStartDate: "new_centre_start_date",
    limit: "limit",
    cursor: "cursor"
  };

  for (const [sourceKey, queryKey] of Object.entries(mapping)) {
    const value = filters?.[sourceKey];
    const text = String(value ?? "").trim();
    if (!text) continue;
    url.searchParams.set(queryKey, text);
  }

  return url.toString();
}

function resolveEndpoint(segmentType) {
  return String(segmentType || "").trim().toLowerCase();
}

function parseJson(value) {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return typeof value === "object" ? value : {};
}

function isAbsoluteUrl(value) {
  const text = String(value || "").trim();
  return /^https?:\/\//i.test(text);
}

function joinUrl(baseUrl, path) {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  const next = String(path || "").trim();
  if (!next) return base;
  if (isAbsoluteUrl(next)) return next;
  return `${base}/${next.replace(/^\/+/, "")}`;
}

function resolveAuthHeaders(authDetails = {}) {
  const token = String(
    authDetails.bearer_token ||
    authDetails.token ||
    authDetails.access_token ||
    ""
  ).trim();
  const apiKey = String(
    authDetails.api_key ||
    authDetails.apikey ||
    authDetails.apiKey ||
    ""
  ).trim();

  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (apiKey) headers["X-API-KEY"] = apiKey;
  return headers;
}

async function loadShivamMarketingConfig(labId) {
  const { data, error } = await supabase
    .from("labs_apis")
    .select("base_url, auth_details, templates")
    .eq("lab_id", labId)
    .eq("api_name", "shivam_marketing")
    .single();

  if (error || !data) {
    throw new Error("shivam_marketing config missing in labs_apis");
  }
  return data;
}

function resolveSegmentEndpoint({ baseUrl, templates, segmentType }) {
  const key = resolveEndpoint(segmentType);
  if (!key) throw new Error("segment_type is required");

  const parsed = parseJson(templates);
  const endpoints =
    parsed?.segment_endpoints && typeof parsed.segment_endpoints === "object"
      ? parsed.segment_endpoints
      : {};
  const rawEndpoint = String(endpoints?.[key] || "").trim();
  if (!rawEndpoint) {
    throw new Error(`Segment endpoint missing for '${key}' in shivam_marketing.templates.segment_endpoints`);
  }

  if (isAbsoluteUrl(rawEndpoint)) return rawEndpoint;
  return joinUrl(ensureUrl(baseUrl, "shivam_marketing.base_url"), rawEndpoint);
}

function resolveQueryDefaults(templates = {}) {
  const parsed = parseJson(templates);
  const defaults = parsed?.query_defaults && typeof parsed.query_defaults === "object"
    ? parsed.query_defaults
    : {};
  return defaults;
}

function pickFirstText(row, keys = []) {
  for (const key of keys) {
    const value = row?.[key];
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function normalizePatientRow(row) {
  const sourceRow = row && typeof row === "object" ? row : {};
  const name = pickFirstText(sourceRow, ["name", "patient_name", "patientnm", "patient"]);
  const mobileRaw = row?.mobile || row?.phone || row?.whatsapp || "";
  const mobile = toCanonicalIndiaPhone(mobileRaw);
  const mrno = pickFirstText(sourceRow, ["mrno", "MRNO", "mrn", "MRN"]);
  const lastHealthCheckup =
    row?.last_health_checkup ||
    row?.last_checkup ||
    row?.last_visit_at ||
    row?.last_visit_date ||
    row?.last_report_date ||
    row?.reqdt ||
    row?.REQDT ||
    null;
  const lastReqNo = pickFirstText(sourceRow, ["reqno", "REQNO"]);
  const lastReqId = pickFirstText(sourceRow, ["reqid", "REQID"]);
  const packageName = pickFirstText(sourceRow, [
    "package_name",
    "package",
    "package_nm",
    "packageName",
    "test_package",
    "health_package"
  ]);
  const contactNumber = pickFirstText(sourceRow, [
    "contact_number",
    "contact_phone",
    "lab_contact_number",
    "support_number",
    "helpline"
  ]);

  if (!mobile) return null;

  return {
    name: name || "Patient",
    mobile,
    mrno: mrno || null,
    last_health_checkup: lastHealthCheckup ? String(lastHealthCheckup) : null,
    last_reqno: lastReqNo || null,
    last_reqid: lastReqId || null,
    package_name: packageName || null,
    contact_number: contactNumber || null,
    source_fields: sourceRow
  };
}

export async function fetchCampaignPatients({
  labId,
  segmentType,
  inactiveSince,
  fromDate,
  toDate,
  locationId,
  cutoffDate,
  newCentreStartDate,
  limit,
  cursor
}) {
  const config = await loadShivamMarketingConfig(labId);
  const queryDefaults = resolveQueryDefaults(config?.templates);
  const endpoint = resolveSegmentEndpoint({
    baseUrl: config?.base_url,
    templates: config?.templates,
    segmentType
  });
  const url = withQuery(endpoint, {
    inactiveSince: inactiveSince || queryDefaults?.inactive_since || "",
    fromDate: fromDate || queryDefaults?.from_date || "",
    toDate: toDate || queryDefaults?.to_date || "",
    locationId: locationId || queryDefaults?.location_id || "",
    cutoffDate: cutoffDate || queryDefaults?.cutoff_date || "",
    newCentreStartDate: newCentreStartDate || queryDefaults?.new_centre_start_date || "",
    limit: limit || queryDefaults?.limit || "",
    cursor: cursor || ""
  });

  const res = await fetch(url, {
    method: "GET",
    headers: resolveAuthHeaders(parseJson(config?.auth_details)),
    cache: "no-store"
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shivam patients fetch failed: ${res.status} ${text}`);
  }

  const body = await res.json();
  const sourceRows = Array.isArray(body) ? body : Array.isArray(body?.patients) ? body.patients : [];

  return sourceRows
    .map(normalizePatientRow)
    .filter(Boolean);
}
