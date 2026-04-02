import { supabase } from "@/lib/supabaseServer";
import {
  getOrCreateSession,
  createFreshSession,
  updateSession,
  handoffToHuman
} from "@/lib/whatsapp/sessions";
import { detectIntent, processMessage } from "@/lib/whatsapp/engine";
import { getLatestReportMeta, getReportStatus, getRadiologyReport } from "@/lib/neosoft/client";
import { buildReportStatusMessage } from "@/lib/neosoft/reportStatusMessage";
import {
  createReportRequestClickupTask,
  createWhatsappFollowupClickupTask
} from "@/lib/clickup";
import {
  sendTextMessage,
  sendDocumentMessage,
  sendMainMenu,
  sendMoreServicesMenu,
  sendReportInputPrompt,
  sendReportHistoryTrendMenu,
  sendReportPostDownloadMenu,
  sendReportSelectionMenu,
  sendFeedbackActionMenu,
  sendLocationMessage,
  sendLocationOptionsMenu,
  sendBranchLocationsMenu,
  sendBookingDateMenu,
  sendBookingServicesMenu,
  sendBookingSlotMenu,
  sendBookingLocationMenu,
  sendBookingPostConfirmLocationMenu,
  sendPackageMenu,
  sendPackageVariantMenu,
  runWithWhatsappSendContext
} from "@/lib/whatsapp/sender";
import healthPackagesData from "@/lib/data/health-packages.json";
import { digitsOnly, phoneVariantsIndia, toCanonicalIndiaPhone } from "@/lib/phone";
import { extractProviderMessageId, logReportDispatch } from "@/lib/reportDispatchLogs";
import { saveReportFeedback } from "@/lib/reportFeedback";
import crypto from "node:crypto";

const BOT_START_KEYWORDS = new Set([
  "HI",
  "HAI",
  "HELLO",
  "HEY",
  "HII",
  "HLO",
  "MAIN_MENU",
  "MAIN MENU",
  "MENU",
  "REQUEST_REPORTS",
  "REQUEST REPORTS",
  "REQUEST REPORT",
  "REPORT_DOWNLOAD_LATEST",
  "REPORT_PREVIOUS_TRENDS",
  "LATEST REPORT",
  "PREVIOUS/TRENDS",
  "PREVIOUS REPORTS",
  "BOOK_HOME_VISIT",
  "MORE_SERVICES"
]);
const FEEDBACK_IDLE_DELAY_MS = 60 * 1000;
const FEEDBACK_MAX_COMMENT_LEN = 500;
const DELIVERY_FAILED_ACK_COOLDOWN_MS = 30 * 60 * 1000;
const IST_EXECUTIVE_OPEN_HOUR = 7;
const IST_EXECUTIVE_CLOSE_HOUR = 23;
const AGENT_TAKEOVER_GREETING_GUARD_MINUTES = 5;

function normalizeCommandLikeInput(value) {
  const raw = String(value || "").trim();
  const normalized = raw.replace(/\s+/g, " ").toUpperCase();
  const normalizedGreeting = raw
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  const normalizedUnderscore = normalizedGreeting.replace(/\s+/g, "_");
  return { raw, normalized, normalizedGreeting, normalizedUnderscore };
}

function isThankYouLikeInput(value) {
  const { raw, normalizedGreeting } = normalizeCommandLikeInput(value);
  const compact = normalizedGreeting.replace(/\s+/g, "");
  if (!compact && !raw) return false;
  if (raw.includes("🙏")) return true;
  if (compact === "TY" || compact === "TQ" || compact === "TNX" || compact === "THX") return true;
  if (compact.includes("THANKYOU") || compact.includes("THANKS")) return true;
  return false;
}

function isMainMenuGreetingInput(value) {
  const { normalized, normalizedGreeting, normalizedUnderscore } = normalizeCommandLikeInput(value);
  const keys = new Set([
    "HI",
    "HII",
    "HAI",
    "HELLO",
    "HEY",
    "MENU",
    "MAIN MENU",
    "MAIN_MENU"
  ]);
  return (
    keys.has(normalized) ||
    keys.has(normalizedGreeting) ||
    keys.has(normalizedUnderscore)
  );
}

function isRecentAgentTakeover(session, windowMinutes = AGENT_TAKEOVER_GREETING_GUARD_MINUTES) {
  const lastHandledBy = String(session?.context?.last_handled_by || "").toLowerCase();
  const lastHandledAt = String(session?.context?.last_handled_at || "").trim();
  if (lastHandledBy !== "agent" || !lastHandledAt) return false;
  const handledMs = new Date(lastHandledAt).getTime();
  if (!Number.isFinite(handledMs)) return false;
  const ageMinutes = (Date.now() - handledMs) / (60 * 1000);
  return ageMinutes >= 0 && ageMinutes < windowMinutes;
}

function canOfferPostReportFeedback(context = {}) {
  if (context?.suppress_feedback_once) return false;
  const deliveredAt = String(context?.last_report_delivery_at || "").trim();
  if (!deliveredAt) return false;
  const deliveredMs = new Date(deliveredAt).getTime();
  if (!Number.isFinite(deliveredMs)) return false;

  // Keep feedback relevance tightly tied to recent report delivery.
  const ageMs = Date.now() - deliveredMs;
  return ageMs >= 0 && ageMs <= 24 * 60 * 60 * 1000;
}

function canOfferResolvedFeedback(context = {}) {
  if (context?.suppress_feedback_once) return false;
  if (!context?.last_resolution_feedback_armed) return false;
  const resolvedAt = String(context?.last_resolution_at || "").trim();
  if (!resolvedAt) return false;
  const resolvedMs = new Date(resolvedAt).getTime();
  if (!Number.isFinite(resolvedMs)) return false;
  const ageMs = Date.now() - resolvedMs;
  return ageMs >= 0 && ageMs <= 7 * 24 * 60 * 60 * 1000;
}

function getIstHour(date = new Date()) {
  try {
    const hourText = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      hour12: false
    }).format(date);
    const hour = Number(hourText);
    return Number.isFinite(hour) ? hour : 0;
  } catch {
    return 0;
  }
}

function isWithinExecutiveWorkingHours(now = new Date()) {
  const hour = getIstHour(now);
  return hour >= IST_EXECUTIVE_OPEN_HOUR && hour < IST_EXECUTIVE_CLOSE_HOUR;
}

function getFeedbackFlow(context) {
  const flow = context?.feedback_flow || context?.post_report_feedback;
  return flow && typeof flow === "object" ? flow : null;
}

function withFeedbackFlowContext(context, flow) {
  const next = { ...(context || {}) };
  delete next.post_report_feedback;
  if (!flow) {
    delete next.feedback_flow;
    return next;
  }
  next.feedback_flow = flow;
  return next;
}

function parseFeedbackRating(input) {
  const text = String(input || "").trim();
  if (!text) return null;
  const exact = text.match(/^[1-5]$/);
  if (exact) return Number(exact[0]);
  const fallback = text.match(/\b([1-5])\b/);
  return fallback ? Number(fallback[1]) : null;
}

function isHelpChoice(input) {
  const text = String(input || "").trim().toUpperCase();
  return ["HELP", "EXECUTIVE", "AGENT", "CONNECT", "TALK TO EXECUTIVE", "FEEDBACK_HELP"].includes(text);
}

function isDoneChoice(input) {
  const text = String(input || "").trim().toUpperCase();
  return ["DONE", "CLOSE", "NO", "OK", "FEEDBACK_DONE"].includes(text);
}

function isComplaintChoice(input) {
  const text = String(input || "").trim().toUpperCase();
  return ["FEEDBACK_COMPLAINT", "COMPLAINT", "RAISE COMPLAINT"].includes(text);
}

function isSkipChoice(input) {
  const text = String(input || "").trim().toUpperCase();
  return ["SKIP", "NONE", "NO COMMENTS", "NA", "N/A"].includes(text);
}

function feedbackRatingPromptText() {
  return [
    "We hope your report was delivered successfully.",
    "Please rate your experience (1-5):",
    "1 - Very Poor",
    "2 - Poor",
    "3 - Okay",
    "4 - Good",
    "5 - Excellent"
  ].join("\n");
}

function feedbackLowRatingPromptText() {
  return [
    "We're sorry your experience was not great.",
    "What should we improve most?",
    "Reply with one option:",
    "1 - Delay",
    "2 - Report clarity",
    "3 - Staff support",
    "4 - Other"
  ].join("\n");
}

function parseLowRatingReason(input) {
  const text = String(input || "").trim().toUpperCase();
  if (!text) return null;
  const map = {
    "1": "delay",
    "2": "report_clarity",
    "3": "staff_support",
    "4": "other"
  };
  if (map[text]) return map[text];
  if (text.includes("DELAY")) return "delay";
  if (text.includes("CLARITY") || text.includes("REPORT")) return "report_clarity";
  if (text.includes("STAFF") || text.includes("SUPPORT")) return "staff_support";
  if (text.includes("OTHER")) return "other";
  return null;
}

function feedbackClosureText(labName) {
  return `Marking this chat as closed. Say "Hi" to reopen the chat at any time, or "Help" to connect to an executive. Thank you for your patronage to ${labName || "our lab"}.`;
}

async function persistWhatsappFeedback({
  session,
  flow,
  phone,
  reqid,
  reqno
}) {
  const saveResult = await saveReportFeedback({
    reqid: String(reqid || flow?.reqid || "").trim() || null,
    reqno: String(reqno || flow?.reqno || "").trim() || null,
    labId: session?.lab_id || null,
    patientPhone: digitsOnly(phone || "").slice(-10) || null,
    rating: Number(flow?.rating || 0),
    feedback: flow?.comment ? String(flow.comment).slice(0, FEEDBACK_MAX_COMMENT_LEN) : null,
    source: "whatsapp",
    actorUserId: null,
    actorName: "WhatsApp Bot",
    actorRole: "bot",
    metadata: {
      captured_via: flow?.trigger_source || "whatsapp_bot_feedback",
      session_id: session?.id || null,
      stage: flow?.stage || null,
      rated_at: flow?.rated_at || null,
      comment_at: flow?.comment_at || null,
      low_rating_reason: flow?.low_rating_reason || null,
      resolution_by: session?.context?.last_resolution_by || null,
      resolution_at: session?.context?.last_resolution_at || null
    }
  });
  if (!saveResult.ok) {
    const error = saveResult.error || {};
    console.error("[whatsapp-feedback] insert failed", {
      code: error?.code || null,
      message: error?.message || "Unknown error",
      details: error?.details || null,
      sessionId: session?.id || null
    });
    return { ok: false, reason: "insert_failed" };
  }
  return { ok: true };
}

async function createFeedbackComplaintEvent({
  session,
  phone,
  flow,
  lab
}) {
  const nowIso = new Date().toISOString();
  const complaintText = String(flow?.comment || "").trim() || `Low rating ${Number(flow?.rating || 0)}/5`;
  const fingerprint = crypto
    .createHash("sha1")
    .update([
      String(session?.lab_id || ""),
      String(phone || ""),
      String(flow?.reqno || ""),
      String(flow?.rated_at || nowIso),
      complaintText
    ].join("|"))
    .digest("hex");

  try {
    const { error } = await supabase.from("cto_events").insert({
      lab_id: String(session?.lab_id || ""),
      source: "whatsapp-feedback",
      service_key: "whatsapp_feedback",
      event_type: "customer_complaint",
      severity: "high",
      status: "open",
      fingerprint,
      message: `Customer complaint from ${String(phone || "").trim()} (${lab?.name || "lab"})`,
      payload: {
        patient_phone: String(phone || "").trim(),
        rating: Number(flow?.rating || 0),
        feedback: complaintText,
        reqid: String(flow?.reqid || "").trim() || null,
        reqno: String(flow?.reqno || "").trim() || null,
        captured_via: String(flow?.trigger_source || "feedback_complaint").trim() || null
      },
      first_seen_at: nowIso,
      last_seen_at: nowIso
    });
    if (error) {
      console.error("[whatsapp-feedback] complaint event insert failed", error);
    }
  } catch (err) {
    console.error("[whatsapp-feedback] complaint event error", err);
  }
}

function schedulePostReportFeedbackPrompt({
  sessionId,
  labId,
  phone,
  reqid,
  reqno,
  baselineInboundAt
}) {
  setTimeout(async () => {
    try {
      const { data: activeSession } = await supabase
        .from("chat_sessions")
        .select("id,lab_id,phone,status,context")
        .eq("id", sessionId)
        .maybeSingle();

      if (!activeSession?.id) return;

      const currentStatus = String(activeSession.status || "").toLowerCase();
      if (["resolved", "closed"].includes(currentStatus)) return;
      if (getFeedbackFlow(activeSession.context)?.stage) return;
      if (!activeSession?.context?.last_report_feedback_armed) return;
      if (!canOfferPostReportFeedback(activeSession.context || {})) return;

      const { data: latestInbound } = await supabase
        .from("whatsapp_messages")
        .select("created_at")
        .eq("lab_id", labId)
        .eq("phone", phone)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const baselineMs = new Date(baselineInboundAt || 0).getTime();
      const latestInboundMs = new Date(latestInbound?.created_at || 0).getTime();
      if (Number.isFinite(latestInboundMs) && Number.isFinite(baselineMs) && latestInboundMs > baselineMs + 1000) {
        return;
      }

      await sendTextMessage({
        labId: labId,
        phone,
        text: feedbackRatingPromptText()
      });

      const nextContext = withFeedbackFlowContext(activeSession.context, {
        stage: "awaiting_rating",
        trigger_source: "report_delivery_feedback",
        reqid: reqid || null,
        reqno: reqno || null,
        prompted_at: new Date().toISOString()
      });

      await supabase
        .from("chat_sessions")
        .update({
          context: nextContext,
          updated_at: new Date().toISOString()
        })
        .eq("id", sessionId);
    } catch (err) {
      console.error("[whatsapp-feedback] schedule failed", {
        sessionId,
        error: err?.message || String(err)
      });
    }
  }, FEEDBACK_IDLE_DELAY_MS);
}

async function handlePostReportFeedbackInbound({
  session,
  phone,
  userInput,
  lab,
  templates
}) {
  if (session?.context?.suppress_feedback_once) return { handled: false };
  const flow = getFeedbackFlow(session?.context);
  if (!flow?.stage) return { handled: false };

  const nowIso = new Date().toISOString();
  const currentStage = String(flow.stage || "").toLowerCase();
  const trimmedInput = String(userInput || "").trim();
  const { normalized, normalizedGreeting, normalizedUnderscore } = normalizeCommandLikeInput(trimmedInput);
  const isEscapeIntent =
    isMainMenuGreetingInput(trimmedInput) ||
    BOT_START_KEYWORDS.has(normalized) ||
    BOT_START_KEYWORDS.has(normalizedGreeting) ||
    BOT_START_KEYWORDS.has(normalizedUnderscore) ||
    Boolean(detectIntent(trimmedInput));

  if (isEscapeIntent) {
    const clearedContext = {
      ...withFeedbackFlowContext(session.context, null),
      last_report_feedback_armed: false,
      last_resolution_feedback_armed: false,
      last_report_feedback_disarmed_at: nowIso
    };
    await supabase
      .from("chat_sessions")
      .update({
        context: clearedContext,
        updated_at: nowIso
      })
      .eq("id", session.id);
    return { handled: false };
  }

  const ratingInput = parseFeedbackRating(trimmedInput);
  const needsExecutive = isHelpChoice(trimmedInput);
  const doneChoice = isDoneChoice(trimmedInput);
  const complaintChoice = isComplaintChoice(trimmedInput);
  const skipChoice = isSkipChoice(trimmedInput);
  const botFlowConfig = templates?.bot_flow || {};
  let actionFlow = flow;

  const saveFeedbackAndMark = async (currentFlow) => {
    if (currentFlow?.saved_at) return currentFlow;
    const saveResult = await persistWhatsappFeedback({
      session,
      flow: currentFlow,
      phone,
      reqid: currentFlow?.reqid || null,
      reqno: currentFlow?.reqno || null
    });
    if (!saveResult.ok) return currentFlow;
    return {
      ...currentFlow,
      saved_at: nowIso
    };
  };

  if (currentStage === "awaiting_rating") {
    if (!ratingInput) return { handled: false };

    const nextFlow = {
      ...flow,
      stage: ratingInput <= 3 ? "awaiting_low_rating_reason" : "awaiting_comment",
      rating: ratingInput,
      rated_at: nowIso
    };
    await supabase
      .from("chat_sessions")
      .update({
        context: withFeedbackFlowContext(session.context, nextFlow),
        updated_at: nowIso
      })
      .eq("id", session.id);

    if (ratingInput <= 3) {
      await sendTextMessage({
        labId: session.lab_id,
        phone,
        text: feedbackLowRatingPromptText()
      });
    } else {
      await sendTextMessage({
        labId: session.lab_id,
        phone,
        text: `Thank you for rating us ${ratingInput}/5.\nPlease share your comments (optional).`
      });
    }
    return { handled: true };
  }

  if (currentStage === "awaiting_low_rating_reason") {
    const reason = parseLowRatingReason(trimmedInput);
    if (!reason) return { handled: false };

    const nextFlow = {
      ...flow,
      stage: "awaiting_comment",
      low_rating_reason: reason,
      low_rating_reason_at: nowIso
    };
    await supabase
      .from("chat_sessions")
      .update({
        context: withFeedbackFlowContext(session.context, nextFlow),
        updated_at: nowIso
      })
      .eq("id", session.id);

    await sendTextMessage({
      labId: session.lab_id,
      phone,
      text: "Thank you. Please share your comments (optional), or reply SKIP."
    });
    return { handled: true };
  }

  if (currentStage === "awaiting_comment") {
    let nextFlow = { ...flow };
    const currentRating = Number(nextFlow?.rating || 0);
    if (needsExecutive || doneChoice) {
      nextFlow.stage = "awaiting_action";
      nextFlow.comment = nextFlow.comment || null;
    } else if (skipChoice) {
      nextFlow.stage = "awaiting_action";
      nextFlow.comment = null;
      nextFlow.comment_at = nowIso;
    } else if (trimmedInput) {
      nextFlow.stage = "awaiting_action";
      nextFlow.comment = trimmedInput.slice(0, FEEDBACK_MAX_COMMENT_LEN);
      nextFlow.comment_at = nowIso;
    } else {
      return { handled: false };
    }

    nextFlow = await saveFeedbackAndMark(nextFlow);
    await supabase
      .from("chat_sessions")
      .update({
        context: withFeedbackFlowContext(session.context, nextFlow),
        updated_at: nowIso
      })
      .eq("id", session.id);
    actionFlow = nextFlow;

    if (currentRating >= 4 && !needsExecutive && !doneChoice) {
      const clearedContext = {
        ...withFeedbackFlowContext(session.context, null),
        last_report_feedback_armed: false,
        last_resolution_feedback_armed: false
      };
      await supabase
        .from("chat_sessions")
        .update({
          current_state: "START",
          context: clearedContext,
          updated_at: nowIso
        })
        .eq("id", session.id);

      await sendTextMessage({
        labId: session.lab_id,
        phone,
        text: "Your feedback has been recorded. Thank you."
      });
      return { handled: true };
    }

    if (needsExecutive || doneChoice) {
      // Continue to action path in the same inbound turn for faster UX.
    } else {
      await sendFeedbackActionMenu({
        labId: session.lab_id,
        phone,
        variant: currentRating <= 3 ? "complaint" : "default"
      });
      return { handled: true };
    }
  }

  if (String(actionFlow?.stage || "").toLowerCase() !== "awaiting_action") {
    actionFlow = { ...actionFlow, stage: "awaiting_action" };
  }
  const rating = Number(actionFlow?.rating || 0);

  if (!needsExecutive && !doneChoice && !complaintChoice) {
    const ratingForMenu = Number(actionFlow?.rating || 0);
    await sendFeedbackActionMenu({
      labId: session.lab_id,
      phone,
      variant: ratingForMenu <= 3 ? "complaint" : "default"
    });
    return { handled: true };
  }

  const persistedFlow = await saveFeedbackAndMark(actionFlow);
  const clearedContext = {
    ...withFeedbackFlowContext(session.context, null),
    last_report_feedback_armed: false,
    last_resolution_feedback_armed: false
  };

  if (needsExecutive) {
    if (isWithinExecutiveWorkingHours()) {
      await handoffToHuman(session.id);
      await supabase
        .from("chat_sessions")
        .update({
          context: clearedContext,
          updated_at: nowIso
        })
        .eq("id", session.id);
      await sendTextMessage({
        labId: session.lab_id,
        phone,
        text:
          botFlowConfig?.texts?.handoff_open_text ||
          "Connecting you to our executive. Please wait..."
      });
    } else {
      await supabase
        .from("chat_sessions")
        .update({
          context: clearedContext,
          updated_at: nowIso
        })
        .eq("id", session.id);
      await sendTextMessage({
        labId: session.lab_id,
        phone,
        text:
          botFlowConfig?.texts?.handoff_closed_text ||
          "Our executives are currently offline right now. Please try Connect Executive during working hours."
      });
    }
    return { handled: true };
  }

  if (complaintChoice) {
    await createFeedbackComplaintEvent({
      session,
      phone,
      flow: actionFlow,
      lab
    });
    await handoffToHuman(session.id);
    await supabase
      .from("chat_sessions")
      .update({
        context: clearedContext,
        updated_at: nowIso
      })
      .eq("id", session.id);
    await sendTextMessage({
      labId: session.lab_id,
      phone,
      text: "Your complaint has been recorded. Our executive will connect with you shortly."
    });
    return { handled: true };
  }

  if (doneChoice) {
    const feedbackSource = String(actionFlow?.trigger_source || "").toLowerCase();
    if (feedbackSource === "services_feedback" || feedbackSource === "agent_resolved_feedback") {
      await supabase
        .from("chat_sessions")
        .update({
          current_state: "START",
          context: clearedContext,
          updated_at: nowIso
        })
        .eq("id", session.id);
      await sendTextMessage({
        labId: session.lab_id,
        phone,
        text: "Thank you for your feedback."
      });
      await sendMainMenu({
        labId: session.lab_id,
        phone
      });
      return { handled: true };
    }

    if (rating >= 4 && rating <= 5) {
      await supabase
        .from("chat_sessions")
        .update({
          current_state: "START",
          context: clearedContext,
          updated_at: nowIso
        })
        .eq("id", session.id);

      await sendTextMessage({
        labId: session.lab_id,
        phone,
        text: feedbackClosureText(lab?.name || "our lab")
      });
    } else {
      await supabase
        .from("chat_sessions")
        .update({
          context: clearedContext,
          updated_at: nowIso
        })
        .eq("id", session.id);
      await sendTextMessage({
        labId: session.lab_id,
        phone,
        text: "Thank you for your feedback."
      });
    }
    return { handled: true };
  }

  // Keep linter happy for persisted flow currently used for side effects.
  void persistedFlow;
  return { handled: false };
}

function extractReadyLabTestKeys(reportStatus) {
  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  const keys = [];
  const seen = new Set();

  for (const row of tests) {
    const groupId = String(row?.GROUPID ?? row?.groupid ?? "").trim();
    if (groupId !== "GDEP0001") continue;

    const approvedFlag = String(row?.APPROVEDFLG ?? row?.approvedflg ?? "").trim();
    const status = String(row?.REPORT_STATUS ?? row?.report_status ?? "").trim();
    if (!(approvedFlag === "1" || status === "LAB_READY")) continue;

    const key = String(row?.TESTID ?? row?.testid ?? row?.TESTNM ?? row?.testnm ?? "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }

  return keys;
}

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

function extractStatusEvents(body) {
  const candidates = [];

  const entryStatuses =
    body?.entry?.[0]?.changes?.[0]?.value?.statuses ||
    body?.value?.statuses ||
    body?.statuses ||
    [];

  if (Array.isArray(entryStatuses)) {
    for (const row of entryStatuses) {
      if (row && typeof row === "object") candidates.push(row);
    }
  }

  return candidates;
}

async function resolveLabIdForStatusPhone(phone) {
  const canonical = toCanonicalIndiaPhone(phone) || String(phone || "").trim();
  if (!canonical) return null;

  const { data: sessionMatch } = await supabase
    .from("chat_sessions")
    .select("lab_id")
    .eq("phone", canonical)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sessionMatch?.lab_id) return sessionMatch.lab_id;

  const { data: messageMatch } = await supabase
    .from("whatsapp_messages")
    .select("lab_id")
    .eq("phone", canonical)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (messageMatch?.lab_id) return messageMatch.lab_id;

  const { data: defaultLab } = await supabase
    .from("labs")
    .select("id")
    .eq("is_default", true)
    .maybeSingle();
  return defaultLab?.id || null;
}

async function persistWebhookStatusEvents({ body, statusEvents }) {
  if (!Array.isArray(statusEvents) || statusEvents.length === 0) return;

  const metadata =
    body?.entry?.[0]?.changes?.[0]?.value?.metadata ||
    body?.value?.metadata ||
    body?.metadata ||
    null;

  for (const status of statusEvents) {
    try {
      const providerMessageId = String(status?.id || "").trim() || null;
      const statusCode = String(status?.status || "").trim() || "unknown";
      const recipientRaw = String(status?.recipient_id || "").trim();
      const phone = toCanonicalIndiaPhone(recipientRaw) || recipientRaw;
      const labId = await resolveLabIdForStatusPhone(phone);

      if (!labId || !phone) {
        console.warn("[status-callback] skipped due to unresolved lab/phone", {
          labId,
          phone,
          providerMessageId,
          statusCode
        });
        continue;
      }

      const errorObj = Array.isArray(status?.errors) ? status.errors[0] || null : null;
      const ts =
        status?.timestamp && Number.isFinite(Number(status.timestamp))
          ? new Date(Number(status.timestamp) * 1000).toISOString()
          : new Date().toISOString();

      await supabase.from("whatsapp_messages").insert({
        lab_id: labId,
        phone,
        message: `Delivery ${statusCode}${providerMessageId ? ` (${providerMessageId})` : ""}`,
        direction: "status",
        message_id: providerMessageId,
        payload: {
          status_event: true,
          status: statusCode,
          timestamp: ts,
          recipient_id: recipientRaw || null,
          provider_message_id: providerMessageId,
          metadata,
          error: errorObj
            ? {
                code: errorObj.code || null,
                title: errorObj.title || null,
                message: errorObj.message || null,
                details: errorObj?.error_data?.details || null
              }
            : null,
          raw_status: status,
          raw_body: body
        }
      });

      await handleDeliveryFailureStatusEvent({
        labId,
        phone,
        providerMessageId,
        statusCode,
        errorObj,
        statusTimestampIso: ts
      });
    } catch (err) {
      console.error("[status-callback] persist failed", {
        error: err?.message || String(err),
        status
      });
    }
  }
}

function isFailedDeliveryStatus(statusCode) {
  return String(statusCode || "").trim().toLowerCase() === "failed";
}

function isDeliveryFailureAckCooldownActive(context = {}, nowMs = Date.now()) {
  const lastAckAt = String(context?.last_delivery_failed_ack_at || "").trim();
  if (!lastAckAt) return false;
  const ackMs = new Date(lastAckAt).getTime();
  if (!Number.isFinite(ackMs)) return false;
  return nowMs - ackMs < DELIVERY_FAILED_ACK_COOLDOWN_MS;
}

async function fetchWhatsappTemplatesForLab(labId) {
  if (!labId) return {};
  try {
    const { data } = await supabase
      .from("labs_apis")
      .select("templates")
      .eq("lab_id", labId)
      .eq("api_name", "whatsapp_outbound")
      .maybeSingle();
    return parseTemplates(data?.templates);
  } catch {
    return {};
  }
}

async function fetchLabById(labId) {
  if (!labId) return null;
  try {
    const { data } = await supabase
      .from("labs")
      .select("id,name,alternate_whatsapp_number,internal_whatsapp_number")
      .eq("id", labId)
      .maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

function resolveInternalNotifyPhone({ templates = {}, lab = null }) {
  const botFlow = templates?.bot_flow || {};
  const candidate =
    botFlow?.report_notify_number ||
    templates?.report_notify_number ||
    lab?.alternate_whatsapp_number ||
    lab?.internal_whatsapp_number ||
    "";
  return toCanonicalIndiaPhone(candidate) || String(candidate || "").replace(/\D/g, "") || null;
}

function buildFailedDeliveryInternalNotifyText({
  labName,
  patientPhone,
  providerMessageId,
  statusTimestampIso,
  errorObj
}) {
  return [
    "FAILED DELIVERY: Send report to patient ASAP",
    labName ? `Lab: ${labName}` : null,
    patientPhone ? `Patient: ${patientPhone}` : null,
    providerMessageId ? `Provider Message ID: ${providerMessageId}` : null,
    statusTimestampIso ? `Failure Time: ${statusTimestampIso}` : null,
    errorObj?.message ? `Meta Error: ${errorObj.message}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

function getDeliveryFailureAckText(templates = {}) {
  const botFlow = templates?.bot_flow || {};
  return (
    botFlow?.texts?.delivery_failed_ack_text ||
    templates?.delivery_failed_ack_text ||
    "We could not deliver your report document on WhatsApp due to a temporary Meta delivery issue. Our executive team has been alerted and will assist you shortly."
  );
}

async function handleDeliveryFailureStatusEvent({
  labId,
  phone,
  providerMessageId,
  statusCode,
  errorObj,
  statusTimestampIso
}) {
  if (!labId || !phone || !isFailedDeliveryStatus(statusCode)) return;

  const templates = await fetchWhatsappTemplatesForLab(labId);
  const lab = await fetchLabById(labId);
  const internalNotifyPhone = resolveInternalNotifyPhone({ templates, lab });
  const normalizedPatientPhone = toCanonicalIndiaPhone(phone) || String(phone || "").replace(/\D/g, "");

  // Guard against recursive escalation when notify destination itself has delivery issues.
  if (internalNotifyPhone && normalizedPatientPhone && internalNotifyPhone === normalizedPatientPhone) {
    return;
  }

  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const { data: session } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("lab_id", labId)
    .in("phone", phoneVariantsIndia(phone))
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session?.id) return;

  const currentContext = session?.context && typeof session.context === "object" ? session.context : {};
  const existingProviderFailureId = String(currentContext?.last_delivery_failure_provider_message_id || "").trim();
  if (providerMessageId && providerMessageId === existingProviderFailureId) return;

  const alreadyManualMode = ["handoff", "pending", "resolved", "closed"].includes(
    String(session.status || "").toLowerCase()
  );
  const shouldAck = !isDeliveryFailureAckCooldownActive(currentContext, nowMs);
  const nextContext = {
    ...currentContext,
    ever_agent_intervened: true,
    last_handled_by: "system",
    last_handled_at: nowIso,
    last_delivery_failure_at: statusTimestampIso || nowIso,
    last_delivery_failure_provider_message_id: providerMessageId || null,
    last_delivery_failure_status: String(statusCode || "").toLowerCase() || "failed",
    last_delivery_failure_error: errorObj
      ? {
          code: errorObj.code || null,
          title: errorObj.title || null,
          message: errorObj.message || null
        }
      : null,
    suppress_feedback_once: true,
    ...(shouldAck ? { last_delivery_failed_ack_at: nowIso } : {})
  };

  await supabase
    .from("chat_sessions")
    .update({
      status: alreadyManualMode ? session.status : "handoff",
      current_state: "HUMAN_HANDOVER",
      unread_count: Number(session.unread_count || 0) + 1,
      context: nextContext,
      last_message_at: nowIso,
      updated_at: nowIso
    })
    .eq("id", session.id);

  const followupNotes = [
    "Meta callback marked outbound report delivery as failed.",
    `Phone: ${phone}`,
    providerMessageId ? `Provider Message ID: ${providerMessageId}` : null,
    errorObj?.message ? `Provider Error: ${errorObj.message}` : null
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await createWhatsappFollowupClickupTask({
      labId,
      patientPhone: phone,
      notes: followupNotes
    });
  } catch (clickupError) {
    console.error("[status-callback] clickup followup failed", {
      error: clickupError?.message || String(clickupError),
      phone,
      providerMessageId
    });
  }

  if (internalNotifyPhone) {
    try {
      await sendTextMessage({
        labId,
        phone: internalNotifyPhone,
        text: buildFailedDeliveryInternalNotifyText({
          labName: String(lab?.name || "").trim() || null,
          patientPhone: normalizedPatientPhone || phone,
          providerMessageId,
          statusTimestampIso: statusTimestampIso || nowIso,
          errorObj
        })
      });
    } catch (notifyErr) {
      console.error("[status-callback] internal notify send failed", {
        error: notifyErr?.message || String(notifyErr),
        patientPhone: phone,
        internalNotifyPhone,
        providerMessageId
      });
    }
  }

  if (!shouldAck) return;

  try {
    await sendTextMessage({
      labId,
      phone,
      text: getDeliveryFailureAckText(templates)
    });
  } catch (ackErr) {
    console.error("[status-callback] delivery-failed ack send failed", {
      error: ackErr?.message || String(ackErr),
      phone,
      providerMessageId
    });
  }
}

function getIncomingProfileName(body) {
  const candidates = [
    body?.profile?.name,
    body?.contacts?.[0]?.profile?.name,
    body?.value?.contacts?.[0]?.profile?.name,
    body?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name
  ];
  return candidates.find((name) => typeof name === "string" && name.trim())?.trim() || null;
}

function normalizePhoneVariants(rawPhone) {
  return phoneVariantsIndia(rawPhone);
}

function getInboundMedia(message) {
  const image = message?.image || null;
  if (image) {
    const url = image.link || image.url || image.image_url || null;
    const urlSource = image.link
      ? "link"
      : image.url
        ? "url"
        : image.image_url
          ? "image_url"
          : null;
    return {
      type: "image",
      url,
      urlSource,
      mimeType: image.mime_type || "image/jpeg",
      id: image.id || null,
      filename: null
    };
  }

  const document = message?.document || null;
  if (document) {
    const url = document.link || document.url || document.document_url || null;
    const urlSource = document.link
      ? "link"
      : document.url
        ? "url"
        : document.document_url
          ? "document_url"
          : null;
    return {
      type: "document",
      url,
      urlSource,
      mimeType: document.mime_type || "application/octet-stream",
      id: document.id || null,
      filename: document.filename || "prescription"
    };
  }

  return null;
}

function fileExtFromMime(mime = "", fallback = "bin") {
  const map = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf"
  };
  return map[String(mime).toLowerCase()] || fallback;
}

async function persistPrescriptionMedia({ inboundMedia, labId, phone }) {
  if (!inboundMedia?.url) return null;

  try {
    const response = await fetch(inboundMedia.url);
    if (!response.ok) return inboundMedia.url;

    const fileBuffer = await response.arrayBuffer();
    const ext =
      (inboundMedia.filename && String(inboundMedia.filename).split(".").pop()) ||
      fileExtFromMime(inboundMedia.mimeType, "bin");
    const safePhone = digitsOnly(phone).slice(-10) || "unknown";
    const filePath = `prescriptions/whatsapp/${labId}/${safePhone}_${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("uploads")
      .upload(filePath, fileBuffer, {
        contentType: inboundMedia.mimeType || "application/octet-stream",
        upsert: false
      });

    if (uploadError) return inboundMedia.url;
    return `uploads/${filePath}`;
  } catch {
    return inboundMedia.url;
  }
}

function shouldPersistInboundMedia() {
  return String(process.env.WHATSAPP_PERSIST_INBOUND_MEDIA || "").toLowerCase() === "true";
}

async function resolveMediaUrlById({ mediaId, mediaFetchConfig, authDetails }) {
  if (!mediaId || !mediaFetchConfig?.url) return null;

  const method = String(mediaFetchConfig.method || "GET").toUpperCase();
  const rawHeaders = mediaFetchConfig.headers && typeof mediaFetchConfig.headers === "object"
    ? mediaFetchConfig.headers
    : {};
  const headers = { ...rawHeaders };

  const apiKey = authDetails?.api_key || authDetails?.apikey || null;
  if (apiKey) {
    headers[mediaFetchConfig.api_key_header || "X-API-KEY"] = apiKey;
  }

  const bearerToken = mediaFetchConfig.bearer_token || authDetails?.bearer_token || null;
  if (bearerToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }

  const url = String(mediaFetchConfig.url)
    .replace("{media_id}", encodeURIComponent(String(mediaId)));

  const response = await fetch(url, { method, headers });
  if (!response.ok) return null;

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    return null;
  }

  return (
    body?.url ||
    body?.link ||
    body?.media_url ||
    body?.download_url ||
    body?.data?.url ||
    body?.data?.link ||
    body?.result?.url ||
    null
  );
}

function shouldActivateBotFromStart({ session, message, userInput, inboundMedia }) {
  const state = session?.current_state || "START";
  if (state !== "START") return true;

  // Interactive replies are deliberate bot interactions and should always continue.
  if (message?.interactive?.button_reply?.id || message?.interactive?.list_reply?.id) {
    return true;
  }

  // Legacy/alternate provider payloads can arrive as `type: "button"`.
  if (message?.button?.payload || message?.button?.text) {
    return true;
  }

  // Location pin flow should always continue.
  if (message?.location?.latitude && message?.location?.longitude) {
    return true;
  }

  // Media-first user messages should also enter bot flow.
  if (inboundMedia) {
    return true;
  }

  const { normalized, normalizedGreeting, normalizedUnderscore } =
    normalizeCommandLikeInput(userInput);

  if (
    BOT_START_KEYWORDS.has(normalized) ||
    BOT_START_KEYWORDS.has(normalizedGreeting) ||
    BOT_START_KEYWORDS.has(normalizedUnderscore)
  ) {
    return true;
  }

  return Boolean(detectIntent(userInput));
}

function shouldResumeBotFromHandoff({ message, userInput, inboundMedia, normalizedSessionStatus, session }) {
  if (message?.interactive?.button_reply?.id || message?.interactive?.list_reply?.id) {
    return true;
  }

  // Legacy/alternate provider payloads can arrive as `type: "button"`.
  if (message?.button?.payload || message?.button?.text) {
    return true;
  }

  if (message?.location?.latitude && message?.location?.longitude) {
    return true;
  }

  if (inboundMedia) {
    return true;
  }

  const { raw, normalized, normalizedGreeting, normalizedUnderscore } =
    normalizeCommandLikeInput(userInput);
  if (!raw) return false;
  const greetingLikeInput =
    ["HI", "HII", "HAI", "HELLO", "HEY", "MENU", "MAIN MENU", "MAIN_MENU"].includes(normalized) ||
    ["HI", "HII", "HAI", "HELLO", "HEY", "MENU", "MAIN MENU", "MAIN_MENU"].includes(normalizedGreeting) ||
    /^(hi|hii|hai|hello|hey|menu)\b/i.test(raw);

  // Closed/resolved conversations should quickly re-enter bot flow on any fresh user text.
  // so users don't get stuck with silent replies.
  if (["resolved", "closed"].includes(String(normalizedSessionStatus || "").toLowerCase())) {
    return true;
  }

  // For stale handoff/pending sessions, allow any fresh text to resume bot.
  // This prevents users from being stuck indefinitely when no human is actively handling the thread.
  if (["handoff", "pending"].includes(String(normalizedSessionStatus || "").toLowerCase())) {
    const updatedAt = session?.updated_at ? new Date(session.updated_at).getTime() : null;
    const ageMinutes = Number.isFinite(updatedAt) ? (Date.now() - updatedAt) / (60 * 1000) : null;
    if (ageMinutes === null || ageMinutes >= 20) {
      return true;
    }
  }

  if (greetingLikeInput) {
    if (["handoff", "pending"].includes(String(normalizedSessionStatus || "").toLowerCase()) && isRecentAgentTakeover(session)) {
      return false;
    }
    return true;
  }

  // Allow deliberate bot-entry commands (eg Request Reports / Latest Report / More Services)
  // to resume immediately from handoff/pending, especially important in simulator runs.
  if (
    BOT_START_KEYWORDS.has(normalized) ||
    BOT_START_KEYWORDS.has(normalizedGreeting) ||
    BOT_START_KEYWORDS.has(normalizedUnderscore)
  ) {
    return true;
  }

  // Fallback: free-text intent detection should also resume bot flow from handoff.
  if (detectIntent(raw)) {
    return true;
  }

  return false;
}

async function isReachablePdfDocument(url) {
  if (!url) return false;

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) {
      console.warn("[pdf-preflight] non-ok response", {
        url,
        status: response.status,
        statusText: response.statusText
      });
      return false;
    }

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/pdf")) {
      console.log("[pdf-preflight] accepted by content-type", {
        url,
        contentType,
        contentLength: response.headers.get("content-length"),
        contentDisposition: response.headers.get("content-disposition")
      });
      return true;
    }

    const contentDisposition = String(response.headers.get("content-disposition") || "").toLowerCase();
    if (contentDisposition.includes(".pdf")) {
      console.log("[pdf-preflight] accepted by content-disposition", {
        url,
        contentType,
        contentLength: response.headers.get("content-length"),
        contentDisposition
      });
      return true;
    }

    const bodyBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(bodyBuffer);
    const pdfSignature = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
    const startsLikePdf = pdfSignature.every((byte, index) => bytes[index] === byte);
    if (startsLikePdf) {
      console.log("[pdf-preflight] accepted by file signature", {
        url,
        contentType,
        contentLength: response.headers.get("content-length"),
        firstBytes: Array.from(bytes.slice(0, 8))
      });
      return true;
    }

    console.warn("[pdf-preflight] rejected response", {
      url,
      contentType,
      contentLength: response.headers.get("content-length"),
      contentDisposition,
      firstBytes: Array.from(bytes.slice(0, 16))
    });
    return false;
  } catch (error) {
    console.error("[pdf-preflight] fetch failed", {
      url,
      error: error?.message || String(error)
    });
    return false;
  }
}

function pickLatestReportStatusPayload(meta) {
  if (!meta || typeof meta !== "object") return null;
  if (meta?.overall_status) return meta;
  if (meta?.status && typeof meta.status === "object") return meta.status;
  if (meta?.report_status && typeof meta.report_status === "object") return meta.report_status;
  if (meta?.data && typeof meta.data === "object") return meta.data;
  return null;
}

async function buildLatestReportStatusMessageForPhone(phone) {
  try {
    const meta = await getLatestReportMeta(phone);
    const statusPayload = pickLatestReportStatusPayload(meta);
    const statusMessage = buildReportStatusMessage(statusPayload);
    return statusMessage || null;
  } catch (error) {
    console.warn("[report-status] latest-report-meta lookup skipped", {
      phone,
      error: error?.message || String(error)
    });
    return null;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function preferPatient(primary, secondary) {
  if (primary && !primary.is_lead) return primary;
  if (secondary && !secondary.is_lead) return secondary;
  return primary || secondary || null;
}

async function findLocalPatientByPhone(rawPhone) {
  const variants = normalizePhoneVariants(rawPhone);
  if (variants.length === 0) return null;

  const { data: rows } = await supabase
    .from("patients")
    .select("id, name, phone, email, dob, gender, mrn, is_lead, created_at")
    .in("phone", variants)
    .limit(10);

  const patients = [...(rows || [])].sort(
    (a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
  );
  const nonLead = patients.find((p) => !p?.is_lead);
  return nonLead || patients[0] || null;
}

async function fetchExternalPatientProfile({ labId, phone }) {
  const cleanPhone = digitsOnly(phone);
  if (!cleanPhone) return null;

  const { data: apiConfig } = await supabase
    .from("labs_apis")
    .select("base_url, auth_details, templates")
    .eq("lab_id", labId)
    .eq("api_name", "external_patient_lookup")
    .maybeSingle();

  if (!apiConfig?.base_url || !apiConfig?.auth_details?.apikey) {
    return null;
  }

  const fieldMap = apiConfig.templates?.field_map || {
    name: "FNAME",
    dob: "DOB",
    gender: "SEX",
    email: "EMAIL",
    mrn: "MRN",
    external_key: "CREGNO"
  };

  const dataParam = encodeURIComponent(JSON.stringify([{ phone: cleanPhone }]));
  const url = `${apiConfig.base_url}&data=${dataParam}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiConfig.auth_details.apikey}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) return null;

  const payload = await response.json();
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.patients)
      ? payload.patients
      : payload
        ? [payload]
        : [];

  const first = rows[0];
  if (!first) return null;

  return {
    name: first[fieldMap.name]?.trim() || null,
    dob: first[fieldMap.dob] ? String(first[fieldMap.dob]).split(" ")[0] : null,
    gender: first[fieldMap.gender] ? String(first[fieldMap.gender]).trim() : null,
    email: first[fieldMap.email] || null,
    mrn: first[fieldMap.mrn] || null,
    external_key: first[fieldMap.external_key] || null
  };
}

function buildNext7Dates() {
  const list = [];
  const today = new Date();

  for (let i = 0; i < 7; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);

    const iso = d.toISOString().slice(0, 10);
    const title = d.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short"
    });
    const description = i === 0 ? "Today" : i === 1 ? "Tomorrow" : "";

    list.push({ iso, title, description });
  }

  return list;
}

async function findActiveVisitForPatient({ patientId, labId, phone = null, mrn = null }) {
  if (!labId) return null;

  const todayIso = new Date().toISOString().slice(0, 10);
  const excludedStatuses = "cancelled,canceled,rejected,disabled,closed";
  const candidatePatientIds = new Set();
  if (patientId) candidatePatientIds.add(patientId);

  const normalizedPhone = digitsOnly(phone || "").slice(-10);
  if (normalizedPhone) {
    const phoneCandidates = Array.from(
      new Set([
        normalizedPhone,
        ...phoneVariantsIndia(normalizedPhone).map((p) => digitsOnly(p).slice(-10)).filter(Boolean)
      ])
    );

    if (phoneCandidates.length > 0) {
      const { data: matchedPatients, error: patientMatchError } = await supabase
        .from("patients")
        .select("id")
        .in("phone", phoneCandidates)
        .limit(20);

      if (patientMatchError) {
        console.error("[booking] patient match lookup failed", {
          phone: normalizedPhone,
          labId,
          error: patientMatchError?.message || String(patientMatchError)
        });
      } else {
        for (const row of matchedPatients || []) {
          if (row?.id) candidatePatientIds.add(row.id);
        }
      }
    }
  }

  const normalizedMrn = String(mrn || "").trim();
  if (normalizedMrn) {
    const { data: mrnMatchedPatients, error: mrnMatchError } = await supabase
      .from("patients")
      .select("id")
      .eq("mrn", normalizedMrn)
      .limit(20);

    if (mrnMatchError) {
      console.error("[booking] mrn patient match lookup failed", {
        mrn: normalizedMrn,
        labId,
        error: mrnMatchError?.message || String(mrnMatchError)
      });
    } else {
      for (const row of mrnMatchedPatients || []) {
        if (row?.id) candidatePatientIds.add(row.id);
      }
    }
  }

  const lookupIds = Array.from(candidatePatientIds).filter(Boolean);
  if (lookupIds.length === 0) return null;

  const { data, error } = await supabase
    .from("visits")
    .select(`
      id,
      visit_code,
      visit_date,
      status,
      address,
      time_slot:time_slot(slot_name, start_time, end_time),
      executive:executive_id(name, phone)
    `)
    .in("patient_id", lookupIds)
    .eq("lab_id", labId)
    .gte("visit_date", todayIso)
    .not("status", "in", `(${excludedStatuses})`)
    .order("visit_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[booking] active visit lookup failed", {
      patientId,
      lookupIds,
      mrn: normalizedMrn || null,
      labId,
      error: error?.message || String(error)
    });
    return null;
  }

  return data || null;
}

function summarizeBotResult(result = {}) {
  return {
    replyType: result.replyType || null,
    newState: result.newState || null,
    hasReplyText: Boolean(result.replyText),
    hasNotifyText: Boolean(result.notifyText),
    hasDocumentUrl: Boolean(result.documentUrl),
    filename: result.filename || null,
    reportStatusReqno: result.reportStatusReqno || null,
    contextKeys: Object.keys(result.context || {})
  };
}

function getPackageCatalog() {
  const packages = Array.isArray(healthPackagesData?.packages)
    ? healthPackagesData.packages
    : [];
  return packages.map((pkg, packageIndex) => ({
    packageIndex,
    name: pkg?.name || "Package",
    description: pkg?.description || "",
    minPrice: (() => {
      const variantPrices = (Array.isArray(pkg?.variants) ? pkg.variants : [])
        .map((v) => Number(v?.price))
        .filter((v) => Number.isFinite(v) && v > 0);
      if (variantPrices.length === 0) return null;
      return Math.min(...variantPrices);
    })(),
    variants: Array.isArray(pkg?.variants) ? pkg.variants : []
  }));
}

function buildPackageMenuPage(packages, page = 1, pageSize = 9) {
  const safePage = Math.max(1, Number(page) || 1);
  const start = (safePage - 1) * pageSize;
  const end = start + pageSize;
  const slice = packages.slice(start, end);
  return {
    page: safePage,
    hasMore: end < packages.length,
    rows: slice.map((pkg) => ({
      id: `PKG_${pkg.packageIndex}`,
      title: pkg.name,
      description: pkg.minPrice
        ? `Starts INR ${pkg.minPrice}`
        : (pkg.description || "View package details")
    }))
  };
}

function buildPackageVariantRows(selectedPackage) {
  const rows = (selectedPackage?.variants || []).map((variant, variantIndex) => ({
    id: `PKGV_${selectedPackage.packageIndex}_${variantIndex}`,
    title: variant?.name || `Variant ${variantIndex + 1}`,
    description:
      `${variant?.parameters || "-"} params • INR ${variant?.price || "-"}`
  }));

  rows.push({
    id: "PKG_BACK_LIST",
    title: "Back to Packages",
    description: "Choose another package"
  });

  return rows.slice(0, 10);
}

async function ensureChatSessionForPhone({ labId, phone }) {
  const canonical = toCanonicalIndiaPhone(phone) || phone;
  const variants = phoneVariantsIndia(canonical);

  const { data: existingRows } = await supabase
    .from("chat_sessions")
    .select("id")
    .in("phone", variants)
    .eq("lab_id", labId)
    .order("created_at", { ascending: false })
    .limit(1);

  const existing = existingRows?.[0];
  if (existing?.id) {
    await supabase
      .from("chat_sessions")
      .update({
        phone: canonical,
        last_message_at: new Date(),
        updated_at: new Date()
      })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data: created } = await supabase
    .from("chat_sessions")
    .insert({
      phone: canonical,
      lab_id: labId,
      current_state: "HUMAN_HANDOVER",
      status: "active",
      last_message_at: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    })
    .select("id")
    .single();

  return created?.id || null;
}

function formatPackageVariantMessage(selectedPackage, selectedVariant) {
  if (!selectedPackage || !selectedVariant) {
    return "Package details are unavailable right now. Please try again.";
  }

  const tests = Array.isArray(selectedVariant.tests) ? selectedVariant.tests : [];
  const topTests = tests.slice(0, 8);
  const moreCount = Math.max(0, tests.length - topTests.length);
  const testsText = topTests.length > 0
    ? topTests.map((test) => `- ${test}`).join("\n")
    : "- Test list currently unavailable";

  const extraText = moreCount > 0 ? `\n+ ${moreCount} more tests` : "";

  return [
    `*${selectedPackage.name}*`,
    `${selectedVariant.name}`,
    `Price: INR ${selectedVariant.price || "-"}`,
    `Parameters: ${selectedVariant.parameters || "-"}`,
    "",
    "Includes:",
    `${testsText}${extraText}`,
    "",
    "Reply *BOOK_HOME_VISIT* to book this package.",
    "See all packages: https://sdrc.in/packages.php"
  ].join("\n");
}

async function fetchVisitTimeSlots() {
  const { data, error } = await supabase
    .from("visit_time_slots")
    .select("id, slot_name, start_time, end_time")
    .order("start_time", { ascending: true });

  if (error) {
    throw new Error(`Failed to load time slots: ${error.message}`);
  }

  return (data || []).map((slot) => ({
    id: slot.id,
    title: slot.slot_name || `${slot.start_time || ""} - ${slot.end_time || ""}`.trim(),
    description: slot.start_time && slot.end_time ? `${slot.start_time} - ${slot.end_time}` : "",
    start_time: slot.start_time || null   // ← add this
  }));
}

async function sendTeamWebhookNotification({ templates, eventType, payload }) {
  const webhookUrl =
    templates?.team_notify?.webhook_url ||
    templates?.bot_flow?.team_notify?.webhook_url ||
    null;

  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType,
        payload,
        source: "labbit_whatsapp_bot",
        timestamp: new Date().toISOString()
      })
    });
  } catch (err) {
    console.error("❌ Team webhook notification failed:", err);
  }
}

// --------------------------------------------------
// 🔹 GET Handler (Webhook Verification Safe)
// --------------------------------------------------
export async function GET() {
  return new Response("WhatsApp Webhook Active", { status: 200 });
}

// --------------------------------------------------
// 🔹 POST Handler
// --------------------------------------------------
export async function POST(req) {
  const isSimulationRequest = req.headers.get("x-labbit-sim") === "1";
  return runWithWhatsappSendContext(
    {
      useDevEndpoint: isSimulationRequest,
      simulated: isSimulationRequest
    },
    async () => {
      try {

    const body = await req.json();
    const profileName = getIncomingProfileName(body);
    console.log("📩 RAW WEBHOOK:", JSON.stringify(body));

    const statusEvents = extractStatusEvents(body);
    if (statusEvents.length > 0) {
      await persistWebhookStatusEvents({ body, statusEvents });
    }

    // --------------------------------------------------
    // 1️⃣ Extract Message Safely
    // --------------------------------------------------

    let message = null;

    if (body?.message) {
      // Preserve full message object so media/location payloads are not dropped.
      message = {
        ...body.message,
        id: body.message.id || body.message.message_id || null,
        from: body.from || body.message.from || null,
        text:
          body.message.type === "text"
            ? { body: body.message.text || body.message?.text?.body || "" }
            : body.message.text || null,
        interactive:
          body.message.type === "interactive"
            ? body.message.interactive
            : body.message.interactive || null
      };
    }

    if (!message && body?.messages?.length) {
      message = body.messages[0];
    }

    if (!message && body?.entry?.[0]?.changes?.[0]?.value?.messages?.length) {
      message = body.entry[0].changes[0].value.messages[0];
    }

    if (!message && body?.value?.messages?.length) {
      message = body.value.messages[0];
    }

    if (!message) {
      if (statusEvents.length > 0) {
        console.log(`📬 Status callback processed (${statusEvents.length} events).`);
      } else {
        console.log("⚠️ No message found in webhook.");
      }
      return Response.json({ success: true });
    }

    const messageId = message?.id;
    const rawPhone = message?.from;
    const messageTimestamp =
      message?.timestamp && Number.isFinite(Number(message.timestamp))
        ? Number(message.timestamp)
        : null;

    if (!messageId || !rawPhone) {
      console.log("⚠️ Missing messageId or phone.");
      return Response.json({ success: true });
    }

    // --------------------------------------------------
    // 2️⃣ Duplicate Protection
    // --------------------------------------------------

    const { data: existing } = await supabase
      .from("whatsapp_messages")
      .select("id, created_at, lab_id, phone")
      .eq("message_id", messageId)
      .maybeSingle();

    if (existing) {
      const inboundCreatedAt = existing?.created_at ? new Date(existing.created_at) : null;
      const duplicateAgeMs =
        inboundCreatedAt && !Number.isNaN(inboundCreatedAt.getTime())
          ? Date.now() - inboundCreatedAt.getTime()
          : Number.POSITIVE_INFINITY;

      let hasOutboundAfterInbound = false;
      if (existing?.lab_id && existing?.phone && inboundCreatedAt) {
        const { data: outboundAfter } = await supabase
          .from("whatsapp_messages")
          .select("id")
          .eq("lab_id", existing.lab_id)
          .eq("phone", existing.phone)
          .eq("direction", "outbound")
          .gte("created_at", inboundCreatedAt.toISOString())
          .limit(1);
        hasOutboundAfterInbound = Boolean(outboundAfter?.length);
      }

      if (hasOutboundAfterInbound) {
        console.log("🔁 Duplicate ignored (already responded):", messageId);
        return Response.json({ success: true });
      }

      // If duplicate arrived immediately, first request is likely still processing.
      if (duplicateAgeMs < 20_000) {
        console.log("🔁 Duplicate ignored (in-flight):", messageId);
        return Response.json({ success: true });
      }

      // Replay stalled inbound processing if earlier run logged inbound but never responded.
      console.log("♻️ Replaying stalled inbound:", messageId);
    }

    // --------------------------------------------------
    // 3️⃣ Extract User Input
    // --------------------------------------------------

    let userInput = null;
    let inboundLocation = null;
    let inboundMedia = getInboundMedia(message);

    if (message.text?.body) {
      userInput = message.text.body.trim();
    }

    if (message.interactive?.button_reply?.id) {
      userInput = message.interactive.button_reply.id;
    }

    if (message.interactive?.list_reply?.id) {
      userInput = message.interactive.list_reply.id;
    }

    if (!userInput && message.button?.payload) {
      userInput = String(message.button.payload).trim();
    }

    if (!userInput && message.button?.text) {
      userInput = String(message.button.text).trim();
    }

    if (message.location?.latitude && message.location?.longitude) {
      userInput = "__LOCATION_PIN__";
      inboundLocation = {
        latitude: message.location.latitude,
        longitude: message.location.longitude,
        name: message.location.name || null,
        address: message.location.address || null
      };
    }

    if (!userInput && inboundMedia) {
      userInput = "__MEDIA__";
    }

    if (!userInput) {
      console.log("⚠️ No usable user input.");
      return Response.json({ success: true });
    }

    // --------------------------------------------------
    // 4️⃣ Extract Country Code
    // --------------------------------------------------

    const match = rawPhone.match(/^\+(\d{1,3})/);
    const countryCode = match ? match[1] : null;

    const phone = toCanonicalIndiaPhone(rawPhone) || rawPhone;

    // --------------------------------------------------
    // 5️⃣ Get/Create Session
    // --------------------------------------------------

    let session = await getOrCreateSession(phone);
    const initialSessionStatus = String(session?.status || "").toLowerCase();
    const shouldStartFreshSession =
      ["handoff", "pending", "resolved", "closed"].includes(initialSessionStatus) &&
      isMainMenuGreetingInput(userInput) &&
      !isRecentAgentTakeover(session) &&
      !Boolean(getFeedbackFlow(session?.context)?.stage);

    if (shouldStartFreshSession) {
      session = await createFreshSession(phone, {
        closeSessionId: session.id,
        closeStatus: "closed"
      });
    }

    if (!session.country_code) {
      await supabase
        .from("chat_sessions")
        .update({ country_code: countryCode })
        .eq("id", session.id);
    }

    // --------------------------------------------------
    // 6️⃣ Get Lab
    // --------------------------------------------------

    const { data: lab } = await supabase
      .from("labs")
      .select("*")
      .eq("id", session.lab_id)
      .single();

    if (!lab) {
      console.error("❌ Lab not found.");
      return Response.json({ success: true });
    }

    const { data: waApiConfig } = await supabase
      .from("labs_apis")
      .select("templates, auth_details")
      .eq("lab_id", session.lab_id)
      .eq("api_name", "whatsapp_outbound")
      .maybeSingle();

    const templates = parseTemplates(waApiConfig?.templates);
    const mediaResolverConfig = templates?.media_fetch || templates?.media_resolver || null;
    const mediaResolverAuth = waApiConfig?.auth_details || {};

    // --------------------------------------------------
    // 7️⃣ Patient Linking / Lead Creation
    // --------------------------------------------------

    let linkedBySession = null;
    if (session.patient_id) {
      const { data: existingLinked } = await supabase
        .from("patients")
        .select("id, name, is_lead, mrn")
        .eq("id", session.patient_id)
        .maybeSingle();
      linkedBySession = existingLinked || null;
    }

    const linkedByPhone = await findLocalPatientByPhone(phone);
    let linkedPatient = preferPatient(linkedByPhone, linkedBySession);

    if (!linkedPatient || linkedPatient?.is_lead) {
      const externalPatient = await fetchExternalPatientProfile({
        labId: session.lab_id,
        phone
      });

      if (externalPatient) {
        if (linkedPatient?.id && linkedPatient?.is_lead) {
          const { data: upgradedPatient } = await supabase
            .from("patients")
            .update({
              name: externalPatient.name || linkedPatient.name || profileName || "Patient",
              dob: externalPatient.dob,
              gender: externalPatient.gender,
              email: externalPatient.email,
              mrn: externalPatient.mrn,
              is_lead: false
            })
            .eq("id", linkedPatient.id)
            .select("id, name, is_lead, mrn")
            .single();
          linkedPatient = upgradedPatient || linkedPatient;
        } else if (!linkedPatient) {
          const { data: createdPatient } = await supabase
            .from("patients")
            .insert({
              name: externalPatient.name || profileName || "Patient",
              phone: digitsOnly(phone).slice(-10) || phone,
              dob: externalPatient.dob,
              gender: externalPatient.gender,
              email: externalPatient.email,
              mrn: externalPatient.mrn,
              is_lead: false
            })
            .select("id, name, is_lead, mrn")
            .single();
          linkedPatient = createdPatient || null;
        }

        if (linkedPatient?.id && externalPatient.external_key) {
          await supabase
            .from("patient_external_keys")
            .upsert(
              {
                patient_id: linkedPatient.id,
                lab_id: session.lab_id,
                external_key: externalPatient.external_key
              },
              { onConflict: "patient_id,lab_id" }
            );
        }
      }
    }

    if (!linkedPatient) {
      const { data: leadPatient } = await supabase
        .from("patients")
        .insert({
          name: profileName || "WhatsApp Lead",
          phone: digitsOnly(phone).slice(-10) || phone,
          is_lead: true
        })
        .select("id, name, is_lead, mrn")
        .single();
      linkedPatient = leadPatient || null;
    }

    if (linkedPatient?.id) {
      await supabase
        .from("chat_sessions")
        .update({
          patient_id: linkedPatient.id,
          // Keep UI display aligned with latest WhatsApp identity when available.
          patient_name: profileName || session.patient_name || null
        })
        .eq("id", session.id);
    }

    const activeVisit = linkedPatient?.id
      ? await findActiveVisitForPatient({
          patientId: linkedPatient.id,
          labId: session.lab_id,
          phone,
          mrn: linkedPatient?.mrn || null
        })
      : null;

    if (inboundMedia?.id && !inboundMedia?.url && mediaResolverConfig) {
      try {
        const resolvedUrl = await resolveMediaUrlById({
          mediaId: inboundMedia.id,
          mediaFetchConfig: mediaResolverConfig,
          authDetails: mediaResolverAuth
        });
        if (resolvedUrl) {
          inboundMedia = {
            ...inboundMedia,
            url: resolvedUrl,
            urlSource: "resolved_by_id"
          };
          console.log(
            "📎 MTALKZ_MEDIA resolved_by_id:",
            JSON.stringify({
              messageId,
              mediaId: inboundMedia.id,
              resolvedUrl
            })
          );
        } else {
          console.log(
            "📎 MTALKZ_MEDIA resolve_by_id_failed:",
            JSON.stringify({
              messageId,
              mediaId: inboundMedia.id,
              reason: "empty_resolver_response"
            })
          );
        }
      } catch (resolveErr) {
        console.log(
          "📎 MTALKZ_MEDIA resolve_by_id_error:",
          JSON.stringify({
            messageId,
            mediaId: inboundMedia.id,
            error: resolveErr?.message || "resolver_error"
          })
        );
      }
    }

    if (inboundMedia) {
      console.log(
        "📎 MTALKZ_MEDIA extracted:",
        JSON.stringify({
          messageId,
          type: inboundMedia.type || null,
          id: inboundMedia.id || null,
          url: inboundMedia.url || null,
          urlSource: inboundMedia.urlSource || null
        })
      );
    }

    // Preserve upstream media links (especially Mtalkz `link`) to avoid replacing with uploaded paths.
    const canPersistToStorage =
      inboundMedia?.url &&
      shouldPersistInboundMedia() &&
      inboundMedia.urlSource !== "link";

    if (canPersistToStorage) {
      const persistedUrl = await persistPrescriptionMedia({
        inboundMedia,
        labId: session.lab_id,
        phone
      });
      inboundMedia = { ...inboundMedia, url: persistedUrl || inboundMedia.url || null };
      console.log(
        "📎 MTALKZ_MEDIA storage-persist:",
        JSON.stringify({
          messageId,
          persistedUrl: inboundMedia.url || null
        })
      );
    } else if (inboundMedia?.url) {
      console.log(
        "📎 MTALKZ_MEDIA link-persist:",
        JSON.stringify({
          messageId,
          keptUrl: inboundMedia.url,
          reason:
            inboundMedia.urlSource === "link"
              ? "upstream_link"
              : "storage_persist_disabled"
        })
      );
    }

    // --------------------------------------------------
    // 8️⃣ Log Inbound (Minimal Storage)
    // --------------------------------------------------

    if (!existing) {
      await supabase.from("whatsapp_messages").insert({
        message_id: messageId,
        lab_id: session.lab_id,
        phone: phone,
        name: profileName || null,
        message: userInput,
        direction: "inbound",
        payload: {
          raw_message: message,
          raw_body: body,
          simulated: isSimulationRequest,
          ...(profileName ? { profile_name: profileName } : {}),
          ...(inboundMedia
            ? {
                media: {
                  type: inboundMedia.type,
                  id: inboundMedia.id || null,
                  url: inboundMedia.url || null,
                  url_source: inboundMedia.urlSource || null,
                  filename: inboundMedia.filename || null
                }
              }
            : {})
        }
      });
    }

    if (inboundMedia) {
      console.log(
        "📎 MTALKZ_MEDIA logged:",
        JSON.stringify({
          messageId,
          savedUrl: inboundMedia.url || null,
          savedType: inboundMedia.type || null
        })
      );
    }

    let normalizedSessionStatus = String(session.status || "").toLowerCase();
    const feedbackSuppressedForDeliveryFailure = Boolean(session?.context?.suppress_feedback_once);

    const hasActiveFeedbackStage = Boolean(getFeedbackFlow(session?.context)?.stage);
    if (
      !hasActiveFeedbackStage &&
      (session?.context?.last_report_feedback_armed || session?.context?.last_resolution_feedback_armed) &&
      !isThankYouLikeInput(userInput)
    ) {
      const touchedContext = { ...(session.context || {}) };
      // User moved on to another action. Close pending feedback loop instead of re-arming.
      if (touchedContext.last_report_feedback_armed) {
        touchedContext.last_report_feedback_armed = false;
        touchedContext.last_report_feedback_disarmed_at = new Date().toISOString();
      }
      // Resolution-feedback is intent-sensitive; disarm it on unrelated input.
      if (touchedContext.last_resolution_feedback_armed) {
        touchedContext.last_resolution_feedback_armed = false;
      }
      await supabase
        .from("chat_sessions")
        .update({
          context: touchedContext,
          updated_at: new Date().toISOString()
        })
        .eq("id", session.id);
      session.context = touchedContext;
    }

    const feedbackHandled = await handlePostReportFeedbackInbound({
      session,
      phone,
      userInput,
      lab,
      templates
    });
    if (feedbackHandled?.handled) {
      return Response.json({ success: true });
    }

    const shouldResumeInCurrentTurn =
      ["handoff", "pending", "resolved", "closed"].includes(normalizedSessionStatus) &&
      shouldResumeBotFromHandoff({ message, userInput, inboundMedia, normalizedSessionStatus, session });
    const runtimeBotStatus = shouldResumeInCurrentTurn ? "active" : normalizedSessionStatus;
    if (shouldResumeInCurrentTurn) {
      session.current_state = "START";
      console.log("🤖 Resuming bot logic without auto-changing session status.");
    }

    const botShouldHandleStart = shouldActivateBotFromStart({
      session,
      message,
      userInput,
      inboundMedia
    });
    const isAgentQueueStatus = ["handoff", "pending"].includes(runtimeBotStatus);
    const shouldIncrementUnread =
      runtimeBotStatus !== "closed" &&
      (isAgentQueueStatus || !botShouldHandleStart);
    if (shouldIncrementUnread) {
      const touchedAt = new Date();
      await supabase
        .from("chat_sessions")
        .update({
          last_message_at: touchedAt.toISOString(),
          last_user_message_at: touchedAt.toISOString(),
          unread_count: (session.unread_count || 0) + 1,
          updated_at: touchedAt.toISOString()
        })
        .eq("id", session.id);
    }

    // --------------------------------------------------
    // 9️⃣ Human Handoff Mode
    // --------------------------------------------------

    if (["handoff", "pending"].includes(runtimeBotStatus)) {
      {
      console.log("👤 In human handoff mode.");
      return Response.json({ success: true });
      }
    }

    // --------------------------------------------------
    // 🔟 Process Bot Message
    // --------------------------------------------------

    const botFlowConfig = templates?.bot_flow || {};
    const smartReportEnabled = Boolean(
      templates?.smart_report_enabled ?? botFlowConfig?.smart_report_enabled
    );
    const packageCatalog = getPackageCatalog();
    const reportNotifyNumber =
      botFlowConfig?.report_notify_number ||
      templates?.report_notify_number ||
      lab.alternate_whatsapp_number ||
      lab.internal_whatsapp_number;

    if (
      !feedbackSuppressedForDeliveryFailure &&
      isThankYouLikeInput(userInput) &&
      (
        (session?.context?.last_report_feedback_armed && canOfferPostReportFeedback(session?.context || {})) ||
        (session?.context?.last_resolution_feedback_armed && canOfferResolvedFeedback(session?.context || {}))
      )
    ) {
      const triggerSource = session?.context?.last_report_feedback_armed
        ? "report_delivery_feedback"
        : "agent_resolved_feedback";
      const feedbackFlow = {
        stage: "awaiting_rating",
        trigger_source: triggerSource,
        reqid: String(session?.context?.selected_report_reqid || "").trim() || null,
        reqno: String(session?.context?.selected_report_reqno || "").trim() || null,
        prompted_at: new Date().toISOString()
      };

      await supabase
        .from("chat_sessions")
        .update({
          context: withFeedbackFlowContext(session?.context || {}, feedbackFlow),
          updated_at: new Date().toISOString()
        })
        .eq("id", session.id);

      const intro = botFlowConfig?.texts?.thank_you_feedback_text || "You’re welcome. We’d love your feedback.";
      await sendTextMessage({
        labId: session.lab_id,
        phone,
        text: `${intro}\n\n${feedbackRatingPromptText()}`
      });
      return Response.json({ success: true });
    }

    if (!botShouldHandleStart) {
      // Route non-menu free-form messages to executive attention queue.
      // Avoid sending the same wait message repeatedly once a chat is already in manual handling statuses.
      const statusNow = normalizedSessionStatus;
      const isAlreadyManualMode = ["handoff", "pending", "resolved", "closed"].includes(statusNow);
      if (!isAlreadyManualMode) {
        await handoffToHuman(session.id);
        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text:
            botFlowConfig?.texts?.wait_for_executive_text ||
            "Thanks for your message. Please wait, our executive will reach out to help you shortly."
        });
      }
      return Response.json({ success: true });
    }

    let result = await processMessage(session, userInput, phone, {
      botFlowConfig,
      smartReportEnabled,
      publicBaseUrl:
        process.env.PUBLIC_BASE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "",
      labId: session.lab_id,
      inboundLocation,
      inboundMedia,
      selectedReportTitle: message?.interactive?.list_reply?.title || null,
      packageCatalog,
      activeVisit,
      labName: lab?.name || "our lab",
      reportNotifyNumber
    });
    console.log("[bot] process result", JSON.stringify({
      phone,
      sessionId: session.id,
      sessionState: session.current_state || null,
      summary: summarizeBotResult(result)
    }));

    if (result.replyType === "SEND_DOCUMENT") {
      const isPdfAvailable = await isReachablePdfDocument(result.documentUrl);

      if (!isPdfAvailable) {
        let statusMessage = null;

        if (!result.suppressReportStatusMessage && result.reportStatusReqno) {
          try {
            const reportStatus = await getReportStatus(result.reportStatusReqno);
            statusMessage = buildReportStatusMessage(reportStatus);
          } catch (error) {
            console.error("[report-status] no-pdf fallback failed", {
              reqno: result.reportStatusReqno,
              error: error?.message || String(error)
            });
          }
        } else if (!result.suppressReportStatusMessage && result.latestReportPhone) {
          statusMessage = await buildLatestReportStatusMessageForPhone(result.latestReportPhone);
        }

        result = {
          replyType: "INTERNAL_NOTIFY",
          notifyText: [
            "📄 Report Request",
            `Phone: ${phone}`,
            `Input: ${result.fallbackRequestedInput || "Requested PDF not available"}`,
            statusMessage ? `Status: ${statusMessage.replace(/\n+/g, " | ")}` : null
          ].filter(Boolean).join("\n"),
          replyText:
            statusMessage ||
            botFlowConfig?.texts?.report_request_ack ||
            "Thank you. Our team will verify and send your report shortly.",
          newState: "HUMAN_HANDOVER",
          context: {}
        };
      }
    }

    // --------------------------------------------------
    // 1️⃣1️⃣ Internal Notify
    // --------------------------------------------------

    if (result.replyType === "INTERNAL_NOTIFY") {
      if (reportNotifyNumber) {
        await ensureChatSessionForPhone({
          labId: session.lab_id,
          phone: reportNotifyNumber
        });
        await sendTextMessage({
          labId: session.lab_id,
          phone: reportNotifyNumber,
          text: result.notifyText
        });
      } else {
        console.error("❌ No report notify number configured for lab:", session.lab_id);
      }

      if (result.notifyText?.startsWith("📄 Report Request")) {
        await handoffToHuman(session.id);
        const requestedInput = (userInput || "").trim();

        try {
          const clickupResult = await createReportRequestClickupTask({
            labId: session.lab_id,
            patientPhone: phone,
            requestedInput
          });
          if (!clickupResult.ok && !clickupResult.skipped) {
            console.error("ClickUp report task failed:", clickupResult.error);
          }
        } catch (clickupErr) {
          console.error("Unexpected ClickUp report task error:", clickupErr);
        }

        await sendTeamWebhookNotification({
          templates,
          eventType: "report_request",
          payload: {
            labId: session.lab_id,
            patientPhone: phone,
            notifyText: result.notifyText
          }
        });
      }

      if (result.notifyText?.startsWith("📞 Callback Request")) {
        try {
          const clickupResult = await createWhatsappFollowupClickupTask({
            labId: session.lab_id,
            patientPhone: phone,
            notes: result.notifyText
          });
          if (!clickupResult.ok && !clickupResult.skipped) {
            console.error("ClickUp callback task failed:", clickupResult.error);
          }
        } catch (clickupErr) {
          console.error("Unexpected ClickUp callback task error:", clickupErr);
        }

        await sendTeamWebhookNotification({
          templates,
          eventType: "callback_request",
          payload: {
            labId: session.lab_id,
            patientPhone: phone,
            notifyText: result.notifyText
          }
        });
      }
    }

    // --------------------------------------------------
    // 1️⃣2️⃣ Update Session
    // --------------------------------------------------

    const nextContext = { ...(result.context || {}) };
    const isBotHandledReply = String(result.replyType || "").toUpperCase() !== "INTERNAL_NOTIFY";
    if (hasActiveFeedbackStage && isBotHandledReply) {
      delete nextContext.feedback_flow;
      delete nextContext.post_report_feedback;
      nextContext.last_report_feedback_armed = false;
      nextContext.last_resolution_feedback_armed = false;
      nextContext.last_report_feedback_disarmed_at = new Date().toISOString();
    }
    if (isBotHandledReply) {
      nextContext.last_handled_by = "bot";
      nextContext.last_handled_at = new Date().toISOString();
      if (typeof nextContext.ever_agent_intervened === "undefined") {
        nextContext.ever_agent_intervened = Boolean(session?.context?.ever_agent_intervened);
      }
    }
    const shouldSendSimulationNotice =
      isSimulationRequest && !Boolean(session?.context?.__simulation_notice_sent);
    if (isSimulationRequest) {
      nextContext.__simulation = true;
      nextContext.__simulation_notice_sent = true;
    }

    if (result.replyType === "BOOKING_DATE_MENU") {
      nextContext.available_dates = buildNext7Dates().reduce((acc, item) => {
        acc[item.iso] = item.title;
        return acc;
      }, {});
    }

    if (result.replyType === "BOOKING_SLOT_MENU") {
      try {
        const slots = await fetchVisitTimeSlots();
        nextContext.available_slots = slots.reduce((acc, slot) => {
          acc[String(slot.id)] = slot.title;
          return acc;
        }, {});
        if (result.context?.slot_page) {
          nextContext.slot_page = Number(result.context.slot_page);
        } else if (!nextContext.slot_page || Number(nextContext.slot_page) < 1) {
          nextContext.slot_page = 1;
        }
      } catch (slotError) {
        console.error("❌ Time slot load failed:", slotError);
      }
    }

    if (result.replyType === "PACKAGE_DETAILS_TEXT") {
      const catalog = getPackageCatalog();
      const selectedPackage = catalog.find(
        (pkg) => pkg.packageIndex === Number(nextContext.selected_package_index)
      );
      const selectedVariant =
        selectedPackage?.variants?.[Number(nextContext.selected_variant_index)] || null;

      if (selectedPackage && selectedVariant) {
        nextContext.last_explored_package_name = `${selectedPackage.name} - ${selectedVariant.name}`;
        nextContext.tests = nextContext.last_explored_package_name;
      }
    }

    await updateSession(session.id, result.newState, nextContext, messageTimestamp);
    console.log("[bot] session updated", JSON.stringify({
      phone,
      sessionId: session.id,
      newState: result.newState || null,
      contextKeys: Object.keys(nextContext || {})
    }));

    // --------------------------------------------------
    // 1️⃣3️⃣ Send Reply
    // --------------------------------------------------
    console.log("[bot] send start", JSON.stringify({
      phone,
      sessionId: session.id,
      replyType: result.replyType || "MAIN_MENU_FALLBACK"
    }));

    try {
    if (shouldSendSimulationNotice) {
      await sendTextMessage({
        labId: session.lab_id,
        phone,
        text: "🧪 Simulation mode message"
      });
    }
    switch (result.replyType) {

      case "MAIN_MENU":
        await sendMainMenu({ labId: session.lab_id, phone });
        break;

      case "MORE_SERVICES_MENU":
        await sendMoreServicesMenu({ labId: session.lab_id, phone });
        break;

      case "REPORT_INPUT_PROMPT":
        await sendReportInputPrompt({ labId: session.lab_id, phone });
        break;

      case "REPORT_SELECTION_MENU":
        nextContext.reports = result.reports;
        await sendReportSelectionMenu({
          labId: session.lab_id,
          phone,
          reports: result.reports
        });
        break;

      case "REPORT_HISTORY_TREND_MENU":
        await sendReportHistoryTrendMenu({
          labId: session.lab_id,
          phone
        });
        break;

      case "PACKAGE_MENU": {
        const catalog = getPackageCatalog();
        const menuPage = buildPackageMenuPage(catalog, nextContext.package_page || 1);
        if (menuPage.rows.length === 0) {
          await sendTextMessage({
            labId: session.lab_id,
            phone,
            text:
              botFlowConfig?.texts?.packages_unavailable ||
              "Package details are currently unavailable. Please try again later."
          });
          break;
        }

        await sendPackageMenu({
          labId: session.lab_id,
          phone,
          rows: menuPage.rows,
          page: menuPage.page,
          hasMore: menuPage.hasMore
        });
        break;
      }

      case "PACKAGE_VARIANT_MENU": {
        const catalog = getPackageCatalog();
        const selectedPackage = catalog.find(
          (pkg) => pkg.packageIndex === Number(nextContext.selected_package_index)
        );
        if (!selectedPackage) {
          await sendTextMessage({
            labId: session.lab_id,
            phone,
            text: "Unable to find this package. Please try Explore Packages again."
          });
          break;
        }

        await sendPackageVariantMenu({
          labId: session.lab_id,
          phone,
          packageName: selectedPackage.name,
          rows: buildPackageVariantRows(selectedPackage)
        });
        break;
      }

      case "PACKAGE_DETAILS_TEXT": {
        const catalog = getPackageCatalog();
        const selectedPackage = catalog.find(
          (pkg) => pkg.packageIndex === Number(nextContext.selected_package_index)
        );
        const selectedVariant =
          selectedPackage?.variants?.[Number(nextContext.selected_variant_index)] || null;

        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text: formatPackageVariantMessage(selectedPackage, selectedVariant)
        });
        break;
      }

      case "SEND_LOCATION":
        {
          const latitude = Number(lab.latitude);
          const longitude = Number(lab.longitude);
          const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

          if (hasCoordinates) {
            await sendLocationMessage({
              labId: session.lab_id,
              phone,
              latitude,
              longitude,
              name: lab.name,
              address: lab.address
            });
          } else {
            await sendTextMessage({
              labId: session.lab_id,
              phone,
              text:
                botFlowConfig?.texts?.lab_address_text ||
                templates?.lab_address_text ||
                [lab.name, lab.address].filter(Boolean).join("\n") ||
                "Lab location is currently unavailable. Please contact support."
            });
          }
        }
        break;

      case "SEND_LOCATION_AND_BRANCHES_MENU":
        {
          const latitude = Number(lab.latitude);
          const longitude = Number(lab.longitude);
          const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

          if (hasCoordinates) {
            await sendLocationMessage({
              labId: session.lab_id,
              phone,
              latitude,
              longitude,
              name: lab.name,
              address: lab.address
            });
          } else {
            await sendTextMessage({
              labId: session.lab_id,
              phone,
              text:
                botFlowConfig?.texts?.lab_address_text ||
                templates?.lab_address_text ||
                [lab.name, lab.address].filter(Boolean).join("\n") ||
                "Lab location is currently unavailable. Please contact support."
            });
          }

          await sendBranchLocationsMenu({
            labId: session.lab_id,
            phone
          });
        }
        break;

      case "LOCATION_OPTIONS_MENU":
        await sendLocationOptionsMenu({
          labId: session.lab_id,
          phone
        });
        break;

      case "LOCATION_BRANCHES_MENU":
        await sendBranchLocationsMenu({
          labId: session.lab_id,
          phone
        });
        break;

      case "BRANCH_LOCATION_LINK": {
        const branchRows = templates?.whatsapp_menus?.branch_locations?.rows || [];
        const branchItem = branchRows.find((row) => row?.id === result.branchId);

        const messageText = branchItem?.url
          ? `${branchItem.title || "Branch location"}\n${branchItem.url}`
          : (botFlowConfig?.texts?.branch_location_fallback || "Branch location link is currently unavailable.");

        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text: messageText
        });
        break;
      }

      case "LAB_ADDRESS_TEXT": {
        const addressText =
          botFlowConfig?.texts?.lab_address_text ||
          templates?.lab_address_text ||
          [lab.name, lab.address].filter(Boolean).join("\n");
        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text: addressText || "Address details are currently unavailable."
        });
        break;
      }

      case "LAB_TIMINGS_TEXT":
        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text:
            botFlowConfig?.texts?.lab_timings_text ||
            templates?.lab_timings_text ||
            "Lab timings are currently unavailable."
        });
        break;

      case "SEND_LOCATION_AND_ADDRESS": {
        await sendLocationMessage({
          labId: session.lab_id,
          phone,
          latitude: lab.latitude,
          longitude: lab.longitude,
          name: lab.name,
          address: lab.address
        });

        const addressText =
          botFlowConfig?.texts?.lab_address_text ||
          templates?.lab_address_text ||
          [lab.name, lab.address].filter(Boolean).join("\n");
        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text: addressText || "Address details are currently unavailable."
        });
        break;
      }

      case "FEEDBACK_LINK": {
        if (feedbackSuppressedForDeliveryFailure) {
          await sendTextMessage({
            labId: session.lab_id,
            phone,
            text: "Feedback will be available after report delivery is completed by our executive."
          });
          break;
        }
        const feedbackFlow = {
          stage: "awaiting_rating",
          trigger_source: "services_feedback",
          reqid: String(nextContext.selected_report_reqid || "").trim() || null,
          reqno: String(nextContext.selected_report_reqno || "").trim() || null,
          prompted_at: new Date().toISOString()
        };
        await updateSession(
          session.id,
          result.newState || session.current_state || "START",
          withFeedbackFlowContext(nextContext, feedbackFlow),
          messageTimestamp
        );
        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text: feedbackRatingPromptText()
        });
        break;
      }

      case "BOOKING_DATE_MENU": {
        const dateOptions = buildNext7Dates();
        await sendBookingDateMenu({
          labId: session.lab_id,
          phone,
          dates: dateOptions
        });
        break;
      }

      case "BOOKING_SERVICES_MENU":
        await sendBookingServicesMenu({
          labId: session.lab_id,
          phone,
          hasActiveVisit: Boolean(nextContext.has_active_visit),
          activeVisitSummary: nextContext.active_visit_summary || ""
        });
        break;

      case "BOOKING_SLOT_MENU": {

        let slotOptions = [];

        try {
          slotOptions = await fetchVisitTimeSlots();
        } catch (slotError) {
          console.error("❌ Time slot menu send failed:", slotError);
        }

        // Hide past slots if booking for today (+30 min buffer)
        const selectedDateIso = nextContext.selected_date_iso;
        const todayIso = new Date().toISOString().slice(0,10);

        if (selectedDateIso === todayIso) {

          const now = new Date();
          const currentMinutes = now.getHours() * 60 + now.getMinutes() + 30;

          slotOptions = slotOptions.filter(slot => {

            const [h,m] = slot.start_time.split(":");
            const slotMinutes = Number(h) * 60 + Number(m);

            return slotMinutes > currentMinutes;

          });

        }

        if (slotOptions.length === 0) {
          await sendTextMessage({
            labId: session.lab_id,
            phone,
            text: "No slots are available today. Please select another date."
          });
          break;
        }

        await sendBookingSlotMenu({
          labId: session.lab_id,
          phone,
          dateLabel: nextContext.selected_date || "selected date",
          timeSlots: slotOptions,
          page: nextContext.slot_page || 1
        });

        break;
      }

      case "BOOKING_LOCATION_MENU":
        await sendBookingLocationMenu({
          labId: session.lab_id,
          phone
        });
        break;

      case "CALL_QUICKBOOK":
        {
        const inferredPackageName =
          nextContext.tests ||
          nextContext.last_explored_package_name ||
          null;
        const inferredArea =
          nextContext.area ||
          nextContext.location_text ||
          nextContext.location_address ||
          "Not provided";

        const quickbookResponse = await fetch("https://lab.sdrc.in/api/quickbook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientName: profileName || "WhatsApp User",
            phone,
            packageName: inferredPackageName,
            area: inferredArea,
            date: nextContext.selected_date_iso || nextContext.selected_date,
            timeslot: nextContext.selected_slot_id || nextContext.selected_slot,
            persons: 1,
            whatsapp: true,
            agree: true,
            location_source: nextContext.location_source || null,
            location_text: nextContext.location_text || null,
            location_name: nextContext.location_name || null,
            location_address: nextContext.location_address || null,
            location_lat: nextContext.location_lat || null,
            location_lng: nextContext.location_lng || null,
            prescription: nextContext.prescription || null
          })
        });

        if (quickbookResponse.ok) {
          const quickbookBody = await quickbookResponse.json().catch(() => null);
          const bookingId = quickbookBody?.booking?.id || null;

          await sendTextMessage({
            labId: session.lab_id,
            phone,
            text:
              result.replyText ||
              botFlowConfig?.texts?.booking_submitted_ack ||
              "Your booking request has been received. Our team will contact you shortly."
          });

          if (bookingId) {
            const postBookingContext = {
              ...nextContext,
              quickbook_booking_id: bookingId,
              quickbook_awaiting_optional_location: true
            };
            await updateSession(
              session.id,
              "BOOKING_POST_CONFIRM_LOCATION_OFFER",
              postBookingContext,
              messageTimestamp
            );
            await wait(350);
            await sendBookingPostConfirmLocationMenu({
              labId: session.lab_id,
              phone
            });
          }
        } else {
          const quickbookErrorText = await quickbookResponse.text();
          console.error("❌ Quickbook failed:", quickbookResponse.status, quickbookErrorText);

          await sendTextMessage({
            labId: session.lab_id,
            phone,
            text:
              botFlowConfig?.texts?.booking_submitted_failed ||
              "We could not submit your booking right now. Our team will contact you shortly."
          });
        }
        break;
        }

      case "QUICKBOOK_LOCATION_UPDATE": {
        const bookingId = nextContext.quickbook_booking_id;
        if (!bookingId) {
          await sendTextMessage({
            labId: session.lab_id,
            phone,
            text: "Booking is confirmed. Location update was skipped because booking reference was not found."
          });
          break;
        }

        const locationUpdateResponse = await fetch(`https://lab.sdrc.in/api/quickbook/${bookingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            location_source: nextContext.location_source || null,
            location_text: nextContext.location_text || null,
            location_name: nextContext.location_name || null,
            location_address: nextContext.location_address || null,
            location_lat: nextContext.location_lat || null,
            location_lng: nextContext.location_lng || null
          })
        });

        if (!locationUpdateResponse.ok) {
          const errText = await locationUpdateResponse.text();
          console.error("❌ Quickbook location update failed:", locationUpdateResponse.status, errText);
          await sendTextMessage({
            labId: session.lab_id,
            phone,
            text: "Your booking is confirmed. We could not save the location right now."
          });
        } else {
          await sendTextMessage({
            labId: session.lab_id,
            phone,
            text:
              result.replyText ||
              "Thanks. We’ve saved your location for the visit team."
          });
        }

        await updateSession(session.id, "START", {}, messageTimestamp);
        break;
      }

      case "HANDOFF":
        await handoffToHuman(session.id);
        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text: result.replyText
        });
        break;

      case "SEND_DOCUMENT":
        var dispatchReqid = null;
        var dispatchReqno = null;
        {
          const dispatchStartedAt = Date.now();
          dispatchReqid =
            String(nextContext.selected_report_reqid || result?.context?.selected_report_reqid || "").trim() || null;
          dispatchReqno =
            String(result.reportStatusReqno || nextContext.selected_report_reqno || result?.context?.selected_report_reqno || "").trim() ||
            null;
          let readyLabTestKeys = [];

          if (dispatchReqno) {
            try {
              const dispatchStatus = await getReportStatus(dispatchReqno);
              readyLabTestKeys = extractReadyLabTestKeys(dispatchStatus);
            } catch (statusErr) {
              console.warn("[bot] dispatch breakup lookup skipped", {
                reqno: dispatchReqno,
                error: statusErr?.message || String(statusErr)
              });
            }
          }

          try {
            const sendResponse = await sendDocumentMessage({
              labId: session.lab_id,
              phone,
              documentUrl: result.documentUrl,
              filename: result.filename
            });

            await logReportDispatch({
              labId: session.lab_id,
              actorName: "WhatsApp Bot",
              actorRole: "bot",
              sourcePage: "report_dispatch",
              action: "send_whatsapp",
              targetMode: "single",
              reqid: dispatchReqid,
              reqno: dispatchReqno,
              phone,
              reportType: "combined",
              headerMode: "default",
              status: "success",
              resultCode: "BOT_SEND_OK",
              resultMessage: "Report sent via bot flow",
              providerMessageId: extractProviderMessageId(sendResponse),
              requestPayload: {
                document_url: result.documentUrl,
                filename: result.filename,
                reply_type: result.replyType || "SEND_DOCUMENT",
                ready_lab_test_keys: readyLabTestKeys
              },
              responsePayload: sendResponse,
              durationMs: Date.now() - dispatchStartedAt,
              documentUrl: result.documentUrl
            });
          } catch (sendDocumentError) {
            await logReportDispatch({
              labId: session.lab_id,
              actorName: "WhatsApp Bot",
              actorRole: "bot",
              sourcePage: "report_dispatch",
              action: "send_whatsapp",
              targetMode: "single",
              reqid: dispatchReqid,
              reqno: dispatchReqno,
              phone,
              reportType: "combined",
              headerMode: "default",
              status: "failed",
              resultCode: "BOT_SEND_FAILED",
              resultMessage: sendDocumentError?.message || "Unknown send error",
              requestPayload: {
                document_url: result.documentUrl,
                filename: result.filename,
                reply_type: result.replyType || "SEND_DOCUMENT",
                ready_lab_test_keys: readyLabTestKeys
              },
              durationMs: Date.now() - dispatchStartedAt,
              documentUrl: result.documentUrl
            });
            throw sendDocumentError;
          }
        }
        {
          let statusMessage = null;
          if (!result.suppressReportStatusMessage && result.reportStatusReqno) {
            try {
              const reportStatus = await getReportStatus(result.reportStatusReqno);
              statusMessage = buildReportStatusMessage(reportStatus);
            } catch (error) {
              console.error("[report-status] follow-up send failed", {
                reqno: result.reportStatusReqno,
                error: error?.message || String(error)
              });
            }
          } else if (!result.suppressReportStatusMessage && result.latestReportPhone) {
            statusMessage = await buildLatestReportStatusMessageForPhone(result.latestReportPhone);
          }

          if (statusMessage) {
            await sendTextMessage({
              labId: session.lab_id,
              phone,
              text: statusMessage
            });
          }
        }
        if (result.sendReportActionsMenu) {
          await wait(4000);
          await sendReportPostDownloadMenu({
            labId: session.lab_id,
            phone
          });
        }
        const shouldPromptPostReportFeedback = !feedbackSuppressedForDeliveryFailure;
        if (shouldPromptPostReportFeedback) {
          const reportFeedbackContext = withFeedbackFlowContext(
            {
              ...nextContext,
              suppress_feedback_once: false,
              last_report_delivery_at: new Date().toISOString(),
              last_report_delivery_reqid: dispatchReqid || null,
              last_report_delivery_reqno: dispatchReqno || result.reportStatusReqno || null,
              last_report_feedback_armed: true,
              last_report_feedback_disarmed_at: null
            },
            null
          );
          await updateSession(
            session.id,
            result.newState || session.current_state || "START",
            reportFeedbackContext,
            new Date().toISOString()
          );
          schedulePostReportFeedbackPrompt({
            sessionId: session.id,
            labId: session.lab_id,
            phone,
            reqid: dispatchReqid,
            reqno: dispatchReqno,
            baselineInboundAt: new Date().toISOString()
          });
        }
        break;

      case "TEXT":
        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text: result.replyText
        });
        break;

      case "INTERNAL_NOTIFY":
        await sendTextMessage({
          labId: session.lab_id,
          phone,
          text:
            result.replyText ||
            botFlowConfig?.texts?.report_request_ack ||
            "Thank you. Our team will verify and send your report shortly."
        });
        break;

      default:
        await sendMainMenu({ labId: session.lab_id, phone });
    }
    } catch (sendError) {
      console.error("[bot] send failed", JSON.stringify({
        phone,
        sessionId: session.id,
        replyType: result.replyType || "MAIN_MENU_FALLBACK",
        error: sendError?.message || String(sendError)
      }));
      throw sendError;
    }

    console.log("[bot] send ok", JSON.stringify({
      phone,
      sessionId: session.id,
      replyType: result.replyType || "MAIN_MENU_FALLBACK"
    }));

    return Response.json({ success: true });

      } catch (err) {
        console.error("🚨 Webhook Error:", err);
        return Response.json({ success: false }, { status: 500 });
      }
    }
  );
}
