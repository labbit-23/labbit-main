// Pure helpers for the /marketing staff panel (no I/O, no React) so they can be unit-tested with node --test.
// All sample data in this file is fake.

export const HARD_LIMITS = { perRun: 500, daily: 5000, perMinute: 120, windowStart: "09:00", windowEnd: "20:00" };

const num = (v, d = 0) => (Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Mirrors the engine's clamping so the form shows what the server will actually accept. Returns the clamped values and which were reduced. */
export function clampLimits(input = {}) {
  const out = {
    per_run_cap: clamp(Math.floor(num(input.per_run_cap, 100)), 1, HARD_LIMITS.perRun),
    daily_cap: clamp(Math.floor(num(input.daily_cap, 1000)), 1, HARD_LIMITS.daily),
    rate_per_minute: clamp(Math.floor(num(input.rate_per_minute, 30)), 1, HARD_LIMITS.perMinute),
    cooldown_days: clamp(Math.floor(num(input.cooldown_days, 30)), 0, 365),
    window_start_hhmm: /^\d{2}:\d{2}$/.test(input.window_start_hhmm || "") ? input.window_start_hhmm : HARD_LIMITS.windowStart,
    window_end_hhmm: /^\d{2}:\d{2}$/.test(input.window_end_hhmm || "") ? input.window_end_hhmm : HARD_LIMITS.windowEnd
  };
  if (out.window_start_hhmm < HARD_LIMITS.windowStart) out.window_start_hhmm = HARD_LIMITS.windowStart;
  if (out.window_end_hhmm > HARD_LIMITS.windowEnd) out.window_end_hhmm = HARD_LIMITS.windowEnd;
  if (out.window_end_hhmm <= out.window_start_hhmm) { out.window_start_hhmm = HARD_LIMITS.windowStart; out.window_end_hhmm = HARD_LIMITS.windowEnd; }
  const clamped = [];
  if (num(input.per_run_cap, 0) > HARD_LIMITS.perRun) clamped.push("per_run_cap");
  if (num(input.daily_cap, 0) > HARD_LIMITS.daily) clamped.push("daily_cap");
  if (num(input.rate_per_minute, 0) > HARD_LIMITS.perMinute) clamped.push("rate_per_minute");
  return { limits: out, clamped };
}

// ---- audience summary shaping -------------------------------------------------------------------------------------------

/** Accepts {label: n}, [{label|package|source|key|name, count|patients|n|total}], or [[label, n]] and returns [{label, count}]. */
export function toPairs(x) {
  if (!x) return [];
  if (Array.isArray(x)) {
    return x.map((it) => (Array.isArray(it) ? { label: String(it[0]), count: num(it[1]) }
      : { label: String(it?.label ?? it?.package ?? it?.source ?? it?.key ?? it?.name ?? it?.value ?? "?"), count: num(it?.count ?? it?.patients ?? it?.n ?? it?.total ?? it?.value2) })).filter((p) => p.label !== "undefined");
  }
  if (typeof x === "object") return Object.entries(x).map(([label, v]) => ({ label, count: num(typeof v === "object" ? v?.count ?? v?.n : v) }));
  return [];
}

const FUNNEL_LABELS = {
  total: "Everyone matching the filter", matched: "Everyone matching the filter", eligible: "Eligible to message",
  opted_out: "Opted out", messaged_recently: "Messaged recently", audience_after_exclusions: "Final audience",
  invalid_phone: "No valid mobile", confidential: "Confidential source", recent_visit: "Visited recently"
};
export const funnelLabel = (k) => FUNNEL_LABELS[k] || String(k).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * Turns an audience summary into funnel steps. Real shapes:
 *  - labit-core summary: `funnel: [{step, label, removed, remaining}]` (ordered, running totals in `remaining`)
 *  - campaign dry run: `stats: { funnel: <core array>, opted_out, messaged_recently, eligible, pilot_size, audience_after_exclusions }`
 * Older/simpler shapes (`funnel: [{key|label, count}]`, or an object of removed-counts) are still understood.
 */
export function shapeFunnel(summary) {
  const s = summary || {};
  const core = Array.isArray(s.funnel) && s.funnel.some((x) => x && x.remaining != null) ? s.funnel
    : Array.isArray(s.stats?.funnel) && s.stats.funnel.some((x) => x && x.remaining != null) ? s.stats.funnel : null;
  if (core) {
    const out = core.map((st, i) => ({ key: st.step || `step${i}`, label: st.label || funnelLabel(st.step), count: num(st.remaining), removed: i === 0 ? 0 : num(st.removed), kind: i === 0 ? "start" : "step" }));
    const st = s.stats;
    if (st && typeof st === "object") {
      let running = out.length ? out[out.length - 1].count : 0;
      for (const [k, label] of [["opted_out", "Opted out (latest list)"], ["messaged_recently", "Messaged recently by another campaign"]]) {
        if (num(st[k]) > 0) { running = Math.max(0, running - num(st[k])); out.push({ key: k, label, count: running, removed: num(st[k]), kind: "step" }); }
      }
    }
    if (out.length) out[out.length - 1].kind = out.length > 1 ? "final" : "start";
    return out;
  }
  const f = s.funnel ?? s.stats ?? null;
  if (!f) return [];
  if (Array.isArray(f)) {
    const steps = toPairs(f);
    return steps.map((st, i) => ({ key: st.label, label: funnelLabel(st.label), count: st.count, removed: i === 0 ? 0 : Math.max(0, steps[i - 1].count - st.count), kind: i === 0 ? "start" : i === steps.length - 1 ? "final" : "step" }));
  }
  let start = num(f.total ?? f.matched ?? f.candidates, NaN);
  const final = num(f.audience_after_exclusions ?? f.final ?? f.eligible, NaN);
  if (!Number.isFinite(start) && Number.isFinite(final)) {
    start = final + Object.entries(f).filter(([k, v]) => typeof v === "number" && !["final", "eligible", "audience_after_exclusions", "pilot_size"].includes(k)).reduce((a, [, v]) => a + v, 0);
  }
  const skip = new Set(["total", "matched", "candidates", "final", "eligible", "audience_after_exclusions", "pilot_size"]);
  const out = [];
  let running = Number.isFinite(start) ? start : null;
  if (running != null) out.push({ key: "total", label: funnelLabel("total"), count: running, removed: 0, kind: "start" });
  for (const [k, v] of Object.entries(f)) {
    if (skip.has(k) || typeof v !== "number") continue;
    if (running != null) running = Math.max(0, running - v);
    out.push({ key: k, label: funnelLabel(k), count: running ?? 0, removed: v, kind: "step" });
  }
  if (Number.isFinite(final)) out.push({ key: "final", label: "Final audience", count: final, removed: 0, kind: "final" });
  else if (out.length) out[out.length - 1].kind = "final";
  return out;
}

/** Adds a share-of-max `pct` to each pair for drawing bars, sorted descending. */
export function withBarPct(pairs, limit = 8) {
  const sorted = [...pairs].sort((a, b) => b.count - a.count).slice(0, limit);
  const max = Math.max(1, ...sorted.map((p) => p.count));
  return sorted.map((p) => ({ ...p, pct: Math.round((p.count / max) * 100) }));
}

const ordered = (pairs) => { const max = Math.max(1, ...pairs.map((x) => x.count)); return pairs.map((p) => ({ ...p, pct: Math.round((p.count / max) * 100) })); };
const byLabel = (pairs) => [...pairs].sort((a, c) => String(a.label).localeCompare(String(c.label), "en", { numeric: true }));

/** Breakdowns of a labit-core summary (by_package, by_last_visit_year, by_visit_band, by_sex, by_age_band, by_last_source_top10, offer_tier_sample). */
export function shapeBreakdowns(summary) {
  const s = summary || {};
  const b = s.breakdowns || s.breakdown || s;
  const tier = b.offer_tier_sample || {};
  return {
    byPackage: withBarPct(toPairs(b.by_package ?? b.package ?? b.packages)),
    byYear: ordered(byLabel(toPairs(b.by_last_visit_year ?? b.last_visit_year ?? b.by_year ?? b.year))),
    byVisitBand: ordered(byLabel(toPairs(b.by_visit_band))),
    bySex: ordered(toPairs(b.by_sex)),
    byAgeBand: ordered(byLabel(toPairs(b.by_age_band))),
    bySource: withBarPct(toPairs(b.by_last_source_top10), 10),
    tiers: ordered(toPairs(tier.tiers)),
    focusAreas: withBarPct(toPairs(tier.focus_areas), 10),
    tierSample: tier.sampled != null ? { sampled: num(tier.sampled), of: num(tier.of) } : null
  };
}

export const GST_RATE = 0.18;
/** labit-core `estimate: {messages, rate_inr, cost_inr}` (ex GST) or the dry-run `cost_estimate: {messages, inr_ex_gst, inr_with_gst}`. */
export function shapeCost(summary) {
  const e = summary?.estimate;
  if (e && e.cost_inr != null) return { messages: num(e.messages, null), inrExGst: num(e.cost_inr), inrWithGst: Math.round(num(e.cost_inr) * (1 + GST_RATE)), rate: num(e.rate_inr, null) };
  const c = summary?.cost_estimate ?? summary?.cost ?? null;
  if (!c) return null;
  return { messages: num(c.messages, null), inrWithGst: c.inr_with_gst != null ? num(c.inr_with_gst) : c.inr != null ? num(c.inr) : null, inrExGst: c.inr_ex_gst != null ? num(c.inr_ex_gst) : null };
}

export const fmtInt = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString("en-IN") : "-");
export const fmtInr = (n) => (Number.isFinite(Number(n)) ? `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "-");
export const pctOf = (part, whole) => (num(whole) > 0 ? Math.round((num(part) / num(whole)) * 1000) / 10 : 0);

// ---- campaign results ---------------------------------------------------------------------------------------------------

/** Funnel rows for the results screen; each has % of "sent" (and of prepared for sent itself). */
export function shapeResultsFunnel(funnel = {}) {
  const f = funnel || {};
  const base = num(f.sent);
  const rows = [
    { key: "prepared", label: "Prepared", count: num(f.prepared), pct: null },
    { key: "sent", label: "Sent", count: num(f.sent), pct: pctOf(f.sent, f.prepared) },
    { key: "delivered", label: "Delivered", count: num(f.delivered), pct: pctOf(f.delivered, base) },
    { key: "read", label: "Read", count: num(f.read), pct: pctOf(f.read, base) },
    { key: "clicked", label: "Clicked a button", count: num(f.clicked), pct: pctOf(f.clicked, base) },
    { key: "replied", label: "Replied", count: num(f.replied), pct: pctOf(f.replied, base) },
    { key: "opted_out", label: "Opted out", count: num(f.opted_out), pct: pctOf(f.opted_out, base) },
    { key: "failed", label: "Failed", count: num(f.failed), pct: pctOf(f.failed, base) },
    { key: "skipped", label: "Skipped", count: num(f.skipped), pct: pctOf(f.skipped, f.prepared) }
  ];
  return rows;
}

const META_CODES = { "131026": "Message undeliverable (number not on WhatsApp / blocked)", "131047": "24h window closed", "131049": "Meta limited marketing to this user", "131050": "User stopped marketing messages", "131042": "Payment issue on the WhatsApp account", "132000": "Template parameter count mismatch", "132001": "Template does not exist or not approved", "132012": "Template parameter format mismatch", "130472": "User is in a Meta experiment group", "send_error": "Send error before reaching Meta" };
export const metaCodeLabel = (code) => META_CODES[String(code)] || "Other failure";
export function failureRows(results = {}) {
  const codes = { ...(results.funnel?.failed_by_code || {}), ...(results.delivery_error_codes || {}) };
  const rows = Object.entries(codes).map(([code, count]) => ({ code, count: num(count), label: metaCodeLabel(code) }));
  return rows.sort((a, b) => b.count - a.count);
}

// ---- WhatsApp bubble preview --------------------------------------------------------------------------------------------

export const SAMPLE_VALUES = {
  first_name: "Rahul", records_label: "Full Body Checkup", last_visit_date: "12 Mar 2025", lab_contact: "98xxxxxx01",
  trend_link: "app.example/t/abc", last_package: "Full Body Checkup", offer_text: "20% off on Executive Health Checkup",
  focus_areas: "liver, vitamin D", offer_code: "DIWALI20"
};

/** Splits a template body into text/variable segments so the preview can highlight substituted values. */
export function renderTemplate(template, overrides = {}) {
  const t = template || {};
  const params = t.params || [];
  const values = { ...SAMPLE_VALUES, ...overrides };
  const segs = [];
  const re = /\{\{(\d+)\}\}/g;
  const body = String(t.body || "");
  let last = 0, m;
  while ((m = re.exec(body))) {
    if (m.index > last) segs.push({ text: body.slice(last, m.index) });
    const name = params[Number(m[1]) - 1];
    const val = name != null ? values[name] : undefined;
    segs.push({ text: val != null && val !== "" ? String(val) : `{{${m[1]}}}`, variable: name || `param ${m[1]}`, missing: val == null || val === "" });
    last = m.index + m[0].length;
  }
  if (last < body.length) segs.push({ text: body.slice(last) });
  return { segments: segs, footer: t.footer || null, buttons: t.buttons || [], hasImageHeader: t.header?.type === "image", missing: segs.filter((s) => s.missing).map((s) => s.variable) };
}

export function templateSelectable(t) {
  if (!t) return { ok: false, hint: "" };
  if (t.status !== "approved") return { ok: false, hint: "Submit to Meta first - draft templates cannot start a campaign." };
  return { ok: true, hint: "" };
}

// ---- header image upload validation (shared by the route and the form) ---------------------------------------------------

export const HEADER_IMAGE = { maxBytes: 5 * 1024 * 1024, minWidth: 800, targetRatio: 1.91, ratioTolerance: 0.12, types: ["image/jpeg", "image/png"] };

/** { type, size, width, height } -> { ok, errors[], warnings[] }. Type and size are hard errors; ratio and width only warn. */
export function validateHeaderImage({ type, size, width, height } = {}) {
  const errors = [], warnings = [];
  if (!HEADER_IMAGE.types.includes(String(type || "").toLowerCase())) errors.push("Only JPEG or PNG images are accepted.");
  if (!(size > 0)) errors.push("The file is empty.");
  else if (size > HEADER_IMAGE.maxBytes) errors.push("The image is larger than 5 MB.");
  if (width && height) {
    if (width < HEADER_IMAGE.minWidth) warnings.push(`The image is ${width}px wide; at least ${HEADER_IMAGE.minWidth}px is recommended and it may look blurry.`);
    const ratio = width / height;
    if (Math.abs(ratio - HEADER_IMAGE.targetRatio) / HEADER_IMAGE.targetRatio > HEADER_IMAGE.ratioTolerance) warnings.push(`The image is ${ratio.toFixed(2)}:1; WhatsApp headers look best at about 1.91:1 (for example 1200x628). It will be cropped.`);
  } else if (!errors.length) warnings.push("Could not read the image dimensions.");
  return { ok: errors.length === 0, errors, warnings };
}

/** Reads width/height from a PNG or JPEG buffer without dependencies. Returns null if unreadable. */
export function readImageSize(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { type: "image/png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { type: "image/jpeg", height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
    return { type: "image/jpeg", width: 0, height: 0 };
  }
  return null;
}

/** SSRF guard for the reachability check: https only, no IP literals, no localhost/internal names. */
export function isCheckableImageUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return false;
  if (/(^|\.)(localhost|local|internal|lan|home|corp)$/.test(h)) return false;
  return true;
}

// ---- offers -------------------------------------------------------------------------------------------------------------

/** Non-blocking warnings shown beside an offer. `today` is YYYY-MM-DD. */
export function offerWarnings(offer, today) {
  const w = [];
  if (!offer) return w;
  if (offer.valid_to && today && offer.valid_to < today) w.push("This offer has expired.");
  else if (offer.valid_to && today) {
    const days = Math.round((Date.parse(offer.valid_to) - Date.parse(today)) / 86400000);
    if (days <= 3) w.push(`Expires in ${days} day${days === 1 ? "" : "s"}; a multi-day send may outlive it.`);
  }
  if (offer.valid_from && today && offer.valid_from > today) w.push("Not valid yet; starts " + offer.valid_from + ".");
  if (offer.valid_from && offer.valid_to && offer.valid_to < offer.valid_from) w.push("Valid-to is before valid-from.");
  if (!offer.valid_to) w.push("No end date set.");
  if (offer.discount_type === "pct" && (num(offer.value) <= 0 || num(offer.value) > 100)) w.push("Percentage must be between 1 and 100.");
  if (offer.discount_type === "flat" && num(offer.value) <= 0) w.push("Flat amount must be above zero.");
  if (!(offer.applies_to_packages || []).length) w.push("Applies to no specific package.");
  return w;
}

export function offerSummary(o) {
  if (!o) return "";
  const v = o.discount_type === "pct" ? `${o.value}% off` : `${fmtInr(o.value)} off`;
  const p = (o.applies_to_packages || []).join(", ");
  return p ? `${v} on ${p}` : v;
}

// ---- access gating (client side; the API enforces the real check) -----------------------------------------------------------

export function roleKeyOf(user) {
  if (!user) return "";
  if (user.userType === "executive") return String(user.executiveType || user.roleKey || "").toLowerCase().trim();
  return String(user.userType || user.roleKey || "").toLowerCase().trim();
}
/** Same default as MARKETING_ADMIN_ROLES. The server also honours MARKETING_ADMIN_USERS, which the browser cannot see, so a 403 from the API always wins. */
export const MARKETING_UI_ROLES = ["director", "admin"];
export function canSeeMarketing(user, roles = MARKETING_UI_ROLES) {
  return Boolean(user) && roles.includes(roleKeyOf(user));
}

// ---- guided campaign flow gating -----------------------------------------------------------------------------------------

/**
 * Which steps of the guided launch are unlocked. Inputs come from server truth only:
 *  campaign.status, recipients_by_status, audit rows (test done = a campaign.test audit row that did not fail), header check result.
 * Order: prepare(dry-run) -> prepare(store) -> test -> pilot -> send. Nothing can be skipped.
 */
export function launchGate({ status, recipients = {}, auditRows = [], dryRunDone = false, headerOk = true, needsHeader = false, pilotPrepared = false } = {}) {
  const stored = Object.values(recipients || {}).reduce((a, b) => a + num(b), 0);
  const sent = num(recipients.sent);
  const pending = num(recipients.pending) + num(recipients.prepared);
  // Same rule the server enforces: a test counts only if it delivered at least one message.
  const testDone = (auditRows || []).some((r) => r.action === "campaign.test" && r.details?.ok !== false && !(r.details?.delivered_ok === 0));
  const prepared = ["prepared", "scheduled", "running", "paused", "completed"].includes(status) && stored > 0;
  const finished = ["completed", "stopped"].includes(status);
  const headerBlock = needsHeader && !headerOk;
  const g = {
    stored, sent, pending, testDone, prepared,
    canDryRun: !finished && status !== "running",
    canPrepare: !finished && dryRunDone && !prepared && status === "draft",
    canTest: prepared && !finished && !headerBlock,
    canPilot: prepared && testDone && !finished && !headerBlock && sent === 0,
    canSend: prepared && testDone && sent > 0 && !finished && !headerBlock && pending > 0,
    // A pilot that has been fully sent is "completed"; it can still be widened once (the server checks config.pilot_prepared).
    canExpand: prepared && testDone && sent > 0 && status !== "stopped" && pending === 0 && (status !== "completed" || Boolean(pilotPrepared)),
    blockedByHeader: headerBlock && prepared
  };
  return g;
}

export function confirmMatches(typed, count) {
  const digits = String(typed || "").replace(/[^\d]/g, "");
  return digits !== "" && Number(digits) === Number(count) && Number(count) > 0;
}

export function sendProgress({ stored = 0, sent = 0, failed = 0, skipped = 0 } = {}) {
  const done = num(sent) + num(failed) + num(skipped);
  return { done, total: num(stored), pct: pctOf(done, stored) };
}

export const todayIst = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
export function fmtDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }).format(d);
}
export function fmtRemaining(ms) {
  if (!(ms > 0)) return "closed";
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h ? `${h}h ${m}m left` : `${m}m left`;
}

// ---- audience filter form <-> filter object ------------------------------------------------------------------------------
// Keys are labit-core's AudienceFilters (labit-core docs/campaign-audience.md) and are what lib/marketingCampaigns/audienceClient.js
// validateFilter accepts. Empty fields are omitted so the engine applies no restriction for them.

const splitList = (s) => String(s || "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
const joinList = (a) => (Array.isArray(a) ? a.join(", ") : "");

/** focus_keys of campaign_focus_service.FOCUS_GROUPS that may be filtered on (the sensitive groups are never offered). */
export const FOCUS_AREA_OPTIONS = [
  ["thyroid", "Thyroid"], ["glycaemic", "Blood sugar"], ["lipids", "Cholesterol & lipids"], ["liver", "Liver"], ["kidney", "Kidney"],
  ["vitamins", "Vitamin D / B12"], ["haemogram", "Blood count"], ["iron", "Iron stores"], ["inflammation", "Inflammation"]
];
export const OFFER_TIER_OPTIONS = [["none", "None"], ["standard", "Standard"], ["priority", "Priority"]];

const LIST_FIELDS = ["package_ids", "package_names", "exclude_package_ids", "pincode_prefixes", "include_sources", "exclude_sources"];
const DATE_FIELDS = ["package_last_before", "package_last_after", "last_visit_before", "last_visit_after", "first_visit_before", "first_visit_after"];
const INT_FIELDS = ["min_visits", "max_visits", "months_since_last_visit_min", "months_since_last_visit_max", "age_min", "age_max", "max_audience"];
const FORM_KEYS = ["segment", "genpackage", "sex", "source_scope", "sample_seed", "focus_areas_any", "offer_tier_in", ...LIST_FIELDS, ...DATE_FIELDS, ...INT_FIELDS];

export const EMPTY_FILTER_FORM = {
  segment: "", genpackage: "", sex: "", source_scope: "",
  package_names: "", package_ids: "", exclude_package_ids: "", package_last_before: "", package_last_after: "",
  last_visit_before: "", last_visit_after: "", first_visit_before: "", first_visit_after: "",
  months_since_last_visit_min: "", months_since_last_visit_max: "", min_visits: "", max_visits: "",
  age_min: "", age_max: "", pincode_prefixes: "", include_sources: "", exclude_sources: "",
  focus_areas_any: [], offer_tier_in: [], max_audience: "", sample_seed: "", advanced: ""
};

const BOUNDS = { min_visits: [1, 500], max_visits: [1, 500], months_since_last_visit_min: [0, 600], months_since_last_visit_max: [0, 600], age_min: [0, 120], age_max: [0, 120], max_audience: [1, 200000] };

/** Form values -> AudienceFilters. Returns { filter, error }. */
export function buildFilter(form = {}) {
  const f = {};
  if (form.segment) f.segment = form.segment;
  if (form.genpackage === "true") f.genpackage = true;
  else if (form.genpackage === "false") f.genpackage = false;
  if (form.sex) f.sex = form.sex;
  if (form.source_scope) f.source_scope = form.source_scope;
  for (const k of LIST_FIELDS) { const v = splitList(form[k]); if (v.length) f[k] = v; }
  for (const k of DATE_FIELDS) if (form[k]) f[k] = form[k];
  for (const k of INT_FIELDS) {
    if (form[k] === "" || form[k] == null) continue;
    const n = Number(form[k]);
    if (!Number.isInteger(n)) return { filter: f, error: `${k.replace(/_/g, " ")} must be a whole number.` };
    const [lo, hi] = BOUNDS[k];
    if (n < lo || n > hi) return { filter: f, error: `${k.replace(/_/g, " ")} must be between ${lo} and ${hi}.` };
    f[k] = n;
  }
  if (Array.isArray(form.focus_areas_any) && form.focus_areas_any.length) f.focus_areas_any = [...form.focus_areas_any];
  if (Array.isArray(form.offer_tier_in) && form.offer_tier_in.length) f.offer_tier_in = [...form.offer_tier_in];
  if (String(form.sample_seed || "").trim()) f.sample_seed = String(form.sample_seed).trim();
  const pair = (a, b, msg) => (f[a] != null && f[b] != null && f[a] > f[b] ? msg : null);
  const dpair = (a, b, msg) => (f[a] && f[b] && f[a] > f[b] ? msg : null);
  const bad = pair("min_visits", "max_visits", "Maximum visits is below minimum visits.")
    || pair("age_min", "age_max", "Maximum age is below minimum age.")
    || pair("months_since_last_visit_min", "months_since_last_visit_max", "'Months since last visit: at least' cannot be larger than 'at most'.")
    || dpair("last_visit_after", "last_visit_before", "'Visited after' is later than 'visited before'.")
    || dpair("package_last_after", "package_last_before", "'Package bought after' is later than 'bought before'.")
    || dpair("first_visit_after", "first_visit_before", "'First visit after' is later than 'first visit before'.");
  if (bad) return { filter: f, error: bad };
  if (String(form.advanced || "").trim()) {
    try {
      const extra = JSON.parse(form.advanced);
      if (!extra || typeof extra !== "object" || Array.isArray(extra)) throw new Error("not an object");
      Object.assign(f, extra);
    } catch { return { filter: f, error: "Advanced JSON is not a valid object." }; }
  }
  return { filter: f, error: null };
}

/** Saved filter -> form values (keys the form has no field for go to the advanced JSON box so nothing is lost on edit). */
export function filterToForm(filter = {}) {
  const fl = filter || {};
  const rest = Object.fromEntries(Object.entries(fl).filter(([k]) => !FORM_KEYS.includes(k)));
  const form = { ...EMPTY_FILTER_FORM };
  for (const k of ["segment", "sex", "source_scope", "sample_seed"]) form[k] = fl[k] ?? "";
  form.genpackage = fl.genpackage === true ? "true" : fl.genpackage === false ? "false" : "";
  for (const k of LIST_FIELDS) form[k] = joinList(fl[k]);
  for (const k of DATE_FIELDS) form[k] = fl[k] || "";
  for (const k of INT_FIELDS) form[k] = fl[k] ?? "";
  form.focus_areas_any = Array.isArray(fl.focus_areas_any) ? [...fl.focus_areas_any] : [];
  form.offer_tier_in = Array.isArray(fl.offer_tier_in) ? [...fl.offer_tier_in] : [];
  form.advanced = Object.keys(rest).length ? JSON.stringify(rest) : "";
  return form;
}

export function describeFilter(filter = {}) {
  const f = filter || {};
  const bits = [];
  if (f.segment && f.segment !== "all") bits.push(f.segment === "package" ? "package buyers" : f.segment);
  if (f.package_names?.length) bits.push(`packages: ${f.package_names.join(", ")}`);
  if (f.package_ids?.length) bits.push(`package ids: ${f.package_ids.join(", ")}`);
  if (f.genpackage === true) bits.push("general health-check packages");
  if (f.genpackage === false) bits.push("condition-specific packages");
  if (f.exclude_package_ids?.length) bits.push(`excluding ${f.exclude_package_ids.join(", ")}`);
  if (f.last_visit_before) bits.push(`last visit before ${f.last_visit_before}`);
  if (f.last_visit_after) bits.push(`last visit on/after ${f.last_visit_after}`);
  if (f.months_since_last_visit_min != null) bits.push(`last visit at least ${f.months_since_last_visit_min} months ago`);
  if (f.months_since_last_visit_max != null) bits.push(`last visit within ${f.months_since_last_visit_max} months`);
  if (f.min_visits != null || f.max_visits != null) bits.push(`visits ${f.min_visits ?? 1}-${f.max_visits ?? "any"}`);
  if (f.sex) bits.push(f.sex === "F" ? "women" : "men");
  if (f.age_min != null || f.age_max != null) bits.push(`age ${f.age_min ?? 0}-${f.age_max ?? "any"}`);
  if (f.pincode_prefixes?.length) bits.push(`pincode ${f.pincode_prefixes.join("/")}`);
  if (f.include_sources?.length) bits.push(`only sources ${f.include_sources.join(", ")}`);
  if (f.exclude_sources?.length) bits.push(`not sources ${f.exclude_sources.join(", ")}`);
  if (f.focus_areas_any?.length) bits.push(`focus: ${f.focus_areas_any.join("/")}`);
  if (f.offer_tier_in?.length) bits.push(`tier: ${f.offer_tier_in.join("/")}`);
  if (f.max_audience != null) bits.push(`max ${f.max_audience}${f.sample_seed ? " (random sample)" : ""}`);
  return bits.join("; ") || "Everyone";
}

// ---- offer form <-> API body ---------------------------------------------------------------------------------------------

export const EMPTY_OFFER = { name: "", discount_type: "pct", value: "", packages: "", valid_from: "", valid_to: "", code: "", terms: "", tiers: [] };
export function offerFormToBody(f) {
  const tier_map = {};
  for (const t of f.tiers || []) {
    const key = String(t.tier || "").trim();
    if (!key) continue;
    tier_map[key] = { ...(t.value !== "" && t.value != null ? { value: Number(t.value) } : {}), ...(String(t.text || "").trim() ? { text: String(t.text).trim() } : {}) };
  }
  return {
    name: f.name.trim(), discount_type: f.discount_type, value: Number(f.value), applies_to_packages: splitList(f.packages),
    valid_from: f.valid_from || null, valid_to: f.valid_to || null, code: f.code.trim(), terms: f.terms.trim(), tier_map
  };
}
export function offerToForm(o = {}) {
  return {
    name: o.name || "", discount_type: o.discount_type || "pct", value: o.value ?? "", packages: (o.applies_to_packages || []).join(", "),
    valid_from: o.valid_from || "", valid_to: o.valid_to || "", code: o.code || "", terms: o.terms || "",
    tiers: Object.entries(o.tier_map || {}).map(([tier, t]) => ({ tier, value: t.value ?? "", text: t.text || "" }))
  };
}
