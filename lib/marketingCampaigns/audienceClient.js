// The ONLY module that talks to labit-core for campaign audiences. If labit-core's contract changes, adapt here.
//
//   GET {CORE}/internal/campaign-audience?filter=<json>[&link_valid_days=N]   -> { stats, rows:[{phone,mrn,name,last_visit,last_package,
//                                                                                 focus_areas,normal_areas,offer_tier,summary_token?}] }
//   GET {CORE}/internal/campaign-audience/summary?filter=<json>               -> aggregates only (funnel, breakdowns, cost estimate, anonymised sample)
// A "filter" is a JSON object passed through verbatim. The legacy {type:"package"|"inactive", ...} segments keep the old query-string form.
// Auth header X-Internal-Token = CAMPAIGN_AUDIENCE_TOKEN.

const CORE_BASE = () =>
  String(process.env.LABIT_CORE_BASE_URL || process.env.LABIT_CORE_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

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

async function getJson(path, qs, timeoutMs) {
  const res = await fetch(`${CORE_BASE()}${path}?${qs}`, {
    headers: { Accept: "application/json", "X-Internal-Token": token() },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.detail || `labit-core audience returned ${res.status}`);
  return body;
}

/** Query string for either a composable filter (cfg.segment.filter) or a legacy typed segment. */
export function audienceQuery(segment, linkValidDays) {
  const qs = new URLSearchParams();
  if (segment?.filter && typeof segment.filter === "object") {
    qs.set("filter", JSON.stringify(segment.filter));
  } else {
    qs.set("segment", segment.type);
    qs.set("min_visits", String(segment.min_visits ?? 1));
    if (segment.last_visit_before) qs.set("last_visit_before", segment.last_visit_before);
    if (segment.last_visit_after) qs.set("last_visit_after", segment.last_visit_after);
  }
  if (linkValidDays) qs.set("link_valid_days", String(linkValidDays));
  return qs;
}

export async function fetchAudienceRows(segment, { linkValidDays = null } = {}) {
  return getJson("/internal/campaign-audience", audienceQuery(segment, linkValidDays), 150000);
}

/** Aggregates only; scrubbed again here as defence in depth. */
export async function fetchAudienceSummary(filter) {
  const qs = new URLSearchParams({ filter: JSON.stringify(filter && typeof filter === "object" ? filter : {}) });
  const body = await getJson("/internal/campaign-audience/summary", qs, 60000);
  delete body.rows;
  return scrubPii(body);
}
