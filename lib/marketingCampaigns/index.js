// Marketing campaigns — WhatsApp marketing-template blasts to an audience built from the Shivam archive.
//
// Flow (all driven by POST /api/internal/whatsapp/marketing-campaign, internal token):
//   create   -> public.campaigns row (config below), status draft
//   prepare  -> pulls the audience from labit-core (/internal/campaign-audience), applies the exclusions that live HERE
//               (opt-outs, messaged recently by any campaign), and — unless dry_run — stores one campaign_recipients row
//               per phone, status prepared. dry_run writes nothing and returns counts, an anonymised sample and a cost estimate.
//   send     -> sends one capped batch from the pending rows (hard caps, send-rate limit, quiet hours, circuit breaker);
//               call repeatedly until `more` is false
//   stop     -> status stopped; the running batch notices within ~10 sends
//   results  -> per-status counts, Meta delivery/read/failure breakdown (from the status webhooks), cost so far
//   test     -> sends the template to a few staff numbers (no recipient rows)
// v3 (db/migrations/20261028_marketing_engine_v3.sql): campaigns reference a template KEY (templateRegistry.js), a saved or inline
//   segment FILTER (labit-core, via audienceClient.js), an optional OFFER (per-recipient snapshot), a send_after schedule (runDue)
//   and a deterministic pilot sample. The hard limits below stay in code; nothing in the admin panel can raise them.
//
// campaigns.config:
//   template  { name, language, header_image_url?, params:[variable names -> patientMessageJobs/variables.js], buttons:[{index,text}]? }
//   segment   { type: "package"|"inactive", last_visit_before?, last_visit_after?, min_visits? }   (labit-core definitions)
//   limits    { per_run_cap, daily_cap, rate_per_minute, window_start_hhmm, window_end_hhmm, cooldown_days }
//   cost      { per_message_inr, gst_rate }
// The limits are clamped to the HARD_* ceilings below and the send window can only be narrowed inside 09:00-20:00 IST.

import { supabase } from "@/lib/supabaseServer";
import { digitsOnly, toCanonicalIndiaPhone } from "@/lib/phone";
import { sendTemplateMessage as realSendTemplateMessage } from "@/lib/whatsapp/sender";
import { extractProviderMessageId, logReportDispatch } from "@/lib/reportDispatchLogs";
import { resolveParam } from "@/lib/patientMessageJobs/variables";
import { getTrendReportUrl } from "@/lib/neosoft/client";
import { createHash } from "node:crypto";
import { chunkForInFilter } from "@/lib/inChunks";
import { fetchAudienceRows, validateFilter } from "./audienceClient";
import { formatValidTill, offerIsActive, snapshotFor } from "./offers";
import { getOffer } from "./store";
import { getTemplate } from "./templateRegistry";
import { friendlyErrorMessage } from "./errors";

let sendTemplateMessage = realSendTemplateMessage;
/** Test seam: replace the WhatsApp sender (pass nothing to restore). Never used in production code. */
export function __setTemplateSenderForTests(fn) { sendTemplateMessage = fn || realSendTemplateMessage; }

const IN_FLIGHT_MS = 120000;
const HARD_PER_RUN_CAP = 500;
const HARD_DAILY_CAP = 5000;
const HARD_RATE_PER_MINUTE = 120;
const WINDOW_START = "09:00";
const WINDOW_END = "20:00";
const SEGMENTS = ["package", "inactive", "filter"];
const STOP_WORDS = /^\s*(stop|unsubscribe|opt[\s-]?out|stop promotions?|stop messages?)\s*[.!]?\s*$/i;

// Meta-estimate defaults. ASSUMPTION, not a quote: India marketing-category per-message rate of about Rs 0.78-0.80 (Meta, from the
// 2025 per-message price list) plus the BSP markup, GST extra. Override per campaign in config.cost, or via env, with the Mtalkz rate card.
const DEFAULT_COST_PER_MESSAGE_INR = Number(process.env.MARKETING_COST_PER_MESSAGE_INR || 0.88);
const DEFAULT_GST_RATE = 0.18;
export const COST_NOTE = "estimate, verify vs Mtalkz rate card";

let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Test seam: skip the per-send pacing delay (pass nothing to restore). */
export function __setSleepForTests(fn) { sleep = fn || ((ms) => new Promise((resolve) => setTimeout(resolve, ms))); }
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : fallback);

// ---- time (IST) ------------------------------------------------------------------------------------------------------

export function istParts(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now).map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hhmm: `${parts.hour}:${parts.minute}` };
}

export function istMidnightIso(now = new Date()) {
  return new Date(`${istParts(now).date}T00:00:00+05:30`).toISOString();
}

export function withinSendWindow(cfg, now = new Date()) {
  const { hhmm } = istParts(now);
  return hhmm >= cfg.limits.window_start_hhmm && hhmm < cfg.limits.window_end_hhmm;
}

// ---- config ----------------------------------------------------------------------------------------------------------

export function normalizeConfig(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  const t = c.template || {};
  const seg = c.segment || {};
  const lim = c.limits || {};
  const start = /^\d{2}:\d{2}$/.test(String(lim.window_start_hhmm || "")) ? lim.window_start_hhmm : WINDOW_START;
  const end = /^\d{2}:\d{2}$/.test(String(lim.window_end_hhmm || "")) ? lim.window_end_hhmm : WINDOW_END;
  const cfg = {
    template: {
      key: String(t.key || "").trim() || null,
      name: String(t.name || "").trim(),
      language: String(t.language || "en").trim() || "en",
      header_image_url: String(t.header_image_url || "").trim() || null,
      params: Array.isArray(t.params) ? t.params.map((p) => String(p).trim()) : [],
      buttons: Array.isArray(t.buttons) ? t.buttons.map((b) => ({ index: num(b?.index, 0), text: String(b?.text ?? "").trim() })) : [],
      // How long the per-patient "view my summary" link stays valid (days); only used when a button carries {summary_token}.
      link_valid_days: clamp(num(t.link_valid_days, 30), 1, 90)
    },
    // Registry key (optional): the template block below was derived from it at create time.
    offer_id: String(c.offer_id || "").trim() || null,
    pilot_size: c.pilot_size == null || c.pilot_size === "" ? null : clamp(Math.floor(num(c.pilot_size, 0)), 1, HARD_PER_RUN_CAP),
    // Set by a non-dry pilot prepare: lets a pilot that finished ("completed") be widened once with expand.
    pilot_prepared: c.pilot_prepared == null ? null : clamp(Math.floor(num(c.pilot_prepared, 0)), 1, HARD_PER_RUN_CAP),
    segment: {
      // A composable labit-core filter (verbatim JSON) makes the type "filter"; legacy package/inactive segments still work.
      filter: seg.filter && typeof seg.filter === "object" && !Array.isArray(seg.filter) ? seg.filter : null,
      saved_id: String(seg.saved_id || "").trim() || null,
      type: String(seg.type || "").trim() || (seg.filter && typeof seg.filter === "object" ? "filter" : ""),
      last_visit_before: seg.last_visit_before || null,
      last_visit_after: seg.last_visit_after || null,
      min_visits: clamp(num(seg.min_visits, 1), 1, 50)
    },
    limits: {
      per_run_cap: clamp(num(lim.per_run_cap, 100), 1, HARD_PER_RUN_CAP),
      daily_cap: clamp(num(lim.daily_cap, 1000), 1, HARD_DAILY_CAP),
      rate_per_minute: clamp(num(lim.rate_per_minute, 30), 1, HARD_RATE_PER_MINUTE),
      // The window may be narrowed, never widened past 09:00-20:00 IST.
      window_start_hhmm: start < WINDOW_START ? WINDOW_START : start,
      window_end_hhmm: end > WINDOW_END ? WINDOW_END : end,
      cooldown_days: clamp(num(lim.cooldown_days, 30), 0, 365)
    },
    cost: {
      per_message_inr: num(c.cost?.per_message_inr, DEFAULT_COST_PER_MESSAGE_INR),
      gst_rate: num(c.cost?.gst_rate, DEFAULT_GST_RATE)
    }
  };
  return cfg;
}

/** A campaign built from the registry must still match it: approved, same Mtalkz name, and a name that has actually been confirmed. */
export function templateRegistryProblems(cfg) {
  const key = cfg?.template?.key;
  if (!key) return [];
  const tpl = getTemplate(key);
  if (!tpl) return [`unknown template key: ${key}`];
  const out = [];
  if (tpl.status !== "approved") out.push(`template ${key} is ${tpl.status}, not approved`);
  if (tpl.name === "CONFIRM_IN_MTALKZ") out.push(`template ${key} has no confirmed Mtalkz name yet`);
  else if (cfg.template.name !== tpl.name) out.push(`template name ${cfg.template.name} does not match the registry (${tpl.name})`);
  return out;
}

export function validateConfig(cfg) {
  const errors = [];
  errors.push(...templateRegistryProblems(cfg));
  if (!cfg.template.name) errors.push("template.name is required");
  if (!SEGMENTS.includes(cfg.segment.type)) errors.push(`segment.type must be one of ${SEGMENTS.join(", ")}`);
  if (cfg.segment.type === "filter" && !cfg.segment.filter) errors.push("segment.filter is required for a filter segment");
  if (cfg.segment.filter) errors.push(...validateFilter(cfg.segment.filter));
  for (const p of cfg.template.params) {
    try { resolveParam(p, {}); } catch (err) { errors.push(err.message); }
  }
  if (cfg.template.header_image_url && !/^https:\/\//i.test(cfg.template.header_image_url)) errors.push("template.header_image_url must be https");
  if (cfg.limits.window_start_hhmm >= cfg.limits.window_end_hhmm) errors.push("send window is empty");
  return errors;
}

export function estimateCost(count, cfg) {
  const ex = count * cfg.cost.per_message_inr;
  return { note: COST_NOTE, per_message_inr: cfg.cost.per_message_inr, gst_rate: cfg.cost.gst_rate, messages: count, inr_ex_gst: Math.round(ex), inr_with_gst: Math.round(ex * (1 + cfg.cost.gst_rate)) };
}

// ---- helpers ---------------------------------------------------------------------------------------------------------

async function fetchAllRows(build, pageSize = 1000) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

const last10 = (v) => digitsOnly(v).slice(-10);

function anonymise(row) {
  const p = last10(row.phone || row.mobile);
  return {
    name_initial: String(row.name || "?").trim().charAt(0).toUpperCase() || "?",
    phone_masked: p ? `${p.slice(0, 2)}******${p.slice(-2)}` : null,
    last_visit_year: String(row.last_visit || "").slice(0, 4) || null,
    last_package: row.last_package || null
  };
}

async function loadCampaign(campaignId) {
  const { data, error } = await supabase.from("campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Campaign not found");
  return data;
}

const SUMMARY_TOKEN = "{summary_token}";
export function usesSummaryToken(cfg) {
  return cfg.template.buttons.some((b) => b.text.includes(SUMMARY_TOKEN));
}

async function optOutPhones() {
  const rows = await fetchAllRows(() => supabase.from("whatsapp_opt_outs").select("phone10"));
  return rows.map((r) => r.phone10);
}
async function optOutSet() {
  return new Set(await optOutPhones());
}

// Campaign messages sent inside the cooldown, from ANY other campaign: [{phone, sent_on}] (the shape labit-core's `messaged` takes).
async function recentMessages(cooldownDays, exceptCampaignId) {
  if (!cooldownDays) return [];
  const since = new Date(Date.now() - cooldownDays * 86400000).toISOString();
  const rows = await fetchAllRows(() => {
    let q = supabase.from("campaign_recipients").select("mobile, sent_at").in("status", ["sent", "sending"]).gte("sent_at", since);
    if (exceptCampaignId) q = q.neq("campaign_id", exceptCampaignId);
    return q;
  });
  return rows.map((r) => ({ phone: last10(r.mobile), sent_on: istParts(new Date(r.sent_at)).date }));
}
async function recentlyMessagedSet(cooldownDays, exceptCampaignId) {
  return new Set((await recentMessages(cooldownDays, exceptCampaignId)).map((m) => m.phone));
}

/** What labit-core needs from Supabase on every audience call: opt-outs and recent sends (for the cooldown). Used by prepare, diff and the panel preview. */
export async function audienceContext({ cooldownDays = 30, exceptCampaignId = null } = {}) {
  const [optedOutPhones, messaged] = await Promise.all([optOutPhones(), recentMessages(cooldownDays, exceptCampaignId)]);
  return { optedOutPhones, messaged, cooldownDays, ratePerMessageInr: DEFAULT_COST_PER_MESSAGE_INR };
}

async function fetchAudience(cfg, campaign, extra = {}) {
  const ctx = await audienceContext({ cooldownDays: cfg.limits.cooldown_days, exceptCampaignId: campaign.id });
  return fetchAudienceRows(cfg.segment, {
    linkValidDays: usesSummaryToken(cfg) ? cfg.template.link_valid_days : null,
    ...ctx, ratePerMessageInr: cfg.cost.per_message_inr, includeFocus: Boolean(campaign.offer_id || cfg.offer_id || cfg.template.params.includes("focus_areas")), ...extra
  });
}

// ---- actions ---------------------------------------------------------------------------------------------------------

/** Registry template -> config.template block. Dynamic URL buttons default to the per-patient {summary_token}. */
export function templateBlockFromRegistry(key, overrides = {}) {
  const tpl = getTemplate(key);
  if (!tpl) return { error: `Unknown template key: ${key}` };
  const buttons = [];
  (tpl.buttons || []).forEach((b, index) => {
    if (b.type === "url" && /\{\{1\}\}/.test(b.url || "")) buttons.push({ index, text: overrides.button_text || "{summary_token}" });
  });
  return {
    template: {
      key: tpl.key, name: tpl.name, language: tpl.language, params: [...(tpl.params || [])],
      header_image_url: tpl.header?.type === "image" ? overrides.header_image_url || tpl.header.sample_url || null : null,
      buttons
    },
    registry: tpl
  };
}

/** Pure: turns an admin request into a campaigns.config. `segmentRow` is the saved segment (if any). */
export function buildCampaignConfig(input, segmentRow = null) {
  const out = { errors: [] };
  const base = input?.config && typeof input.config === "object" ? input.config : {};
  let template = {};
  // Admin-created campaigns MUST come from the registry: a raw template name would bypass the approved/category checks.
  if (!input?.template_key) out.errors.push("template_key is required (choose a template from the registry)");
  if (input?.template_key) {
    const t = templateBlockFromRegistry(String(input.template_key), { header_image_url: input.header_image_url, button_text: input.button_text });
    if (t.error) out.errors.push(t.error);
    else {
      template = t.template;
      if (t.registry.status !== "approved") out.errors.push(`template ${t.registry.key} is ${t.registry.status}, not approved`);
    }
  }
  let segment = base.segment || {};
  if (segmentRow) segment = { filter: segmentRow.filter, saved_id: segmentRow.id };
  else if (input?.filter) segment = { filter: input.filter };
  else if (input?.segment) segment = input.segment;
  out.config = {
    template, segment,
    offer_id: input?.offer_id || base.offer_id || null,
    pilot_size: input?.pilot_size ?? base.pilot_size ?? null,
    limits: input?.limits || base.limits || {},
    ...(input?.cost || base.cost ? { cost: input?.cost || base.cost } : {})
  };
  return out;
}

export async function createCampaign({ labId, name, config, segmentId = null, offerId = null, sendAfter = null, createdBy = null }) {
  const cfg = normalizeConfig(config);
  const errors = validateConfig(cfg);
  if (offerId || cfg.offer_id) {
    const offer = await getOffer(offerId || cfg.offer_id);
    if (!offer || offer.archived_at) errors.push("offer not found");
  }
  if (errors.length) return { ok: false, error: errors.join("; ") };
  // Denormalised: lib/whatsappBot reads the offer from config.offer_id; the column stays the source of truth.
  cfg.offer_id = offerId || cfg.offer_id || null;
  const row = {
    name: String(name || "").trim() || `${cfg.segment.type} campaign`, segment_type: cfg.segment.type, date: istParts().date, status: "draft",
    config: cfg, lab_id: labId || null, template_key: cfg.template.key, segment_id: segmentId || cfg.segment.saved_id || null,
    offer_id: offerId || cfg.offer_id || null, send_after: sendAfter || null, created_by: createdBy
  };
  const { data, error } = await supabase.from("campaigns").insert(row).select("id").single();
  if (error) throw new Error(error.message);
  return { ok: true, campaign_id: data.id, config: cfg };
}

/** Draft only: a prepared campaign has stored recipients that would no longer match its config. */
export async function updateCampaign({ campaignId, name, config, offerId, segmentId }) {
  const campaign = await loadCampaign(campaignId);
  if (campaign.status !== "draft") return { ok: false, error: `campaign is ${campaign.status}; only drafts can be edited` };
  const cfg = normalizeConfig(config || campaign.config);
  const errors = validateConfig(cfg);
  if (errors.length) return { ok: false, error: errors.join("; ") };
  cfg.offer_id = (offerId === undefined ? campaign.offer_id : offerId) || null;
  const patch = { config: cfg, segment_type: cfg.segment.type, template_key: cfg.template.key, offer_id: offerId === undefined ? campaign.offer_id : offerId || null };
  if (segmentId !== undefined) patch.segment_id = segmentId || null;
  if (name) patch.name = String(name).trim();
  const { error } = await supabase.from("campaigns").update(patch).eq("id", campaignId);
  if (error) throw new Error(error.message);
  return { ok: true, campaign_id: campaignId, config: cfg };
}

export async function deleteDraftCampaign({ campaignId }) {
  const campaign = await loadCampaign(campaignId);
  if (campaign.status !== "draft") return { ok: false, error: `campaign is ${campaign.status}; only drafts can be deleted (stop it instead)` };
  const { count } = await supabase.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
  if (count) return { ok: false, error: "campaign has recipients; stop it instead" };
  const { error } = await supabase.from("campaigns").delete().eq("id", campaignId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function listCampaigns({ limit = 100 } = {}) {
  const { data, error } = await supabase.from("campaigns").select("id, name, status, segment_type, template_key, segment_id, offer_id, send_after, created_at, prepared_at, stopped_at, config")
    .order("created_at", { ascending: false }).limit(Math.min(Number(limit) || 100, 300));
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getCampaignDetail({ campaignId }) {
  const c = await loadCampaign(campaignId);
  const { data: counts } = await supabase.from("campaign_recipients").select("status").eq("campaign_id", campaignId).limit(100000);
  const by_status = (counts || []).reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
  return { ok: true, campaign: { ...c, config: normalizeConfig(c.config) }, recipients_by_status: by_status };
}

// Deterministic pilot order: same campaign + same audience -> same N recipients, independent of the audience API's row order.
export function pilotOrder(rows, campaignId) {
  const key = (r) => createHash("sha1").update(`${campaignId}|${last10(r.phone)}`).digest("hex");
  return [...rows].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

async function loadOffer(campaign, cfg) {
  const id = campaign.offer_id || cfg.offer_id;
  if (!id) return null;
  const offer = await getOffer(id);
  if (!offer) throw new Error("Offer not found");
  return offer;
}

/** Audience minus opt-outs and recently-messaged. Shared by prepare and the dry-run diff. */
async function buildEligible(campaign, cfg, extra = {}) {
  const audience = await fetchAudience(cfg, campaign, extra);
  const [optedOut, recent] = await Promise.all([optOutSet(), recentlyMessagedSet(cfg.limits.cooldown_days, campaign.id)]);
  const stats = { ...audience.stats, opted_out: 0, messaged_recently: 0 };
  const eligible = [];
  for (const row of audience.rows || []) {
    const p = last10(row.phone);
    if (optedOut.has(p)) { stats.opted_out += 1; continue; }
    if (recent.has(p)) { stats.messaged_recently += 1; continue; }
    eligible.push(row);
  }
  stats.eligible = eligible.length;
  return { eligible, stats };
}

function offerBreakdown(rows, offer) {
  const tiers = {};
  let focus = 0;
  for (const r of rows) {
    const t = r.offer_tier ? String(r.offer_tier) : "none";
    tiers[t] = (tiers[t] || 0) + 1;
    if (Array.isArray(r.focus_areas) && r.focus_areas.length) focus += 1;
  }
  return { offer_id: offer?.id || null, by_tier: tiers, with_focus_areas: focus };
}

/**
 * dryRun: counts + anonymised sample + cost; writes nothing. Otherwise stores the recipients and marks the campaign prepared.
 * pilotSize: store only a deterministic sample of N. expand: add the remaining eligible recipients to an already-prepared (pilot) campaign.
 */
export async function prepareCampaign({ campaignId, dryRun = true, pilotSize = null, expand = false }) {
  const campaign = await loadCampaign(campaignId);
  const cfg = normalizeConfig(campaign.config);
  const errors = validateConfig(cfg);
  if (errors.length) return { ok: false, error: errors.join("; ") };
  // A pilot that has been fully sent is "completed"; it may be widened once (cfg.pilot_prepared is cleared by the expand).
  const allowed = expand ? ["prepared", "paused", ...(cfg.pilot_prepared ? ["completed"] : [])] : ["draft", "prepared"];
  if (!allowed.includes(campaign.status)) return { ok: false, error: `campaign is ${campaign.status}; cannot ${expand ? "expand" : "prepare"}` };

  const offer = await loadOffer(campaign, cfg);
  if (offer && !offerIsActive(offer, istParts().date)) return { ok: false, error: "offer is not active today (check valid_from/valid_to)" };
  const pilot = expand ? null : clamp(Math.floor(num(pilotSize ?? cfg.pilot_size, 0)), 0, HARD_PER_RUN_CAP) || null;
  // Pilots ask labit-core for a deterministic seeded sample (padded x3 so local exclusions still leave N); the local sha1 order picks the final N.
  const { eligible: all, stats } = await buildEligible(campaign, cfg, pilot && cfg.segment.filter ? { maxAudience: Math.min(pilot * 3, 5000), sampleSeed: campaign.id } : {});
  let eligible = all;
  if (pilot) eligible = pilotOrder(all, campaign.id).slice(0, pilot);
  stats.pilot_size = pilot;
  stats.audience_after_exclusions = all.length;

  const result = {
    ok: true, dry_run: dryRun, campaign_id: campaign.id,
    template: { key: cfg.template.key, name: cfg.template.name, has_header_image: Boolean(cfg.template.header_image_url), params: cfg.template.params },
    limits: cfg.limits, stats,
    offer: offerBreakdown(eligible, offer),
    sample: eligible.slice(0, 5).map(anonymise),
    cost_estimate: estimateCost(eligible.length, cfg),
    days_to_complete_at_daily_cap: Math.ceil(eligible.length / cfg.limits.daily_cap)
  };
  if (dryRun) return result;

  if (!expand) {
    const { count: nonPending } = await supabase.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id).neq("status", "pending");
    if (nonPending) return { ok: false, error: "campaign already has sent/skipped recipients; create a new campaign instead" };
    await supabase.from("campaign_recipients").delete().eq("campaign_id", campaign.id).eq("status", "pending");
  }
  let existing = new Set();
  if (expand) {
    const rows = await fetchAllRows(() => supabase.from("campaign_recipients").select("mobile").eq("campaign_id", campaign.id));
    existing = new Set(rows.map((r) => last10(r.mobile)));
    eligible = eligible.filter((r) => !existing.has(last10(r.phone)));
    result.added = eligible.length;
  }
  for (let i = 0; i < eligible.length; i += 500) {
    const chunk = eligible.slice(i, i + 500).map((r) => ({
      campaign_id: campaign.id, mobile: toCanonicalIndiaPhone(r.phone), mrno: r.mrn || null, name: r.name || null,
      last_visit: r.last_visit || null, last_package: r.last_package || null, link_token: r.summary_token || null, status: "pending",
      ...snapshotFor(offer, r)
    }));
    const { error } = await supabase.from("campaign_recipients").upsert(chunk, { onConflict: "campaign_id,mobile", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  if (!expand) {
    await supabase.from("campaigns").update({ status: "prepared", prepared_at: new Date().toISOString(), config: { ...cfg, pilot_prepared: pilot || null } }).eq("id", campaign.id);
  } else {
    const patch = { config: { ...cfg, pilot_prepared: null } };
    if (campaign.status === "completed" && eligible.length) patch.status = "prepared";
    await supabase.from("campaigns").update(patch).eq("id", campaign.id);
  }
  return result;
}

/** Counts only: what a (re-)prepare would change versus the recipients already stored. Writes nothing. */
export async function dryRunDiff({ campaignId }) {
  const campaign = await loadCampaign(campaignId);
  const cfg = normalizeConfig(campaign.config);
  const errors = validateConfig(cfg);
  if (errors.length) return { ok: false, error: errors.join("; ") };
  const { eligible, stats } = await buildEligible(campaign, cfg);
  const rows = await fetchAllRows(() => supabase.from("campaign_recipients").select("mobile, status").eq("campaign_id", campaign.id));
  const stored = new Map(rows.map((r) => [last10(r.mobile), r.status]));
  const nowSet = new Set(eligible.map((r) => last10(r.phone)));
  const diff = { stored: rows.length, audience_now: eligible.length, would_add: 0, would_remove_pending: 0, unchanged_pending: 0, already_sent: 0, already_skipped_or_failed: 0 };
  for (const p of nowSet) if (!stored.has(p)) diff.would_add += 1;
  for (const [p, st] of stored) {
    if (st === "sent" || st === "sending") diff.already_sent += 1;
    else if (st === "skipped" || st === "failed") diff.already_skipped_or_failed += 1;
    else if (nowSet.has(p)) diff.unchanged_pending += 1;
    else diff.would_remove_pending += 1;
  }
  return { ok: true, campaign_id: campaign.id, status: campaign.status, diff, audience_stats: stats };
}

async function sendOne({ labId, campaign, cfg, recipient, offer = null }) {
  const ctx = {
    patient_name: recipient.name, mrn: recipient.mrno, last_package: recipient.last_package, last_visit: recipient.last_visit,
    offer_text: recipient.offer_text, focus_areas: recipient.focus_areas,
    offer_code: offer?.code || "", offer_valid_till: formatValidTill(offer?.valid_to), offer_terms: offer?.terms || "",
    trend_link: recipient.mrno ? getTrendReportUrl(recipient.mrno) : ""
  };
  const params = cfg.template.params.map((p) => resolveParam(p, ctx));
  // WhatsApp rejects an empty template parameter: skip this recipient (not a send failure, so it never trips the circuit breaker).
  const emptyAt = params.findIndex((v) => !String(v).trim());
  if (emptyAt >= 0) return { skip: true, reason: `empty_param:${cfg.template.params[emptyAt]}` };
  // A URL button's one variable: the per-patient signed token from labit-core. A button that resolves empty would be rejected by Meta,
  // so that recipient is skipped (never counted as a send failure).
  const buttons = cfg.template.buttons.filter((b) => b.text).map((b) => ({ ...b, text: b.text.split(SUMMARY_TOKEN).join(recipient.link_token || "") }));
  const emptyButton = buttons.find((b) => !b.text.trim());
  if (emptyButton) return { skip: true, reason: `empty_button:${emptyButton.index}` };
  const started = Date.now();
  try {
    const sendResult = await sendTemplateMessage({
      labId, phone: recipient.mobile, templateName: cfg.template.name, languageCode: cfg.template.language, templateParams: params,
      ...(cfg.template.header_image_url ? { headerImageUrl: cfg.template.header_image_url } : {}),
      ...(buttons.length ? { urlButtonParams: buttons } : {}),
      sender: { name: `marketing:${campaign.id}`, role: "system", userType: "service" }
    });
    const pmid = extractProviderMessageId(sendResult) || null;
    await logReportDispatch({
      labId, actorName: "marketing_campaign", actorRole: "system", sourcePage: "marketing_campaign", action: "send_whatsapp", targetMode: "single",
      reqid: `CAMPAIGN:${campaign.id}:${last10(recipient.mobile)}`, reqno: null, phone: recipient.mobile, reportType: `marketing:${campaign.name}`.slice(0, 80),
      headerMode: "default", status: "success", resultCode: "CAMPAIGN_SENT", resultMessage: "marketing campaign sent", providerMessageId: pmid,
      requestPayload: { campaign_id: campaign.id, template_name: cfg.template.name, params_count: params.length }, responsePayload: sendResult, durationMs: Date.now() - started
    });
    return { ok: true, pmid };
  } catch (err) {
    return { ok: false, error: String(err?.message || "send failed").slice(0, 500) };
  }
}

/** One bounded batch. Returns { sent, failed, skipped, more, stopped_reason }. */
export async function sendBatch({ labId, campaignId, batchSize, timeBudgetMs = 45000, viaScheduler = false, now = new Date() }) {
  const campaign = await loadCampaign(campaignId);
  const cfg = normalizeConfig(campaign.config);
  const okStatus = viaScheduler ? ["prepared", "running", "scheduled"] : ["prepared", "running"];
  const tplProblems = templateRegistryProblems(cfg);
  if (tplProblems.length) return { ok: false, error: tplProblems.join("; ") };
  if (!okStatus.includes(campaign.status)) return { ok: false, error: `campaign is ${campaign.status}; send needs prepared/running${campaign.status === "scheduled" ? " (scheduled campaigns go out via the due runner)" : ""}` };
  const offer = await loadOffer(campaign, cfg);
  // An expired offer must never reach a patient: hold the campaign, do not send.
  if (offer && !offerIsActive(offer, istParts(now).date)) return { ok: true, sent: 0, more: true, stopped_reason: "offer is not active today" };
  if (!withinSendWindow(cfg, now)) return { ok: true, sent: 0, more: true, stopped_reason: `outside send window ${cfg.limits.window_start_hhmm}-${cfg.limits.window_end_hhmm} IST` };

  // A crash mid-send leaves rows 'sending'. They may or may not have gone out, so they are failed (never retried): no double-send.
  await supabase.from("campaign_recipients").update({ status: "failed", error: "interrupted" })
    .eq("campaign_id", campaign.id).eq("status", "sending").lt("delivery_updated_at", new Date(Date.now() - 15 * 60000).toISOString());

  // One batch in flight per campaign: a second tab (or the scheduler) that arrives while a batch is still claiming/sending backs off,
  // so the send rate and the daily cap cannot be doubled. (The claim below is atomic anyway, so a recipient can never be sent twice.)
  const { count: inFlight } = await supabase.from("campaign_recipients").select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id).eq("status", "sending").gte("delivery_updated_at", new Date(Date.now() - IN_FLIGHT_MS).toISOString());
  if (inFlight) return { ok: true, sent: 0, more: true, stopped_reason: "another batch is already sending for this campaign" };

  const midnight = istMidnightIso(now);
  const [{ count: sentToday }, { count: sentTodayAll }] = await Promise.all([
    supabase.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id).eq("status", "sent").gte("sent_at", midnight),
    // The 5000/day ceiling is account-wide: it counts every campaign.
    supabase.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", midnight)
  ]);
  const dailyLeft = Math.min(cfg.limits.daily_cap - (sentToday || 0), HARD_DAILY_CAP - (sentTodayAll || 0));
  if (dailyLeft <= 0) return { ok: true, sent: 0, more: true, stopped_reason: "daily cap reached" };
  const want = clamp(num(batchSize, cfg.limits.per_run_cap), 1, Math.min(cfg.limits.per_run_cap, dailyLeft));

  // Conditional: a stop pressed between the load above and this write must not be turned back into "running".
  await supabase.from("campaigns").update({ status: "running" }).eq("id", campaign.id).in("status", okStatus);
  const { data: pending, error: pendErr } = await supabase.from("campaign_recipients").select("id").eq("campaign_id", campaign.id).eq("status", "pending").order("created_at").limit(want);
  if (pendErr) throw new Error(pendErr.message);
  if (!pending?.length) {
    await supabase.from("campaigns").update({ status: "completed" }).eq("id", campaign.id);
    return { ok: true, sent: 0, more: false, stopped_reason: "no pending recipients" };
  }
  // Claim: only rows still pending flip to sending, so two overlapping callers never send the same recipient.
  const { data: claimed, error: claimErr } = await supabase.from("campaign_recipients")
    .update({ status: "sending", delivery_updated_at: new Date().toISOString() }).in("id", pending.map((r) => r.id)).eq("status", "pending").select("*");
  if (claimErr) throw new Error(claimErr.message);

  const optedOut = await optOutSet();
  const started = Date.now();
  const gapMs = Math.ceil(60000 / cfg.limits.rate_per_minute);
  let sent = 0, failed = 0, skipped = 0, consecutiveFailures = 0, stoppedReason = null;
  const queue = claimed || [];
  for (let i = 0; i < queue.length; i += 1) {
    const r = queue[i];
    if (i > 0 && i % 10 === 0) {
      const fresh = await loadCampaign(campaign.id);
      if (fresh.status !== "running") { stoppedReason = `campaign ${fresh.status}`; }
      else if (!withinSendWindow(cfg, new Date(now.getTime() + (Date.now() - started)))) { stoppedReason = "send window closed"; }
    }
    if (!stoppedReason && Date.now() - started > Math.min(timeBudgetMs, 55000)) stoppedReason = "time budget";
    if (stoppedReason) {
      // Hand the unsent claimed rows back.
      await supabase.from("campaign_recipients").update({ status: "pending" }).in("id", queue.slice(i).map((x) => x.id)).eq("status", "sending");
      break;
    }
    if (optedOut.has(last10(r.mobile))) {
      await supabase.from("campaign_recipients").update({ status: "skipped", skip_reason: "opted_out" }).eq("id", r.id);
      skipped += 1;
      continue;
    }
    const res = await sendOne({ labId, campaign, cfg, recipient: r, offer });
    if (res.skip) {
      await supabase.from("campaign_recipients").update({ status: "skipped", skip_reason: res.reason }).eq("id", r.id);
      skipped += 1;
      continue;
    }
    if (res.ok) {
      sent += 1; consecutiveFailures = 0;
      await supabase.from("campaign_recipients").update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: res.pmid, delivery_status: "sent", error: null }).eq("id", r.id);
    } else {
      failed += 1; consecutiveFailures += 1;
      await supabase.from("campaign_recipients").update({ status: "failed", error: res.error }).eq("id", r.id);
      // Circuit breaker: a rejected/unapproved template fails every send; stop after 5 in a row rather than burn the whole audience.
      if (consecutiveFailures >= 5) {
        stoppedReason = `paused after ${consecutiveFailures} consecutive failures: ${res.error}`;
        await supabase.from("campaigns").update({ status: "paused" }).eq("id", campaign.id);
        await supabase.from("campaign_recipients").update({ status: "pending" }).in("id", queue.slice(i + 1).map((x) => x.id)).eq("status", "sending");
        break;
      }
    }
    await sleep(gapMs);
  }
  const { count: left } = await supabase.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id).eq("status", "pending");
  if (!left) await supabase.from("campaigns").update({ status: "completed" }).eq("id", campaign.id);
  return { ok: true, sent, failed, skipped, remaining: left || 0, more: Boolean(left) && !String(stoppedReason || "").startsWith("paused"), stopped_reason: stoppedReason };
}

export async function stopCampaign({ campaignId }) {
  const { error } = await supabase.from("campaigns").update({ status: "stopped", stopped_at: new Date().toISOString() }).eq("id", campaignId).in("status", ["draft", "prepared", "scheduled", "running", "paused"]);
  if (error) throw new Error(error.message);
  return { ok: true, campaign_id: campaignId, status: "stopped" };
}

export async function resumeCampaign({ campaignId }) {
  const { error } = await supabase.from("campaigns").update({ status: "prepared" }).eq("id", campaignId).eq("status", "paused");
  if (error) throw new Error(error.message);
  return { ok: true, campaign_id: campaignId, status: "prepared" };
}

/** Staff-number test send of the real template: allowlisted numbers only, inside the send window, no recipient rows. */
export function filterTestNumbers(requested, allowlistRaw) {
  const allow = new Set(String(allowlistRaw || "").split(",").map((x) => last10(x)).filter((x) => x.length === 10));
  if (!allow.size) return { error: "MARKETING_TEST_NUMBERS is not configured" };
  const want = (Array.isArray(requested) && requested.length ? requested : [...allow]).map(last10);
  const rejected = want.filter((x) => !allow.has(x)).length;
  if (rejected) return { error: `${rejected} number(s) are not in the staff test allowlist` };
  return { numbers: [...new Set(want)].slice(0, 10) };
}

function realTestRecipient(input) {
  if (!input || typeof input !== "object") return null;
  const clean = (key, max) => String(input[key] || "").trim().slice(0, max);
  const recipient = {
    name: clean("name", 120), mrno: clean("mrno", 40), last_package: clean("last_package", 160),
    last_visit: clean("last_visit", 10), link_token: clean("link_token", 160),
  };
  if (!recipient.name || !recipient.mrno || !recipient.last_package || !/^\d{4}-\d{2}-\d{2}$/.test(recipient.last_visit)) {
    return { error: "real test recipient needs name, mrno, last_package and last_visit (YYYY-MM-DD)" };
  }
  if (recipient.link_token && !/^[A-Za-z0-9_-]{16,160}$/.test(recipient.link_token)) {
    return { error: "real test recipient has an invalid link_token" };
  }
  return { recipient };
}

export async function testSend({ labId, campaignId, numbers, recipient: testRecipient = null, allowlist = process.env.MARKETING_TEST_NUMBERS || "", now = new Date() }) {
  const campaign = await loadCampaign(campaignId);
  const cfg = normalizeConfig(campaign.config);
  const tplProblems = templateRegistryProblems(cfg);
  if (tplProblems.length) return { ok: false, error: tplProblems.join("; ") };
  // A marketing template is never sent outside the window, test or not. The allowlist is always applied (default: env), never optional.
  if (!withinSendWindow(cfg, now)) return { ok: false, error: `outside send window ${cfg.limits.window_start_hhmm}-${cfg.limits.window_end_hhmm} IST` };
  const f = filterTestNumbers(numbers, allowlist);
  if (f.error) return { ok: false, error: f.error };
  numbers = f.numbers;
  const real = realTestRecipient(testRecipient);
  if (real?.error) return { ok: false, error: real.error };
  const offer = await loadOffer(campaign, cfg);
  const out = [];
  for (const n of (Array.isArray(numbers) ? numbers : []).slice(0, 10)) {
    const mobile = toCanonicalIndiaPhone(n);
    if (!mobile) { out.push({ ok: false, error: "invalid phone" }); continue; }
    const res = await sendOne({ labId, campaign, cfg, offer, recipient: {
      mobile, ...(real?.recipient || { name: "Test Patient", mrno: "TEST", last_package: "Executive Health Checkup", last_visit: "2025-01-01", link_token: "test" }),
      offer_text: offer ? snapshotFor(offer, { offer_tier: Object.keys(offer.tier_map || {})[0] }).offer_text : "", focus_areas: "liver, vitamin D"
    } });
    out.push({ phone_masked: anonymise({ phone: mobile }).phone_masked, ...res });
  }
  return { ok: true, results: out };
}

// ---- scheduling ------------------------------------------------------------------------------------------------------

/** sendAfter = ISO timestamp (>= now - 1 min) or null to clear. Needs a prepared campaign. Hard limits and the send window still apply. */
export async function scheduleCampaign({ campaignId, sendAfter, now = new Date() }) {
  const campaign = await loadCampaign(campaignId);
  if (!["prepared", "scheduled"].includes(campaign.status)) return { ok: false, error: `campaign is ${campaign.status}; schedule needs a prepared campaign` };
  if (sendAfter == null || sendAfter === "") {
    await supabase.from("campaigns").update({ status: "prepared", send_after: null }).eq("id", campaignId);
    return { ok: true, campaign_id: campaignId, status: "prepared", send_after: null };
  }
  const when = new Date(sendAfter);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "send_after must be an ISO timestamp" };
  if (when.getTime() < now.getTime() - 60000) return { ok: false, error: "send_after is in the past" };
  const { error } = await supabase.from("campaigns").update({ status: "scheduled", send_after: when.toISOString() }).eq("id", campaignId);
  if (error) throw new Error(error.message);
  return { ok: true, campaign_id: campaignId, status: "scheduled", send_after: when.toISOString() };
}

/**
 * The due runner: sends ONE bounded batch for every scheduled campaign whose send_after has passed (and continues scheduled campaigns that
 * are already running). Idempotent and safe to call every minute from an external trigger; it does nothing outside the send window.
 * There is deliberately no cron/pm2 job in this repo: see docs/marketing-campaigns.md.
 */
export async function runDue({ labId, now = new Date(), timeBudgetMs = 45000, maxCampaigns = 3 } = {}) {
  const { data, error } = await supabase.from("campaigns").select("id, status, config").in("status", ["scheduled", "running"]).not("send_after", "is", null)
    .lte("send_after", now.toISOString()).order("send_after").limit(maxCampaigns);
  if (error) throw new Error(error.message);
  const started = Date.now();
  const out = [];
  for (const c of data || []) {
    const left = timeBudgetMs - (Date.now() - started);
    if (left < 5000) break;
    const cfg = normalizeConfig(c.config);
    if (!withinSendWindow(cfg, now)) { out.push({ campaign_id: c.id, sent: 0, stopped_reason: "outside send window" }); continue; }
    const r = await sendBatch({ labId, campaignId: c.id, timeBudgetMs: left, viaScheduler: true, now });
    out.push({ campaign_id: c.id, ...r });
  }
  return { ok: true, due: (data || []).length, results: out };
}

// ---- results ---------------------------------------------------------------------------------------------------------

const RANK = { failed: 0, sent: 1, delivered: 2, read: 3 };

/** Pulls Meta status webhook events (whatsapp_messages direction=status) onto the recipient rows. */
export async function refreshDelivery(campaignId) {
  const sent = await fetchAllRows(() => supabase.from("campaign_recipients").select("id, provider_message_id, delivery_status").eq("campaign_id", campaignId).eq("status", "sent").not("provider_message_id", "is", null));
  const ids = sent.map((r) => r.provider_message_id);
  const best = new Map();
  for (const chunk of chunkForInFilter(ids)) {
    const { data, error } = await supabase.from("whatsapp_messages").select("message_id, payload").eq("direction", "status").in("message_id", chunk);
    if (error) throw new Error(error.message);
    for (const ev of data || []) {
      const st = String(ev?.payload?.status || "").toLowerCase();
      if (!(st in RANK)) continue;
      const cur = best.get(ev.message_id);
      if (!cur || RANK[st] > RANK[cur.status]) best.set(ev.message_id, { status: st, code: ev?.payload?.error?.code ? String(ev.payload.error.code) : null });
    }
  }
  const groups = new Map();
  for (const [pmid, v] of best) {
    const key = `${v.status}|${v.code || ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(pmid);
  }
  for (const [key, pmids] of groups) {
    const [status, code] = key.split("|");
    for (const chunk of chunkForInFilter(pmids)) {
      // Was unchecked: a failed update left delivery_status stale with no sign of it on the Results page.
      const { error } = await supabase.from("campaign_recipients").update({ delivery_status: status, delivery_error_code: code || null, delivery_updated_at: new Date().toISOString() }).eq("campaign_id", campaignId).in("provider_message_id", chunk);
      if (error) throw new Error(error.message);
    }
  }
}

/** Pure: counts the funnel from recipient rows ({status, delivery_status, delivery_error_code, replied?, clicked?}). */
export function computeFunnel(rows) {
  const f = { prepared: rows.length, sent: 0, delivered: 0, read: 0, failed: 0, skipped: 0, replied: 0, clicked: 0, failed_by_code: {} };
  for (const r of rows) {
    if (r.status === "skipped") f.skipped += 1;
    if (r.status === "sent") {
      f.sent += 1;
      if (r.delivery_status === "delivered" || r.delivery_status === "read") f.delivered += 1;
      if (r.delivery_status === "read") f.read += 1;
    }
    const failedAtMeta = r.status === "sent" && r.delivery_status === "failed";
    if (r.status === "failed" || failedAtMeta) {
      f.failed += 1;
      const code = failedAtMeta ? r.delivery_error_code || "unknown" : "send_error";
      f.failed_by_code[code] = (f.failed_by_code[code] || 0) + 1;
    }
    if (r.replied) f.replied += 1;
    if (r.clicked) f.clicked += 1;
  }
  return f;
}

/** Pure: per-IST-day sent/delivered/read/failed from rows with sent_at. Oldest first. */
export function aggregateTrend(rows) {
  const days = new Map();
  for (const r of rows) {
    if (!r.sent_at) continue;
    const d = istParts(new Date(r.sent_at)).date;
    const cur = days.get(d) || { date: d, sent: 0, delivered: 0, read: 0, failed: 0 };
    cur.sent += 1;
    if (r.delivery_status === "delivered" || r.delivery_status === "read") cur.delivered += 1;
    if (r.delivery_status === "read") cur.read += 1;
    if (r.delivery_status === "failed") cur.failed += 1;
    days.set(d, cur);
  }
  return [...days.values()].sort((x, y) => (x.date < y.date ? -1 : 1));
}

// Replies and button taps come from the inbound webhook rows: raw_message.type === "button" (template quick-reply) with
// raw_message.context.id = the campaign message's id is a "clicked"; any inbound from the recipient after the send is a "replied".
const ENGAGEMENT_CONCURRENCY = 4;

/** Run fn over items with at most `limit` in flight; rejects on the first failure. */
async function mapLimit(items, limit, fn) {
  let next = 0;
  const worker = async () => { while (next < items.length) { const item = items[next++]; await fn(item); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

async function engagementFor(recipients) {
  const clickedIds = new Set();
  const repliedPhones = new Set();
  const withId = recipients.filter((r) => r.status === "sent" && r.provider_message_id);
  const sentAtByPhone = new Map(withId.map((r) => [last10(r.mobile), r.sent_at]));
  const byId = new Map(withId.map((r) => [r.provider_message_id, last10(r.mobile)]));
  const ids = [...byId.keys()];
  const idChunks = chunkForInFilter(ids);
  await mapLimit(idChunks, ENGAGEMENT_CONCURRENCY, async (chunk) => {
    const { data, error } = await supabase.from("whatsapp_messages").select("btype:payload->raw_message->>type, ctx:payload->raw_message->context->>id")
      .eq("direction", "inbound").in("payload->raw_message->context->>id", chunk);
    if (error) throw new Error(error.message);
    for (const m of data || []) {
      if (m.btype === "button" || m.btype === "interactive") clickedIds.add(m.ctx);
      if (byId.has(m.ctx)) repliedPhones.add(byId.get(m.ctx));
    }
  });
  const phones = [...sentAtByPhone.keys()];
  // Chunk the phone VARIANTS (3 per number), not the numbers: the encoded variants are what hit the query string.
  const phoneChunks = chunkForInFilter(phones.flatMap((p) => [p, `91${p}`, `+91${p}`]));
  await mapLimit(phoneChunks, ENGAGEMENT_CONCURRENCY, async (variants) => {
    const { data, error } = await supabase.from("whatsapp_messages").select("phone, created_at").eq("direction", "inbound").in("phone", variants);
    if (error) throw new Error(error.message);
    for (const m of data || []) {
      const p = last10(m.phone);
      const at = sentAtByPhone.get(p);
      if (at && new Date(m.created_at) > new Date(at)) repliedPhones.add(p);
    }
  });
  return { clickedIds, repliedPhones };
}

export async function campaignResults({ campaignId, refresh = true, engagement = true }) {
  const campaign = await loadCampaign(campaignId);
  const cfg = normalizeConfig(campaign.config);
  if (refresh) await refreshDelivery(campaign.id);
  const rows = await fetchAllRows(() => supabase.from("campaign_recipients").select("mobile, status, sent_at, provider_message_id, skip_reason, error, delivery_status, delivery_error_code, offer_tier").eq("campaign_id", campaign.id));
  const tally = (key) => rows.reduce((acc, r) => { const k = r[key] || "none"; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  const sentRows = rows.filter((r) => r.status === "sent");
  const errorCodes = {};
  for (const r of rows) if (r.delivery_error_code) errorCodes[r.delivery_error_code] = (errorCodes[r.delivery_error_code] || 0) + 1;
  const sendErrors = {};
  for (const r of rows.filter((x) => x.status === "failed")) { const k = String(r.error || "unknown").slice(0, 80); sendErrors[k] = (sendErrors[k] || 0) + 1; }
  const { count: optOuts } = await supabase.from("whatsapp_opt_outs").select("phone10", { count: "exact", head: true }).gte("created_at", campaign.prepared_at || campaign.created_at);
  let enriched = rows;
  let engagementError = null;
  if (engagement) {
    // Replies and taps are a nice-to-have: if that scan fails, still return delivery, cost and failures.
    try {
      const { clickedIds, repliedPhones } = await engagementFor(rows);
      enriched = rows.map((r) => ({ ...r, clicked: clickedIds.has(r.provider_message_id), replied: repliedPhones.has(last10(r.mobile)) }));
    } catch (e) {
      engagementError = friendlyErrorMessage(e);
    }
  }
  const funnel = { ...computeFunnel(enriched), opted_out: optOuts || 0 };
  return {
    ok: true, campaign_id: campaign.id, name: campaign.name, status: campaign.status, template: cfg.template.name, send_after: campaign.send_after || null,
    engagement_error: engagementError,
    recipients: rows.length, funnel, by_status: tally("status"), delivery: tally("delivery_status"), by_offer_tier: tally("offer_tier"),
    delivery_error_codes: errorCodes, send_errors: sendErrors, skipped_reasons: tally("skip_reason"),
    opt_outs_since_prepared: optOuts || 0,
    trend_by_day: aggregateTrend(sentRows),
    cost_so_far_estimate: estimateCost(sentRows.length, cfg)
  };
}

/** Cross-campaign totals and a day trend over the last `days` days (default 30). Aggregates only. */
export async function marketingOverview({ days = 30, refresh = false } = {}) {
  const span = clamp(Math.floor(num(days, 30)), 1, 180);
  const since = new Date(Date.now() - span * 86400000).toISOString();
  const campaigns = await fetchAllRows(() => supabase.from("campaigns").select("id, name, status, config, created_at").not("config->template", "is", null).gte("created_at", new Date(Date.now() - 365 * 86400000).toISOString()));
  if (refresh) for (const c of campaigns.filter((x) => ["running", "completed", "paused"].includes(x.status)).slice(0, 10)) await refreshDelivery(c.id);
  const rows = await fetchAllRows(() => supabase.from("campaign_recipients").select("campaign_id, status, sent_at, delivery_status, delivery_error_code").eq("status", "sent").gte("sent_at", since));
  const cfgBy = new Map(campaigns.map((c) => [c.id, normalizeConfig(c.config)]));
  const trend = aggregateTrend(rows);
  const per = new Map();
  for (const r of rows) { const a = per.get(r.campaign_id) || []; a.push(r); per.set(r.campaign_id, a); }
  const perCampaign = campaigns.filter((c) => per.has(c.id)).map((c) => {
    const f = computeFunnel(per.get(c.id));
    return { campaign_id: c.id, name: c.name, status: c.status, sent: f.sent, delivered: f.delivered, read: f.read, failed: f.failed };
  });
  const totals = computeFunnel(rows);
  const cost = [...per.entries()].reduce((n, [id, rs]) => n + estimateCost(rs.length, cfgBy.get(id) || normalizeConfig({})).inr_with_gst, 0);
  const { count: optOuts } = await supabase.from("whatsapp_opt_outs").select("phone10", { count: "exact", head: true }).gte("created_at", since);
  return {
    ok: true, days: span, totals: { sent: totals.sent, delivered: totals.delivered, read: totals.read, failed: totals.failed, opted_out: optOuts || 0 },
    cost_estimate_inr_with_gst: cost, trend_by_day: trend, per_campaign: perCampaign,
    campaigns_by_status: campaigns.reduce((a, c) => { a[c.status] = (a[c.status] || 0) + 1; return a; }, {})
  };
}

// ---- opt-out ---------------------------------------------------------------------------------------------------------

export function isStopMessage(text) {
  return STOP_WORDS.test(String(text || ""));
}

export async function recordOptOut(phone, { source = "whatsapp_reply", reason = null } = {}) {
  const p = last10(phone);
  if (p.length !== 10) return { ok: false, error: "invalid phone" };
  const { error } = await supabase.from("whatsapp_opt_outs").upsert({ phone10: p, source, reason }, { onConflict: "phone10", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  return { ok: true };
}
