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
//
// campaigns.config:
//   template  { name, language, header_image_url?, params:[variable names -> patientMessageJobs/variables.js], buttons:[{index,text}]? }
//   segment   { type: "package"|"inactive", last_visit_before?, last_visit_after?, min_visits? }   (labit-core definitions)
//   limits    { per_run_cap, daily_cap, rate_per_minute, window_start_hhmm, window_end_hhmm, cooldown_days }
//   cost      { per_message_inr, gst_rate }
// The limits are clamped to the HARD_* ceilings below and the send window can only be narrowed inside 09:00-20:00 IST.

import { supabase } from "@/lib/supabaseServer";
import { digitsOnly, toCanonicalIndiaPhone } from "@/lib/phone";
import { sendTemplateMessage } from "@/lib/whatsapp/sender";
import { extractProviderMessageId, logReportDispatch } from "@/lib/reportDispatchLogs";
import { resolveParam } from "@/lib/patientMessageJobs/variables";
import { getTrendReportUrl } from "@/lib/neosoft/client";

const CORE_BASE = String(process.env.LABIT_CORE_BASE_URL || process.env.LABIT_CORE_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

const HARD_PER_RUN_CAP = 500;
const HARD_DAILY_CAP = 5000;
const HARD_RATE_PER_MINUTE = 120;
const WINDOW_START = "09:00";
const WINDOW_END = "20:00";
const SEGMENTS = ["package", "inactive"];
const STOP_WORDS = /^\s*(stop|unsubscribe|opt[\s-]?out|stop promotions?|stop messages?)\s*[.!]?\s*$/i;

// Meta-estimate defaults. ASSUMPTION, not a quote: India marketing-category per-message rate of about Rs 0.78-0.80 (Meta, from the
// 2025 per-message price list) plus the BSP markup, GST extra. Override per campaign in config.cost, or via env, with the Mtalkz rate card.
const DEFAULT_COST_PER_MESSAGE_INR = Number(process.env.MARKETING_COST_PER_MESSAGE_INR || 0.88);
const DEFAULT_GST_RATE = 0.18;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
      name: String(t.name || "").trim(),
      language: String(t.language || "en").trim() || "en",
      header_image_url: String(t.header_image_url || "").trim() || null,
      params: Array.isArray(t.params) ? t.params.map((p) => String(p).trim()) : [],
      buttons: Array.isArray(t.buttons) ? t.buttons.map((b) => ({ index: num(b?.index, 0), text: String(b?.text ?? "").trim() })) : [],
      // How long the per-patient "view my summary" link stays valid (days); only used when a button carries {summary_token}.
      link_valid_days: clamp(num(t.link_valid_days, 30), 1, 90)
    },
    segment: {
      type: String(seg.type || "").trim(),
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

export function validateConfig(cfg) {
  const errors = [];
  if (!cfg.template.name) errors.push("template.name is required");
  if (!SEGMENTS.includes(cfg.segment.type)) errors.push(`segment.type must be one of ${SEGMENTS.join(", ")}`);
  for (const p of cfg.template.params) {
    try { resolveParam(p, {}); } catch (err) { errors.push(err.message); }
  }
  if (cfg.template.header_image_url && !/^https:\/\//i.test(cfg.template.header_image_url)) errors.push("template.header_image_url must be https");
  if (cfg.limits.window_start_hhmm >= cfg.limits.window_end_hhmm) errors.push("send window is empty");
  return errors;
}

export function estimateCost(count, cfg) {
  const ex = count * cfg.cost.per_message_inr;
  return { per_message_inr: cfg.cost.per_message_inr, gst_rate: cfg.cost.gst_rate, messages: count, inr_ex_gst: Math.round(ex), inr_with_gst: Math.round(ex * (1 + cfg.cost.gst_rate)) };
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

async function fetchAudience(cfg) {
  const token = String(process.env.CAMPAIGN_AUDIENCE_TOKEN || "").trim();
  if (!token) throw new Error("CAMPAIGN_AUDIENCE_TOKEN is not configured");
  const qs = new URLSearchParams({ segment: cfg.segment.type, min_visits: String(cfg.segment.min_visits) });
  if (cfg.segment.last_visit_before) qs.set("last_visit_before", cfg.segment.last_visit_before);
  if (cfg.segment.last_visit_after) qs.set("last_visit_after", cfg.segment.last_visit_after);
  if (usesSummaryToken(cfg)) qs.set("link_valid_days", String(cfg.template.link_valid_days));
  const res = await fetch(`${CORE_BASE}/internal/campaign-audience?${qs}`, {
    headers: { Accept: "application/json", "X-Internal-Token": token },
    cache: "no-store",
    signal: AbortSignal.timeout(150000)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.detail || `labit-core audience returned ${res.status}`);
  return body; // { segment, stats, rows:[{phone,mrn,name,last_visit,last_package,...}] }
}

async function optOutSet() {
  const rows = await fetchAllRows(() => supabase.from("whatsapp_opt_outs").select("phone10"));
  return new Set(rows.map((r) => r.phone10));
}

// Phones that got (or are being sent) a campaign message inside the cooldown, from ANY campaign.
async function recentlyMessagedSet(cooldownDays, exceptCampaignId) {
  if (!cooldownDays) return new Set();
  const since = new Date(Date.now() - cooldownDays * 86400000).toISOString();
  const rows = await fetchAllRows(() =>
    supabase.from("campaign_recipients").select("mobile").in("status", ["sent", "sending"]).gte("sent_at", since).neq("campaign_id", exceptCampaignId)
  );
  return new Set(rows.map((r) => last10(r.mobile)));
}

// ---- actions ---------------------------------------------------------------------------------------------------------

export async function createCampaign({ labId, name, config }) {
  const cfg = normalizeConfig(config);
  const errors = validateConfig(cfg);
  if (errors.length) return { ok: false, error: errors.join("; ") };
  const { data, error } = await supabase
    .from("campaigns")
    .insert({ name: String(name || "").trim() || `${cfg.segment.type} campaign`, segment_type: cfg.segment.type, date: istParts().date, status: "draft", config: cfg, lab_id: labId || null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { ok: true, campaign_id: data.id, config: cfg };
}

/** dryRun: counts + anonymised sample + cost; writes nothing. Otherwise stores the recipients and marks the campaign prepared. */
export async function prepareCampaign({ campaignId, dryRun = true }) {
  const campaign = await loadCampaign(campaignId);
  const cfg = normalizeConfig(campaign.config);
  const errors = validateConfig(cfg);
  if (errors.length) return { ok: false, error: errors.join("; ") };
  if (!["draft", "prepared"].includes(campaign.status)) return { ok: false, error: `campaign is ${campaign.status}; cannot prepare` };

  const audience = await fetchAudience(cfg);
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

  const perDay = cfg.limits.daily_cap;
  const result = {
    ok: true,
    dry_run: dryRun,
    campaign_id: campaign.id,
    template: { name: cfg.template.name, has_header_image: Boolean(cfg.template.header_image_url), params: cfg.template.params },
    limits: cfg.limits,
    stats,
    sample: eligible.slice(0, 5).map(anonymise),
    cost_estimate: estimateCost(eligible.length, cfg),
    days_to_complete_at_daily_cap: Math.ceil(eligible.length / perDay)
  };
  if (dryRun) return result;

  const { count: nonPending } = await supabase.from("campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id).neq("status", "pending");
  if (nonPending) return { ok: false, error: "campaign already has sent/skipped recipients; create a new campaign instead" };
  await supabase.from("campaign_recipients").delete().eq("campaign_id", campaign.id).eq("status", "pending");
  for (let i = 0; i < eligible.length; i += 500) {
    const chunk = eligible.slice(i, i + 500).map((r) => ({
      campaign_id: campaign.id, mobile: toCanonicalIndiaPhone(r.phone), mrno: r.mrn || null, name: r.name || null,
      last_visit: r.last_visit || null, last_package: r.last_package || null, link_token: r.summary_token || null, status: "pending"
    }));
    const { error } = await supabase.from("campaign_recipients").insert(chunk);
    if (error) throw new Error(error.message);
  }
  await supabase.from("campaigns").update({ status: "prepared", prepared_at: new Date().toISOString() }).eq("id", campaign.id);
  return result;
}

async function sendOne({ labId, campaign, cfg, recipient }) {
  const ctx = {
    patient_name: recipient.name, mrn: recipient.mrno, last_package: recipient.last_package, last_visit: recipient.last_visit,
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
export async function sendBatch({ labId, campaignId, batchSize, timeBudgetMs = 45000 }) {
  const campaign = await loadCampaign(campaignId);
  const cfg = normalizeConfig(campaign.config);
  if (!["prepared", "running"].includes(campaign.status)) return { ok: false, error: `campaign is ${campaign.status}; send needs prepared/running` };
  if (!withinSendWindow(cfg)) return { ok: true, sent: 0, more: true, stopped_reason: `outside send window ${cfg.limits.window_start_hhmm}-${cfg.limits.window_end_hhmm} IST` };

  // A crash mid-send leaves rows 'sending'. They may or may not have gone out, so they are failed (never retried): no double-send.
  await supabase.from("campaign_recipients").update({ status: "failed", error: "interrupted" })
    .eq("campaign_id", campaign.id).eq("status", "sending").lt("delivery_updated_at", new Date(Date.now() - 15 * 60000).toISOString());

  const { count: sentToday } = await supabase.from("campaign_recipients").select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id).eq("status", "sent").gte("sent_at", istMidnightIso());
  const dailyLeft = cfg.limits.daily_cap - (sentToday || 0);
  if (dailyLeft <= 0) return { ok: true, sent: 0, more: true, stopped_reason: "daily cap reached" };
  const want = clamp(num(batchSize, cfg.limits.per_run_cap), 1, Math.min(cfg.limits.per_run_cap, dailyLeft));

  await supabase.from("campaigns").update({ status: "running" }).eq("id", campaign.id);
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
      else if (!withinSendWindow(cfg)) { stoppedReason = "send window closed"; }
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
    const res = await sendOne({ labId, campaign, cfg, recipient: r });
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
  const { error } = await supabase.from("campaigns").update({ status: "stopped", stopped_at: new Date().toISOString() }).eq("id", campaignId).in("status", ["draft", "prepared", "running", "paused"]);
  if (error) throw new Error(error.message);
  return { ok: true, campaign_id: campaignId, status: "stopped" };
}

export async function resumeCampaign({ campaignId }) {
  const { error } = await supabase.from("campaigns").update({ status: "prepared" }).eq("id", campaignId).eq("status", "paused");
  if (error) throw new Error(error.message);
  return { ok: true, campaign_id: campaignId, status: "prepared" };
}

/** Staff-number test send of the real template. No recipient rows, no caps; ignores the quiet window by design. */
export async function testSend({ labId, campaignId, numbers }) {
  const campaign = await loadCampaign(campaignId);
  const cfg = normalizeConfig(campaign.config);
  const out = [];
  for (const n of (Array.isArray(numbers) ? numbers : []).slice(0, 10)) {
    const mobile = toCanonicalIndiaPhone(n);
    if (!mobile) { out.push({ ok: false, error: "invalid phone" }); continue; }
    const res = await sendOne({ labId, campaign, cfg, recipient: { mobile, name: "Test Patient", mrno: "TEST", last_package: "Executive Health Checkup", last_visit: "2025-01-01" } });
    out.push({ phone_masked: anonymise({ phone: mobile }).phone_masked, ...res });
  }
  return { ok: true, results: out };
}

// ---- results ---------------------------------------------------------------------------------------------------------

const RANK = { failed: 0, sent: 1, delivered: 2, read: 3 };

/** Pulls Meta status webhook events (whatsapp_messages direction=status) onto the recipient rows. */
export async function refreshDelivery(campaignId) {
  const sent = await fetchAllRows(() => supabase.from("campaign_recipients").select("id, provider_message_id, delivery_status").eq("campaign_id", campaignId).eq("status", "sent").not("provider_message_id", "is", null));
  const ids = sent.map((r) => r.provider_message_id);
  const best = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from("whatsapp_messages").select("message_id, payload").eq("direction", "status").in("message_id", ids.slice(i, i + 200));
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
    for (let i = 0; i < pmids.length; i += 200) {
      await supabase.from("campaign_recipients").update({ delivery_status: status, delivery_error_code: code || null, delivery_updated_at: new Date().toISOString() }).eq("campaign_id", campaignId).in("provider_message_id", pmids.slice(i, i + 200));
    }
  }
}

export async function campaignResults({ campaignId, refresh = true }) {
  const campaign = await loadCampaign(campaignId);
  const cfg = normalizeConfig(campaign.config);
  if (refresh) await refreshDelivery(campaign.id);
  const rows = await fetchAllRows(() => supabase.from("campaign_recipients").select("status, skip_reason, error, delivery_status, delivery_error_code").eq("campaign_id", campaign.id));
  const tally = (key) => rows.reduce((acc, r) => { const k = r[key] || "none"; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  const sentRows = rows.filter((r) => r.status === "sent");
  const errorCodes = {};
  for (const r of rows) if (r.delivery_error_code) errorCodes[r.delivery_error_code] = (errorCodes[r.delivery_error_code] || 0) + 1;
  const sendErrors = {};
  for (const r of rows.filter((x) => x.status === "failed")) { const k = String(r.error || "unknown").slice(0, 80); sendErrors[k] = (sendErrors[k] || 0) + 1; }
  const { count: optOuts } = await supabase.from("whatsapp_opt_outs").select("phone10", { count: "exact", head: true }).gte("created_at", campaign.prepared_at || campaign.created_at);
  return {
    ok: true, campaign_id: campaign.id, name: campaign.name, status: campaign.status, template: cfg.template.name,
    recipients: rows.length, by_status: tally("status"), delivery: tally("delivery_status"),
    delivery_error_codes: errorCodes, send_errors: sendErrors, skipped_reasons: tally("skip_reason"),
    opt_outs_since_prepared: optOuts || 0,
    cost_so_far_estimate: estimateCost(sentRows.length, cfg)
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
