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

/** Accepts {label: n}, [{label|key|name, count|n|value}], or [[label, n]] and returns [{label, count}]. */
export function toPairs(x) {
  if (!x) return [];
  if (Array.isArray(x)) {
    return x.map((it) => (Array.isArray(it) ? { label: String(it[0]), count: num(it[1]) }
      : { label: String(it?.label ?? it?.key ?? it?.name ?? it?.value ?? "?"), count: num(it?.count ?? it?.n ?? it?.total ?? it?.value2) })).filter((p) => p.label !== "undefined");
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
 * Turns an audience summary (labit-core aggregates, or a dry-run `stats` object) into funnel steps:
 * the first step is the starting total, every later step shows how many it removed. Steps arrive as an ordered
 * array `funnel: [{key|label, count}]` (running totals) or as an object {total, <exclusion>: removed...}.
 */
export function shapeFunnel(summary) {
  const s = summary || {};
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

export function shapeBreakdowns(summary) {
  const s = summary || {};
  const b = s.breakdowns || s.breakdown || s;
  return {
    byPackage: withBarPct(toPairs(b.by_package ?? b.package ?? b.packages)),
    byYear: toPairs(b.by_last_visit_year ?? b.last_visit_year ?? b.by_year ?? b.year).sort((a, c) => String(a.label).localeCompare(String(c.label))).map((p, _i, all) => ({ ...p, pct: Math.round((p.count / Math.max(1, ...all.map((x) => x.count))) * 100) }))
  };
}

export function shapeCost(summary) {
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
export function launchGate({ status, recipients = {}, auditRows = [], dryRunDone = false, headerOk = true, needsHeader = false } = {}) {
  const stored = Object.values(recipients || {}).reduce((a, b) => a + num(b), 0);
  const sent = num(recipients.sent);
  const pending = num(recipients.pending) + num(recipients.prepared);
  const testDone = (auditRows || []).some((r) => r.action === "campaign.test" && r.details?.ok !== false);
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
    canExpand: prepared && testDone && sent > 0 && !finished && pending === 0 || false,
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

const splitList = (s) => String(s || "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
export const EMPTY_FILTER_FORM = { packages: "", exclude_packages: "", last_visit_before: "", last_visit_after: "", min_visits: "", max_visits: "", advanced: "" };

/** Form values -> opaque filter JSON for labit-core. Empty fields are omitted. Returns { filter, error }. */
export function buildFilter(form = {}) {
  const f = {};
  const pk = splitList(form.packages); if (pk.length) f.packages = pk;
  const ex = splitList(form.exclude_packages); if (ex.length) f.exclude_packages = ex;
  if (form.last_visit_before) f.last_visit_before = form.last_visit_before;
  if (form.last_visit_after) f.last_visit_after = form.last_visit_after;
  if (form.min_visits !== "" && form.min_visits != null) f.min_visits = Math.max(1, Math.floor(num(form.min_visits, 1)));
  if (form.max_visits !== "" && form.max_visits != null) f.max_visits = Math.max(1, Math.floor(num(form.max_visits, 1)));
  if (f.min_visits && f.max_visits && f.max_visits < f.min_visits) return { filter: f, error: "Maximum visits is below minimum visits." };
  if (f.last_visit_before && f.last_visit_after && f.last_visit_after > f.last_visit_before) return { filter: f, error: "'Visited after' is later than 'visited before'." };
  if (String(form.advanced || "").trim()) {
    try {
      const extra = JSON.parse(form.advanced);
      if (!extra || typeof extra !== "object" || Array.isArray(extra)) throw new Error("not an object");
      Object.assign(f, extra);
    } catch { return { filter: f, error: "Advanced JSON is not a valid object." }; }
  }
  return { filter: f, error: null };
}

/** Saved filter -> form values (unknown keys go to the advanced JSON box so nothing is lost on edit). */
export function filterToForm(filter = {}) {
  const known = ["packages", "exclude_packages", "last_visit_before", "last_visit_after", "min_visits", "max_visits"];
  const rest = Object.fromEntries(Object.entries(filter || {}).filter(([k]) => !known.includes(k)));
  return {
    packages: (filter.packages || []).join(", "), exclude_packages: (filter.exclude_packages || []).join(", "),
    last_visit_before: filter.last_visit_before || "", last_visit_after: filter.last_visit_after || "",
    min_visits: filter.min_visits ?? "", max_visits: filter.max_visits ?? "", advanced: Object.keys(rest).length ? JSON.stringify(rest) : ""
  };
}

export function describeFilter(filter = {}) {
  const bits = [];
  if (filter.packages?.length) bits.push(`packages: ${filter.packages.join(", ")}`);
  if (filter.last_visit_before) bits.push(`last visit before ${filter.last_visit_before}`);
  if (filter.last_visit_after) bits.push(`last visit after ${filter.last_visit_after}`);
  if (filter.min_visits || filter.max_visits) bits.push(`visits ${filter.min_visits || 1}-${filter.max_visits || "any"}`);
  if (filter.exclude_packages?.length) bits.push(`excluding ${filter.exclude_packages.join(", ")}`);
  if (filter.inactive_months) bits.push(`inactive ${filter.inactive_months}+ months`);
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
