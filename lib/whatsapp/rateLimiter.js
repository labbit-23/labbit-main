// lib/whatsapp/rateLimiter.js
//
// Per-patient rate limit on outbound WhatsApp "service"-category messages
// (free-form text/interactive/document/location sends from the bot), added
// 2026-10-02 off real production volume analysis: cap at 15/hour, 40/day per
// patient phone number. Deliberately scoped to ONLY service-category sends
// -- `type === "template"` (report delivery, booking confirmations, OTP,
// etc.) is a transactional/business-initiated send and must NEVER be
// blocked by this cap. See isServiceCategoryPayload() below; every caller
// must check this before applying the limit.
//
// Fixed window, not sliding: a simple per-calendar-hour / per-calendar-day
// window (IST, matching the rest of this codebase's day-boundary logic --
// see getIstDateKey()-style helpers elsewhere). Chosen over a sliding
// window because it's simpler to reason about and verify, and at this cap
// size (15/hr, 40/day) the "burst right at the boundary" edge case a fixed
// window allows is not worth the added complexity of a sliding-window
// implementation or a new counter table.
//
// Storage: reuses the existing `whatsapp_messages` table (direction=
// 'outbound' rows already logged by every send in lib/whatsapp/sender.js)
// via a live COUNT query, rather than introducing a new counter table --
// per the task's instruction to prefer existing data when a live COUNT is
// fast enough for a per-message gate check. Recommended follow-up (not
// blocking this feature): no migration currently adds an index on
// whatsapp_messages(lab_id, phone, direction, created_at) -- add one if this
// COUNT shows up as slow/expensive once there's real volume behind it.

import { supabase } from "@/lib/supabaseServer";
import { toCanonicalIndiaPhone, digitsOnly } from "@/lib/phone";
import {
  isInternalWhatsappNumber,
  resolveInternalNotifyPhone,
  parseWhatsappTemplates
} from "@/lib/whatsapp/internalNumbers";

export const HOURLY_SERVICE_MESSAGE_CAP = 15;
export const DAILY_SERVICE_MESSAGE_CAP = 40;

// Only these `payload.request.type` values count toward (and can be
// blocked by) the cap. "template" is intentionally excluded and must stay
// excluded -- see module header.
const SERVICE_REQUEST_TYPES = new Set(["text", "interactive", "document", "location"]);

// Marker stored on the one-time cap-hit notice so we can tell "have we
// already told this patient we're catching up on messages in this window"
// without a separate table -- the notice is itself a normal "text" send (so
// it counts toward the cap, by design: see module header) but must only go
// out once per window, not once per subsequent blocked message.
const RATE_LIMIT_NOTICE_MARKER = "rate_limit_notice";

export function isServiceCategoryPayload(payload) {
  const type = String(payload?.type || "").trim().toLowerCase();
  return SERVICE_REQUEST_TYPES.has(type);
}

function getIstNow() {
  // en-CA gives sortable YYYY-MM-DD; combined with hour below this is
  // enough to build stable IST hour/day window-start timestamps without a
  // timezone library.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") === "24" ? "00" : get("hour")
  };
}

// IST offset is a fixed +05:30 (no DST) -- safe to hardcode for window-start
// math.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function istCalendarHourStartIso() {
  const { year, month, day, hour } = getIstNow();
  const istWallClockMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), 0, 0);
  return new Date(istWallClockMs - IST_OFFSET_MS).toISOString();
}

function istCalendarDayStartIso() {
  const { year, month, day } = getIstNow();
  const istWallClockMs = Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0);
  return new Date(istWallClockMs - IST_OFFSET_MS).toISOString();
}

async function countServiceSendsSince({ labId, phone, sinceIso }) {
  const { count, error } = await supabase
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("lab_id", labId)
    .eq("phone", phone)
    .eq("direction", "outbound")
    .in("payload->request->>type", Array.from(SERVICE_REQUEST_TYPES))
    .gte("created_at", sinceIso);

  if (error) {
    console.error("[whatsapp-rate-limit] count query failed", error?.message || error);
    // Fail OPEN: a DB/query hiccup must never block real patient traffic.
    return 0;
  }
  return count || 0;
}

async function hasSentNoticeSince({ labId, phone, sinceIso }) {
  const { count, error } = await supabase
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("lab_id", labId)
    .eq("phone", phone)
    .eq("direction", "outbound")
    .eq(`payload->>${RATE_LIMIT_NOTICE_MARKER}`, "true")
    .gte("created_at", sinceIso);

  if (error) {
    console.error("[whatsapp-rate-limit] notice-check query failed", error?.message || error);
    // Fail toward NOT having sent a notice yet -- worst case is one extra
    // notice gets sent, never an infinite-loop exemption (the notice send
    // itself still goes through the exact same cap/count path).
    return false;
  }
  return (count || 0) > 0;
}

function buildCapHitNoticeText(supportPhoneDisplay) {
  const callLine = supportPhoneDisplay
    ? `please call us at ${supportPhoneDisplay}`
    : "please call our front desk";
  return `We're catching up on messages — ${callLine} or try again shortly.`;
}

function formatSupportPhoneForDisplay(canonicalPhone) {
  const digits = digitsOnly(canonicalPhone);
  if (!digits) return "";
  if (digits.length === 12 && digits.startsWith("91")) return `+91 ${digits.slice(2)}`;
  if (digits.length === 10) return `+91 ${digits}`;
  return `+${digits}`;
}

/**
 * Gate for a single outbound send. Call BEFORE the actual provider fetch.
 * Only applies to service-category payloads (callers must still gate the
 * call with isServiceCategoryPayload, but this also re-checks defensively).
 *
 * Returns one of:
 *   { action: "send" }                     -- under the cap, send normally.
 *   { action: "send_notice", noticeText }   -- cap just hit, send the ONE
 *                                              catching-up notice instead of
 *                                              the original payload.
 *   { action: "suppress" }                 -- cap hit and notice already
 *                                              sent this window -- drop the
 *                                              send entirely, no DB write.
 */
export async function evaluateServiceSendGate({ labId, phone, payload }) {
  if (!isServiceCategoryPayload(payload)) {
    return { action: "send" };
  }

  const canonicalPhone = toCanonicalIndiaPhone(phone) || digitsOnly(phone);

  const internal = await isInternalWhatsappNumber({ labId, canonicalPhone });
  if (internal) {
    return { action: "send" };
  }

  const hourStartIso = istCalendarHourStartIso();
  const dayStartIso = istCalendarDayStartIso();

  const [hourlyCount, dailyCount] = await Promise.all([
    countServiceSendsSince({ labId, phone, sinceIso: hourStartIso }),
    countServiceSendsSince({ labId, phone, sinceIso: dayStartIso })
  ]);

  const dailyCapHit = dailyCount >= DAILY_SERVICE_MESSAGE_CAP;
  const hourlyCapHit = hourlyCount >= HOURLY_SERVICE_MESSAGE_CAP;

  if (!dailyCapHit && !hourlyCapHit) {
    return { action: "send" };
  }

  // Whichever window is tighter right now governs the notice-dedup check --
  // a day-cap hit outlives the hourly window, so check both and suppress if
  // either window already saw the notice.
  const [noticeSentThisHour, noticeSentToday] = await Promise.all([
    hasSentNoticeSince({ labId, phone, sinceIso: hourStartIso }),
    hasSentNoticeSince({ labId, phone, sinceIso: dayStartIso })
  ]);

  if (noticeSentThisHour || noticeSentToday) {
    console.log("[whatsapp-rate-limit] suppressed (notice already sent this window)", {
      labId,
      phone,
      hourlyCount,
      dailyCount
    });
    return { action: "suppress" };
  }

  console.log("[whatsapp-rate-limit] cap hit, sending one-time notice", {
    labId,
    phone,
    hourlyCount,
    dailyCount,
    dailyCapHit,
    hourlyCapHit
  });

  return {
    action: "send_notice",
    noticeText: buildCapHitNoticeText(await resolveSupportPhoneDisplay(labId))
  };
}

async function resolveSupportPhoneDisplay(labId) {
  try {
    const { data: lab } = await supabase
      .from("labs")
      .select("internal_whatsapp_number")
      .eq("id", labId)
      .maybeSingle();
    const { data: apiConfig } = await supabase
      .from("labs_apis")
      .select("templates")
      .eq("lab_id", labId)
      .eq("api_name", "whatsapp_outbound")
      .maybeSingle();
    const supportPhone = resolveInternalNotifyPhone({
      templates: parseWhatsappTemplates(apiConfig?.templates),
      lab
    });
    return formatSupportPhoneForDisplay(supportPhone);
  } catch (error) {
    console.error("[whatsapp-rate-limit] support phone lookup failed", error?.message || error);
    return "";
  }
}

export const __rateLimitNoticeMarker = RATE_LIMIT_NOTICE_MARKER;
