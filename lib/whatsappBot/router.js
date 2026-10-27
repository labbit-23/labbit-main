// Inbound intent router. Pure orchestration: every side effect goes through `deps`, so it is unit-testable with mocks.
// The existing bot (app/api/whatsapp/webhook) stays the default: the router only claims a message when its flag is on and the
// intent is clear; otherwise it returns { handled:false } and the old flow runs unchanged.
import { INTENTS } from "./constants.js";
import { classifyIntent } from "./intents.js";
import { flagOn } from "./settings.js";
import { resolveText } from "./texts.js";
import { windowState, staffOnline } from "./window.js";
import { phoneHash, last10 } from "./store.js";

const HUMAN_STATES = new Set(["handoff", "pending"]);

export async function handleInbound(input, deps) {
  // If anything fails AFTER a reply already went to the patient, report the message as handled: falling through to the legacy bot
  // would send a second, different reply. A failure before any send still falls through (the caller catches the throw).
  const state = { sent: false };
  const tracked = {
    ...deps,
    sendText: async (a) => { const r = await deps.sendText(a); state.sent = true; return r; },
    sendDocument: async (a) => { const r = await deps.sendDocument(a); state.sent = true; return r; }
  };
  try {
    return await route(input, tracked);
  } catch (err) {
    if (state.sent) {
      console.error("[whatsapp-bot] failed after replying; not falling through to the legacy flow", err?.message || err);
      return { handled: true, action: "error_after_reply" };
    }
    throw err;
  }
}

async function route(input, deps) {
  const settings = await deps.loadSettings();
  if (!settings.flags.global_enabled) return { handled: false, reason: "global_off" };

  const phone10 = last10(input.phone);
  const ph = phoneHash(input.phone);
  if (!ph) return { handled: false, reason: "bad_phone" };
  const nowMs = (deps.now ? deps.now() : Date.now());
  const inboundAt = input.messageTimestampMs && Number.isFinite(input.messageTimestampMs) ? input.messageTimestampMs : nowMs;
  const win = windowState(new Date(inboundAt).toISOString(), nowMs);
  const text = String(input.text || "").trim();
  const cls = classifyIntent(text, { isButton: Boolean(input.isButton) });

  let campaign = null;
  if (flagOn(settings, "campaign_attribution")) campaign = await deps.campaignContext(input.phone, settings.params.campaign_attribution_days).catch(() => null);

  const base = { phone: input.phone, phone_hash: ph, mrn: input.patient?.mrn || null, campaign_id: campaign?.campaign_id || null, offer_id: campaign?.offer_id || null };
  const track = (event_type, extra = {}) => (flagOn(settings, "tracker_enabled") ? deps.recordEvent({ ...base, event_type, ...extra }) : null);

  // ---- 1. record the inbound
  await track(input.isButton ? "button_tap" : "inbound_message", { direction: "in", intent: cls.intent, detail: input.isButton ? { button: text.slice(0, 40) } : { length: text.length } });

  // ---- 2. an open staff thread owns the conversation: append and stay quiet (patient can still say Hi for the menu)
  let thread = flagOn(settings, "inbox_enabled") ? await deps.findOpenThread(input.phone) : null;
  if (thread) {
    await deps.touchThreadInbound(thread);
    await deps.appendThreadMessage({ threadId: thread.id, direction: "in", sender: "patient", body: text, waMessageId: input.messageId || null });
    if (!cls.passthrough) return { handled: true, action: "appended_to_thread", thread_id: thread.id };
  }
  if (HUMAN_STATES.has(String(input.session?.status || "").toLowerCase())) return { handled: false, reason: "session_in_handoff" };
  if ((input.session?.current_state || "START") !== "START") return { handled: false, reason: "mid_flow" };
  if (cls.passthrough) return { handled: false, reason: "passthrough" };

  // ---- helpers
  const lang = "en";
  const say = async (key, vars = {}, { intent = cls.intent, eventType = "bot_reply", ref = null } = {}) => {
    const body = resolveText(key, { lang, vars, overrides: settings.texts });
    if (!win.open) {
      await track("window_closed_skip", { intent, detail: { text_key: key } });
      return { sent: false, body };
    }
    await deps.sendText({ phone: input.phone, labId: input.labId, text: body });
    await track(eventType, { direction: "out", intent, ref_id: ref, detail: { text_key: key } });
    if (thread) await deps.appendThreadMessage({ threadId: thread.id, direction: "out", sender: "bot", body });
    return { sent: true, body };
  };

  const handoff = async (reason, holdingKey = "holding_reply") => {
    if (!flagOn(settings, "human_handoff") || !flagOn(settings, "inbox_enabled")) return { handled: false, reason: "handoff_disabled" };
    let created = false;
    if (!thread) {
      thread = await deps.createThread({ phone: input.phone, labId: input.labId, mrn: base.mrn, displayName: input.patient?.name || input.profileName || null, reason, campaignId: base.campaign_id, offerId: base.offer_id, lastInboundAt: new Date(inboundAt).toISOString() });
      await deps.appendThreadMessage({ threadId: thread.id, direction: "in", sender: "patient", body: text, waMessageId: input.messageId || null });
      created = true;
      await deps.markSessionHandoff?.(input.session?.id);
      await track("handoff_created", { intent: cls.intent, thread_id: thread.id, detail: { reason } });
    }
    const key = holdingKey === "holding_reply" && !staffOnline(new Date(nowMs)) ? "holding_after_hours" : holdingKey;
    if (created) await say(key, {}, { eventType: "bot_reply" });
    return { handled: true, action: "handoff", reason, thread_id: thread.id };
  };

  // ---- 3. opt-in
  if (cls.intent === INTENTS.OPT_IN) {
    if (!flagOn(settings, "start_optin")) return { handled: false, reason: "flag_off" };
    await deps.removeOptOut(input.phone);
    await track("opt_in", { intent: cls.intent });
    await say("opt_in_ack");
    return { handled: true, action: "opt_in" };
  }

  // ---- 4. safety intents always go to people
  if (cls.intent === INTENTS.COMPLAINT) return handoff("complaint", "complaint_ack");
  if (cls.intent === INTENTS.MEDICAL_ADVICE) return handoff("medical_advice", "medical_advice_ack");

  // ---- 5. confidence gate
  if (cls.intent === INTENTS.UNKNOWN || cls.confidence < settings.params.min_confidence) {
    return handoff(cls.intent === INTENTS.UNKNOWN ? "unrecognised" : "low_confidence");
  }

  // ---- 6. automations
  if (cls.intent === INTENTS.REPORT_STATUS || cls.intent === INTENTS.REPORT_RESEND) {
    const resend = cls.intent === INTENTS.REPORT_RESEND;
    if (!flagOn(settings, resend ? "report_resend" : "report_status")) return { handled: false, reason: "flag_off" };
    return reportFlow({ resend, input, cls, settings, deps, say, handoff, track, ph, win });
  }

  if (cls.intent === INTENTS.BOOK_FOLLOWUP) {
    if (!flagOn(settings, "book_followup")) return { handled: false, reason: "flag_off" };
    const since = new Date(nowMs - settings.params.booking_dedupe_hours * 3600000).toISOString();
    if ((await deps.countEvents({ phoneHash: ph, eventType: "booking_created", sinceIso: since })) > 0) {
      await say("booking_already");
      return { handled: true, action: "booking_duplicate" };
    }
    let enquiryId = null;
    try {
      enquiryId = await deps.submitEnquiry({
        phone: input.phone,
        name: input.patient?.name || input.profileName || "WhatsApp patient",
        item: cls.entities.item || null,
        campaign: campaign ? { campaign_id: campaign.campaign_id, offer_id: campaign.offer_id, name: campaign.campaign_name } : null,
        mrn: base.mrn
      });
    } catch { enquiryId = null; }
    if (!enquiryId) return handoff("booking_failed");
    await track("booking_created", { intent: cls.intent, ref_id: enquiryId, detail: { has_item: Boolean(cls.entities.item) } });
    await say(cls.entities.item ? "booking_ack_with_item" : "booking_ack", { item: cls.entities.item || "" });
    return { handled: true, action: "booking_created", enquiry_id: enquiryId };
  }

  if (cls.intent === INTENTS.PACKAGE_ENQUIRY) {
    if (!flagOn(settings, "package_enquiry")) return { handled: false, reason: "flag_off" };
    const rows = await deps.searchCatalog(cls.entities.term || "", settings.params.catalog_max_results).catch(() => []);
    if (!rows.length) return handoff("catalogue_miss", "package_no_match");
    const lines = rows.map((r) => resolveText("package_line", { lang, vars: { name: r.name, price: r.price }, overrides: settings.texts }));
    const body = [resolveText("package_intro", { lang, overrides: settings.texts }), ...lines, resolveText("package_outro", { lang, overrides: settings.texts })].join("\n");
    if (!win.open) { await track("window_closed_skip", { intent: cls.intent }); return { handled: true, action: "window_closed" }; }
    await deps.sendText({ phone: input.phone, labId: input.labId, text: body });
    await track("package_info_sent", { direction: "out", intent: cls.intent, detail: { results: rows.length } });
    return { handled: true, action: "package_info", results: rows.length };
  }

  return { handled: false, reason: "no_route" };
}

async function reportFlow({ resend, input, cls, settings, deps, say, handoff, track, ph }) {
  // The lookup is keyed by the SENDER's phone, so only reports registered to this number can ever be found.
  const reports = await deps.lookupReports(last10(input.phone)).catch(() => null);
  if (reports === null) return handoff("bot_error");
  if (!reports.length) return handoff("report_not_found", "report_not_found");

  let target = reports[0];
  if (cls.entities.reqno) {
    const wanted = String(cls.entities.reqno).toUpperCase();
    target = reports.find((r) => String(r.reqno || "").toUpperCase() === wanted);
    if (!target) return handoff("phone_mismatch", "report_phone_mismatch"); // never confirm whether that requisition exists
  }
  const status = await deps.getReportStatus(target.reqno).catch(() => null);
  if (!status) return handoff("bot_error");
  const full = String(status.overall_status || "") === "FULL_REPORT";
  const statusMessage = deps.buildStatusMessage(status) || "";

  if (!resend) {
    await track("report_status_sent", { intent: cls.intent, ref_id: target.reqno, detail: { overall_status: status.overall_status || null } });
    if (full) await say("report_ready_status", {}, { ref: target.reqno });
    else await say("report_status_line", { status_message: statusMessage }, { ref: target.reqno });
    return { handled: true, action: "report_status", overall_status: status.overall_status || null };
  }

  if (!full) {
    await say("report_not_complete", { status_message: statusMessage }, { ref: target.reqno });
    return { handled: true, action: "report_not_complete" };
  }
  const since = new Date((deps.now ? deps.now() : Date.now()) - 86400000).toISOString();
  if ((await deps.countEvents({ phoneHash: ph, eventType: "report_resent", sinceIso: since })) >= settings.params.report_resend_max_per_day) {
    return handoff("resend_limit", "report_resend_limit");
  }
  const url = deps.getReportUrl(target.reqid, target.reqno);
  if (!url || (deps.isPdfReachable && !(await deps.isPdfReachable(url)))) return handoff("bot_error");
  const s = await say("report_sending", {}, { ref: target.reqno });
  if (!s.sent) return { handled: true, action: "window_closed" };
  await deps.sendDocument({ phone: input.phone, labId: input.labId, documentUrl: url, filename: "SDRC_Report.pdf", caption: resolveText("report_resend_caption", { overrides: settings.texts }) });
  await track("report_resent", { direction: "out", intent: cls.intent, ref_id: target.reqno });
  return { handled: true, action: "report_resent" };
}
