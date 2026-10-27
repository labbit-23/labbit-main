// The ONLY module that talks to labit-core for campaign audiences (labit-core docs/campaign-audience.md, header X-Internal-Token = CAMPAIGN_AUDIENCE_TOKEN).
//
//   POST /internal/campaign-audience/query    body AudienceFilters  ?link_valid_days=  -> { total, funnel, rows }   (rows are PII: server-side only)
//   POST /internal/campaign-audience/summary  body AudienceFilters                      -> aggregates only
//   GET  /internal/campaign-audience?segment=package|inactive...                        -> legacy typed segments (unchanged)
// Unknown filter names are a 422 in labit-core, so they are rejected here first (validateFilter).

const CORE_BASE = () =>
  String(process.env.LABIT_CORE_BASE_URL || process.env.LABIT_CORE_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

// The AudienceFilters schema (labit-core app/services/campaign_audience_engine.py). Keep in sync.
const LIST_KEYS = ["package_ids", "package_names", "exclude_package_ids", "pincode_prefixes", "include_sources", "exclude_sources", "exclude_mrns", "exclude_phones", "focus_areas_any", "offer_tier_in"];
const DATE_KEYS = ["package_last_before", "package_last_after", "last_visit_before", "last_visit_after", "first_visit_before", "first_visit_after", "activity_since"];
const INT_KEYS = ["min_visits", "max_visits", "months_since_last_visit_min", "months_since_last_visit_max", "age_min", "age_max", "cooldown_days", "max_audience"];
// Filled in by labit-main from Supabase on every call; staff cannot set them in a segment.
const ENGINE_KEYS = ["opted_out_phones", "messaged", "include_focus", "per_message_rate_inr"];
export const FILTER_KEYS = [
  "segment", "genpackage", "sex", "source_scope", "sample_seed",
  ...LIST_KEYS, ...DATE_KEYS, ...INT_KEYS, ...ENGINE_KEYS
];
const TIERS = ["none", "standard", "priority"];

/** Client-side check so a typo fails clearly before the network call. Returns an array of messages. */
export function validateFilter(filter) {
  if (!filter || typeof filter !== "object" || Array.isArray(filter)) return ["filter must be a JSON object"];
  const errors = [];
  for (const [k, v] of Object.entries(filter)) {
    if (!FILTER_KEYS.includes(k)) { errors.push(`unknown filter field: ${k}`); continue; }
    if (ENGINE_KEYS.includes(k)) { errors.push(`${k} is set by the engine, remove it from the segment`); continue; }
    if (v === null || v === undefined) continue;
    if (LIST_KEYS.includes(k) && !Array.isArray(v)) errors.push(`${k} must be a list`);
    if (DATE_KEYS.includes(k) && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) errors.push(`${k} must be YYYY-MM-DD`);
    if (INT_KEYS.includes(k) && !Number.isInteger(Number(v))) errors.push(`${k} must be a whole number`);
    if (k === "segment" && !["all", "package", "inactive"].includes(v)) errors.push("segment must be all, package or inactive");
    if (k === "sex" && !["M", "F"].includes(v)) errors.push("sex must be M or F");
    if (k === "source_scope" && !["ever", "last"].includes(v)) errors.push("source_scope must be ever or last");
    if (k === "genpackage" && typeof v !== "boolean") errors.push("genpackage must be true or false");
    if (k === "offer_tier_in" && Array.isArray(v) && v.some((t) => !TIERS.includes(t))) errors.push(`offer_tier_in values must be ${TIERS.join(", ")}`);
  }
  return errors;
}

/** True when the filter itself needs focus/offer data (core then scans lab results, and refuses > 20,000 rows). */
export function filterNeedsFocus(filter) {
  return Boolean(filter && ((filter.focus_areas_any || []).length || (filter.offer_tier_in || []).length));
}

const PII_KEYS = new Set(["phone", "mobile", "phone10", "name", "patient_name", "mrn", "mrno", "email", "address", "summary_token", "link_token"]);

/** Recursively drops patient identifiers so a preview can never carry them to the browser. */
export function scrubPii(value) {
  if (Array.isArray(value)) return value.map(scrubPii);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (!PII_KEYS.has(k.toLowerCase())) out[k] = scrubPii(v);
    return out;
  }
  return value;
}

function token() {
  const t = String(process.env.CAMPAIGN_AUDIENCE_TOKEN || "").trim();
  if (!t) throw new Error("CAMPAIGN_AUDIENCE_TOKEN is not configured");
  return t;
}

function detailText(body, status) {
  const d = body?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => `${(e.loc || []).slice(-1)[0] || "filter"}: ${e.msg}`).join("; ");
  return `labit-core audience returned ${status}`;
}

async function request(method, path, { qs = null, body = null, timeoutMs }) {
  const res = await fetch(`${CORE_BASE()}${path}${qs && String(qs) ? `?${qs}` : ""}`, {
    method,
    headers: { Accept: "application/json", "X-Internal-Token": token(), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(detailText(json, res.status));
  return json;
}

/** The body labit-core receives: staff filter + the exclusions only labit-main knows (opt-outs, recent sends) + output controls. */
export function buildQueryBody(filter, { optedOutPhones = [], messaged = [], cooldownDays = null, maxAudience = null, sampleSeed = null, includeFocus = false, ratePerMessageInr = null } = {}) {
  const { opted_out_phones, messaged: _m, include_focus, per_message_rate_inr, ...rest } = filter || {};
  return {
    ...rest,
    opted_out_phones: optedOutPhones,
    messaged,
    ...(cooldownDays != null ? { cooldown_days: cooldownDays } : {}),
    ...(maxAudience ? { max_audience: maxAudience, ...(sampleSeed ? { sample_seed: String(sampleSeed) } : {}) } : {}),
    ...(includeFocus || filterNeedsFocus(filter) ? { include_focus: true } : {}),
    ...(ratePerMessageInr != null ? { per_message_rate_inr: ratePerMessageInr } : {})
  };
}

/** Legacy typed segments still use the old GET. */
export function legacyQuery(segment, linkValidDays) {
  const qs = new URLSearchParams({ segment: segment.type, min_visits: String(segment.min_visits ?? 1) });
  if (segment.last_visit_before) qs.set("last_visit_before", segment.last_visit_before);
  if (segment.last_visit_after) qs.set("last_visit_after", segment.last_visit_after);
  if (linkValidDays) qs.set("link_valid_days", String(linkValidDays));
  return qs;
}

/** -> { stats:{total, funnel, ...}, rows } for both the filter and the legacy form. */
export async function fetchAudienceRows(segment, { linkValidDays = null, ...ctx } = {}) {
  if (segment?.filter && typeof segment.filter === "object") {
    const errors = validateFilter(segment.filter);
    if (errors.length) throw new Error(errors.join("; "));
    const qs = new URLSearchParams();
    if (linkValidDays) qs.set("link_valid_days", String(linkValidDays));
    const body = await request("POST", "/internal/campaign-audience/query", { qs, body: buildQueryBody(segment.filter, ctx), timeoutMs: 150000 });
    return { stats: { total: body.total, funnel: body.funnel }, rows: body.rows || [] };
  }
  return request("GET", "/internal/campaign-audience", { qs: legacyQuery(segment, linkValidDays), timeoutMs: 150000 });
}

/** Aggregates only; scrubbed again here as defence in depth. */
export async function fetchAudienceSummary(filter, ctx = {}) {
  const errors = validateFilter(filter);
  if (errors.length) throw new Error(errors.join("; "));
  const body = await request("POST", "/internal/campaign-audience/summary", { body: buildQueryBody(filter, ctx), timeoutMs: 60000 });
  delete body.rows;
  return scrubPii(body);
}
