import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

const WAIT_FOR_EXECUTIVE_TEXT = "please wait, our executive will reach out to help you shortly";
const REPORT_WAIT_TEXT = "thank you. our team will verify and send your report shortly";
const IST_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true
});
const IST_TIME_ONLY_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
});
const IST_DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function isBotOutboundMessage(row) {
  if (row?.direction !== "outbound") return false;

  const sender = row?.payload?.sender;
  const senderRole = String(sender?.role || sender?.userType || sender?.type || "").toLowerCase();
  const hasHumanRoleHint = ["executive", "agent", "admin", "human"].some((hint) =>
    senderRole.includes(hint)
  );

  if (hasHumanRoleHint) return false;

  const hasSenderIdentity = Boolean(sender?.id || sender?.name);
  const request = row?.payload?.request;
  const response = row?.payload?.response;

  if (!hasSenderIdentity) return true;

  // Some runtime paths can set sender metadata for automated sends.
  // If there is no clear human-role hint and we have request/response payload,
  // treat it as bot-generated outbound.
  return Boolean(request || response);
}

function isBotReportDocument(row) {
  if (!isBotOutboundMessage(row)) return false;
  const request = row?.payload?.request || {};
  const document = request?.document || {};
  const link = String(document?.link || "").toLowerCase();
  const filename = String(document?.filename || "").toLowerCase();
  const text = String(document?.caption || row?.message || "").toLowerCase();

  return request?.type === "document" && (
    link.includes("/report/") ||
    link.includes("trend") ||
    link.includes("report") ||
    filename.includes("report") ||
    text.includes("report")
  );
}

function buildMetricRow({
  labId,
  serviceKey,
  label,
  status = "healthy",
  message,
  payload = {},
  checkedAt
}) {
  return {
    lab_id: labId,
    service_key: serviceKey,
    category: "whatsapp",
    label,
    status,
    checked_at: checkedAt,
    source: "labbit_runtime",
    latency_ms: null,
    message,
    payload,
    updated_at: checkedAt
  };
}

function formatIstTime(value) {
  if (!value) return null;
  const parsed = parseTimestamp(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return IST_FORMATTER.format(parsed);
}

function parseTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value !== "string") return new Date(value);
  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(value);
  const normalized = hasTimezone ? value : `${value.replace(" ", "T")}Z`;
  return new Date(normalized);
}

function normalizePhoneKey(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  if (!digits) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function getIstMinutes(date = new Date()) {
  const parts = IST_TIME_ONLY_FORMATTER.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return Number(map.hour || 0) * 60 + Number(map.minute || 0);
}

function isWithinBotActiveWindow(date = new Date()) {
  const minutes = getIstMinutes(date);
  return minutes >= 7 * 60 && minutes <= 23 * 60;
}

function computeBotResponseSla({ rows = [], nowMs }) {
  const thresholdMs = 60 * 1000;
  const responseWindowMs = 10 * 60 * 1000;
  const since1hMs = nowMs - 60 * 60 * 1000;

  const inboundByPhone = new Map();
  const outboundByPhone = new Map();

  for (const row of rows) {
    if (!row?.phone || !row?.created_at) continue;
    const ts = parseTimestamp(row.created_at);
    const createdMs = ts?.getTime?.();
    if (!Number.isFinite(createdMs)) continue;

    if (row.direction === "inbound") {
      const list = inboundByPhone.get(row.phone) || [];
      list.push({ ...row, createdMs });
      inboundByPhone.set(row.phone, list);
      continue;
    }

    if (row.direction === "outbound" && isBotOutboundMessage(row)) {
      const list = outboundByPhone.get(row.phone) || [];
      list.push({ ...row, createdMs });
      outboundByPhone.set(row.phone, list);
    }
  }

  for (const list of inboundByPhone.values()) {
    list.sort((a, b) => a.createdMs - b.createdMs);
  }
  for (const list of outboundByPhone.values()) {
    list.sort((a, b) => a.createdMs - b.createdMs);
  }

  let total = 0;
  let withinSla = 0;
  let breachCount = 0;
  let timeoutCount = 0;
  let lastInboundAt = null;
  const responseMsList = [];
  const issueSamples = [];

  for (const [phone, inboundList] of inboundByPhone.entries()) {
    const outboundList = outboundByPhone.get(phone) || [];
    let outIndex = 0;

    for (const inbound of inboundList) {
      if (inbound.createdMs < since1hMs) continue;

      total += 1;
      lastInboundAt = inbound.created_at;

      while (outIndex < outboundList.length && outboundList[outIndex].createdMs < inbound.createdMs) {
        outIndex += 1;
      }

      if (outIndex >= outboundList.length) {
        timeoutCount += 1;
        issueSamples.push({
          phone,
          issue_type: "no_reply",
          inbound_at: inbound.created_at,
          inbound_text: String(inbound?.message || "").slice(0, 160),
          response_delay_ms: null
        });
        continue;
      }

      const delta = outboundList[outIndex].createdMs - inbound.createdMs;
      if (delta > responseWindowMs) {
        timeoutCount += 1;
        issueSamples.push({
          phone,
          issue_type: "no_reply",
          inbound_at: inbound.created_at,
          inbound_text: String(inbound?.message || "").slice(0, 160),
          response_delay_ms: null
        });
        continue;
      }

      responseMsList.push(delta);
      if (delta <= thresholdMs) {
        withinSla += 1;
      } else {
        breachCount += 1;
        issueSamples.push({
          phone,
          issue_type: "late_reply",
          inbound_at: inbound.created_at,
          outbound_at: outboundList[outIndex].created_at,
          inbound_text: String(inbound?.message || "").slice(0, 160),
          response_delay_ms: delta
        });
      }
    }
  }

  const sorted = [...responseMsList].sort((a, b) => a - b);
  const p95Ms =
    sorted.length === 0
      ? null
      : sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1))];
  const maxMs = sorted.length === 0 ? null : sorted[sorted.length - 1];
  const lastInboundDate = parseTimestamp(lastInboundAt);
  const lastInboundMinutesAgo = lastInboundDate
    ? Math.max(0, Math.round((nowMs - lastInboundDate.getTime()) / (60 * 1000)))
    : null;

  let status = "unknown";
  if (total > 0) {
    status = breachCount > 0 || timeoutCount > 0 ? "down" : "healthy";
  }

  return {
    status,
    thresholdMs,
    responseWindowMs,
    total,
    withinSla,
    breachCount,
    timeoutCount,
    p95Ms,
    maxMs,
    issueSamples: issueSamples.slice(-20).reverse(),
    lastInboundAt,
    lastInboundMinutesAgo
  };
}

async function loadWhatsappBotMetrics(labId) {
  if (!labId) return [];

  const now = Date.now();
  const checkedAt = new Date(now).toISOString();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const since1h = new Date(now - 60 * 60 * 1000).toISOString();
  const since2h = new Date(now - 2 * 60 * 60 * 1000).toISOString();

  const [{ data: recentRows, error: recentError }, { data: hourlyRows, error: hourlyError }, { data: monthlyRows, error: monthlyError }, { data: slaRows, error: slaError }] = await Promise.all([
    supabase
      .from("whatsapp_messages")
      .select("created_at, direction, message, payload")
      .eq("lab_id", labId)
      .eq("direction", "outbound")
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(1500),
    supabase
      .from("whatsapp_messages")
      .select("created_at, direction, message, payload")
      .eq("lab_id", labId)
      .eq("direction", "outbound")
      .gte("created_at", since1h)
      .order("created_at", { ascending: false })
      .limit(600),
    supabase
      .from("whatsapp_messages")
      .select("created_at, direction, message, payload")
      .eq("lab_id", labId)
      .eq("direction", "outbound")
      .gte("created_at", since30d)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("whatsapp_messages")
      .select("created_at, direction, message, payload, phone")
      .eq("lab_id", labId)
      .in("direction", ["inbound", "outbound"])
      .gte("created_at", since2h)
      .order("created_at", { ascending: true })
      .limit(5000)
  ]);

  if (recentError) throw recentError;
  if (hourlyError) throw hourlyError;
  if (monthlyError) throw monthlyError;
  if (slaError) throw slaError;

  const recent = Array.isArray(recentRows) ? recentRows : [];
  const hourly = Array.isArray(hourlyRows) ? hourlyRows : [];
  const monthly = Array.isArray(monthlyRows) ? monthlyRows : [];
  const recentBotRows = recent.filter(isBotOutboundMessage);
  const hourlyBotRows = hourly.filter(isBotOutboundMessage);
  const monthlyBotRows = monthly.filter(isBotOutboundMessage);
  const recentReportDocs = recentBotRows.filter(isBotReportDocument);
  const hourlyReportDocs = hourlyBotRows.filter(isBotReportDocument);
  const monthlyReportDocs = monthlyBotRows.filter(isBotReportDocument);

  const waitForExecutiveCount = recentBotRows.filter((row) =>
    String(row?.message || "").toLowerCase().includes(WAIT_FOR_EXECUTIVE_TEXT)
  ).length;

  const reportWaitCount = recentBotRows.filter((row) =>
    String(row?.message || "").toLowerCase().includes(REPORT_WAIT_TEXT)
  ).length;
  const responseSla = computeBotResponseSla({
    rows: Array.isArray(slaRows) ? slaRows : [],
    nowMs: now
  });

  const rawIssueSamples = Array.isArray(responseSla.issueSamples) ? responseSla.issueSamples : [];
  const issuePhones = [...new Set(rawIssueSamples.map((sample) => String(sample?.phone || "").trim()).filter(Boolean))];
  let issueSessionByPhoneKey = new Map();
  if (issuePhones.length > 0) {
    const { data: issueSessions } = await supabase
      .from("chat_sessions")
      .select("phone, status, current_state, updated_at, last_message_at")
      .eq("lab_id", labId)
      .in("phone", issuePhones)
      .order("updated_at", { ascending: false })
      .limit(500);

    const map = new Map();
    for (const session of issueSessions || []) {
      const key = normalizePhoneKey(session?.phone);
      if (!key || map.has(key)) continue;
      map.set(key, session);
    }
    issueSessionByPhoneKey = map;
  }

  const lastAnyOutboundAt = recent[0]?.created_at || monthly[0]?.created_at || null;
  const lastAnyOutboundDate = parseTimestamp(lastAnyOutboundAt);
  const lastAnyOutboundMinutesAgo = lastAnyOutboundDate
    ? Math.max(0, Math.round((now - lastAnyOutboundDate.getTime()) / (60 * 1000)))
    : null;
  const lastBotMessageAt = recentBotRows[0]?.created_at || monthlyBotRows[0]?.created_at || null;
  const lastBotReportAt = monthlyReportDocs[0]?.created_at || null;
  const lastBotMessageDate = parseTimestamp(lastBotMessageAt);
  const lastBotReportDate = parseTimestamp(lastBotReportAt);
  const lastBotMessageMinutesAgo = lastBotMessageDate
    ? Math.max(0, Math.round((now - lastBotMessageDate.getTime()) / (60 * 1000)))
    : null;
  const lastBotReportMinutesAgo = lastBotReportDate
    ? Math.max(0, Math.round((now - lastBotReportDate.getTime()) / (60 * 1000)))
    : null;

  let activityStatus = "unknown";
  const isActiveWindow = isWithinBotActiveWindow(new Date());
  if (lastBotMessageDate) {
    if (!isActiveWindow) {
      activityStatus = "unknown";
    } else if (lastBotMessageMinutesAgo <= 90) {
      activityStatus = "healthy";
    } else if (lastBotMessageMinutesAgo <= 240) {
      activityStatus = "degraded";
    } else {
      activityStatus = "down";
    }
  }

  return [
    buildMetricRow({
      labId,
      checkedAt,
      serviceKey: "whatsapp_bot_activity",
      label: "WhatsApp Bot Activity",
      status: activityStatus,
      message: lastBotMessageAt
        ? `Last delivered bot message ${lastBotMessageMinutesAgo} min ago • ${formatIstTime(lastBotMessageAt)} IST${isActiveWindow ? "" : " (outside active hours 07:00-23:00)"}`
        : "No recent bot outbound messages found",
      payload: {
        last_bot_message_at: lastBotMessageAt,
        last_bot_message_ist: formatIstTime(lastBotMessageAt),
        last_bot_message_minutes_ago: lastBotMessageMinutesAgo,
        last_any_outbound_message_at: lastAnyOutboundAt,
        last_any_outbound_message_ist: formatIstTime(lastAnyOutboundAt),
        last_any_outbound_message_minutes_ago: lastAnyOutboundMinutesAgo,
        active_window_ist: "07:00-23:00",
        is_within_active_window: isActiveWindow,
        bot_messages_24h: recentBotRows.length
      }
    }),
    buildMetricRow({
      labId,
      checkedAt,
      serviceKey: "whatsapp_bot_chats_24h",
      label: "Bot Chats Handled",
      status: recentBotRows.length > 0 ? "healthy" : "unknown",
      message: `${recentBotRows.length} bot message${recentBotRows.length === 1 ? "" : "s"} delivered in the last 24h`,
      payload: {
        count_24h: recentBotRows.length,
        count_1h: hourlyBotRows.length,
        last_bot_message_at: lastBotMessageAt,
        last_bot_message_ist: formatIstTime(lastBotMessageAt)
      }
    }),
    buildMetricRow({
      labId,
      checkedAt,
      serviceKey: "whatsapp_bot_reports_24h",
      label: "Bot Reports Sent",
      status: recentReportDocs.length > 0 ? "healthy" : "unknown",
      message: `${recentReportDocs.length} bot report document${recentReportDocs.length === 1 ? "" : "s"} sent in the last 24h`,
      payload: {
        count_24h: recentReportDocs.length,
        count_1h: hourlyReportDocs.length,
        last_bot_report_sent_at: lastBotReportAt,
        last_bot_report_sent_ist: formatIstTime(lastBotReportAt),
        last_bot_report_minutes_ago: lastBotReportMinutesAgo
      }
    }),
    buildMetricRow({
      labId,
      checkedAt,
      serviceKey: "whatsapp_bot_last_report",
      label: "Last Bot Report Sent",
      status: lastBotReportAt ? "healthy" : "unknown",
      message: lastBotReportAt
        ? `Last bot report ${lastBotReportMinutesAgo} min ago • ${formatIstTime(lastBotReportAt)} IST`
        : "No bot report document found in the last 30 days",
      payload: {
        last_bot_report_sent_at: lastBotReportAt,
        last_bot_report_sent_ist: formatIstTime(lastBotReportAt),
        last_bot_report_minutes_ago: lastBotReportMinutesAgo
      }
    }),
    buildMetricRow({
      labId,
      checkedAt,
      serviceKey: "whatsapp_bot_response_sla_1m",
      label: "Bot Response SLA (1m)",
      status: responseSla.status,
      message:
        responseSla.total > 0
          ? `${responseSla.withinSla} of ${responseSla.total} patient messages replied within 1 min in last 1h${responseSla.breachCount > 0 ? ` • ${responseSla.breachCount} late` : ""}${responseSla.timeoutCount > 0 ? ` • ${responseSla.timeoutCount} no-reply` : ""}`
          : "No inbound patient messages in the last 1h",
      payload: {
        threshold_seconds: 60,
        response_window_minutes: 10,
        count_1h: responseSla.total,
        replied_within_sla_1h: responseSla.withinSla,
        late_replies_1h: responseSla.breachCount,
        no_reply_1h: responseSla.timeoutCount,
        issue_samples: rawIssueSamples.map((sample) => {
          const session = issueSessionByPhoneKey.get(normalizePhoneKey(sample?.phone));
          const sessionStatus = String(session?.status || "").toLowerCase() || null;
          const isAgentFlow = ["handoff", "pending", "resolved", "closed"].includes(sessionStatus);
          return {
          phone: sample.phone,
          issue_type: sample.issue_type,
          inbound_ist: formatIstTime(sample.inbound_at),
          outbound_ist: formatIstTime(sample.outbound_at),
          response_delay_seconds: sample.response_delay_ms == null ? null : Math.round(sample.response_delay_ms / 1000),
          inbound_text: sample.inbound_text,
          chat_session_status: session?.status || null,
          chat_state: session?.current_state || null,
          chat_last_message_ist: formatIstTime(session?.last_message_at || session?.updated_at),
          sent_to_agent_flow: isAgentFlow
          };
        }),
        p95_response_ms_1h: responseSla.p95Ms,
        max_response_ms_1h: responseSla.maxMs,
        last_inbound_at: responseSla.lastInboundAt,
        last_inbound_ist: formatIstTime(responseSla.lastInboundAt),
        last_inbound_minutes_ago: responseSla.lastInboundMinutesAgo
      }
    }),
    buildMetricRow({
      labId,
      checkedAt,
      serviceKey: "whatsapp_bot_help_waits_24h",
      label: "Bot Help Wait Messages",
      status: "healthy",
      message: `${waitForExecutiveCount} patient${waitForExecutiveCount === 1 ? "" : "s"} asked to wait for executive help in the last 24h`,
      payload: {
        count_24h: waitForExecutiveCount
      }
    }),
    buildMetricRow({
      labId,
      checkedAt,
      serviceKey: "whatsapp_bot_report_waits_24h",
      label: "Bot Report Wait Messages",
      status: "healthy",
      message: `${reportWaitCount} patient${reportWaitCount === 1 ? "" : "s"} told to wait for report verification in the last 24h`,
      payload: {
        count_24h: reportWaitCount
      }
    })
  ];
}

function canAccessCto(user) {
  return user?.userType === "executive" && (user?.executiveType || "").toLowerCase() === "director";
}

function parseIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseRecentRunAt(row = {}) {
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
  const candidates = [
    payload.last_success_at,
    payload.last_run_at,
    payload.last_completed_at,
    payload.last_healthy_at,
    payload.last_ok_at,
    payload.last_check_at,
    payload.last_exit_at,
    payload.last_started_at,
    payload.last_start_at,
    payload.last_seen_at,
    payload.last_seen_alive_at,
    payload.last_ping_ok_at,
    payload.last_success_ist,
    row?.checked_at,
    row?.updated_at
  ];
  for (const value of candidates) {
    const parsed = parseIsoDate(value);
    if (parsed) return parsed;
  }
  return null;
}

function isRunOnceService(row) {
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
  const key = String(row?.service_key || "").toLowerCase();

  const explicitFlags = [
    payload.run_once,
    payload.is_run_once,
    payload.is_scheduled_job
  ].some((value) => value === true);

  const modeFields = [
    payload.run_mode,
    payload.schedule_mode,
    payload.schedule_type,
    payload.execution_mode,
    payload.process_mode,
    payload.service_mode,
    payload.kind
  ]
    .map((value) => String(value || "").toLowerCase())
    .filter(Boolean);

  const modeHint = modeFields.some((value) =>
    ["once", "daily", "cron", "scheduled", "oneshot", "one_shot", "batch"].some((hint) =>
      value.includes(hint)
    )
  );

  const keyHint = ["digest", "compact", "cron", "scheduler", "backfill", "cleanup", "ops-cleanup"].some((hint) =>
    key.includes(hint)
  );

  return explicitFlags || modeHint || keyHint;
}

function isStoppedLike(row) {
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
  const states = [
    payload.pm2_status,
    payload.process_status,
    payload.process_state,
    payload.status
  ]
    .map((value) => String(value || "").toLowerCase())
    .filter(Boolean);

  const stateHint = states.some((value) =>
    ["stopped", "stop", "exited", "idle"].some((hint) => value.includes(hint))
  );
  if (stateHint) return true;

  const message = String(row?.message || "").toLowerCase();
  return message.includes("stopped") || message.includes("exited");
}

function isOnlineLike(row) {
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
  const states = [
    payload.pm2_status,
    payload.process_status,
    payload.process_state,
    payload.status,
    payload.state
  ]
    .map((value) => String(value || "").toLowerCase())
    .filter(Boolean);

  return states.some((value) =>
    ["online", "running", "up", "active", "healthy"].some((hint) => value.includes(hint))
  );
}

function isPm2ManagedService(row) {
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
  const key = String(row?.service_key || "").toLowerCase();
  if (key.startsWith("pm2_")) return true;
  return [payload.pm2_status, payload.pm2_id, payload.pm2_name].some((value) => value != null);
}

function parseRestartAt(row = {}) {
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
  const candidates = [
    payload.last_restart_at,
    payload.last_start_at,
    payload.last_started_at,
    payload.started_at,
    payload.last_boot_at
  ];
  for (const value of candidates) {
    const parsed = parseIsoDate(value);
    if (parsed) return parsed;
  }
  return null;
}

function normalizeServiceStatus(row, nowMs = Date.now()) {
  const status = String(row?.status || "").trim().toLowerCase() || "unknown";
  const runAt = parseRecentRunAt(row);
  const ranWithin24h = runAt ? nowMs - runAt.getTime() <= 24 * 60 * 60 * 1000 : false;
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
  const key = String(row?.service_key || "").toLowerCase();
  const runAgeMs = runAt ? nowMs - runAt.getTime() : null;
  const isFreshRun = Number.isFinite(runAgeMs) && runAgeMs <= 10 * 60 * 1000;
  const restartAt = parseRestartAt(row);
  const restartAgeMs = restartAt ? nowMs - restartAt.getTime() : null;
  const restartedRecently = Number.isFinite(restartAgeMs) && restartAgeMs <= 15 * 60 * 1000;
  const onlineNow = isOnlineLike(row);
  const isPm2 = isPm2ManagedService(row);

  // Realtime is optional in many deployments; do not raise scary degradation unless explicitly required.
  if (key.includes("supabase_realtime")) {
    const isRequired = [payload.required, payload.realtime_required, payload.monitor_required].some((v) => v === true);
    if (!isRequired && ["down", "degraded", "unknown"].includes(status)) {
      return {
        ...row,
        status: "healthy",
        message: row?.message || "Supabase Realtime is optional/unused for this deployment."
      };
    }
  }

  // PM2-managed services: controlled restarts should not show as hard-down.
  if (isPm2 && ["down", "degraded", "unknown"].includes(status)) {
    if (onlineNow && isFreshRun) {
      return {
        ...row,
        status: "healthy",
        message:
          row?.message ||
          "Process is online and recently checked after restart/hotfix."
      };
    }
    if (restartedRecently) {
      return {
        ...row,
        status: "degraded",
        message:
          row?.message ||
          "Recent controlled restart detected; monitoring stabilization window."
      };
    }
  }

  // For one-shot scheduled jobs, PM2 "stopped" after a successful recent run is expected.
  if (
    isRunOnceService(row) &&
    isStoppedLike(row) &&
    ranWithin24h &&
    ["unknown", "degraded", "down"].includes(status)
  ) {
    return {
      ...row,
      status: "healthy",
      message:
        row?.message ||
        `Scheduled run completed recently (${runAt.toISOString()}); idle/stopped is expected for one-shot service.`
    };
  }

  // Treat all unknown states as degraded for operator clarity.
  if (status === "unknown") {
    return {
      ...row,
      status: "degraded",
      message: row?.message || "Status unknown; treated as degraded"
    };
  }

  return row;
}

function getIstDayKey(value) {
  const parsed = parseIsoDate(value);
  if (!parsed) return null;
  return IST_DAY_FORMATTER.format(parsed);
}

function hoursAgoIso(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function isLikelyDispatchErrorText(text = "") {
  const value = String(text || "").toLowerCase();
  return (
    value.includes("jsondecodeerror") ||
    value.includes("traceback") ||
    value.includes("httperror") ||
    value.includes("error:") ||
    value.includes("exception")
  );
}

async function loadAutoDispatchMetrics(labId) {
  const checkedAt = new Date().toISOString();
  const queueLagMinutes = 30;
  const waitHours = 6;
  const cooloffHours = 2;
  const failSpikeThreshold = 10;
  const missingProviderIdThreshold = 5;

  let jobsQuery = supabase
    .from("report_auto_dispatch_jobs")
    .select("id,lab_id,reqno,status,is_paused,next_attempt_at,scheduled_at,sent_at,updated_at,provider_response")
    .in("status", ["queued", "cooling_off", "sent"])
    .order("updated_at", { ascending: false })
    .limit(1200);

  let eventsQuery = supabase
    .from("report_auto_dispatch_events")
    .select("id,job_id,reqno,event_type,message,created_at")
    .order("created_at", { ascending: false })
    .limit(5000);

  let dispatchLogsQuery = supabase
    .from("report_dispatch_logs")
    .select("id,status,result_code,provider_message_id,created_at")
    .gte("created_at", hoursAgoIso(1))
    .order("created_at", { ascending: false })
    .limit(3000);

  let ctoLogsQuery = supabase
    .from("cto_service_logs")
    .select("service_key,status,message,created_at,payload")
    .in("service_key", ["report-sender", "report-enqueue-watch"])
    .gte("created_at", hoursAgoIso(2))
    .order("created_at", { ascending: false })
    .limit(500);

  if (labId) {
    jobsQuery = jobsQuery.eq("lab_id", labId);
    eventsQuery = eventsQuery.eq("lab_id", labId);
    dispatchLogsQuery = dispatchLogsQuery.eq("lab_id", labId);
    ctoLogsQuery = ctoLogsQuery.eq("lab_id", labId);
  }

  const [{ data: jobs, error: jobsError }, { data: events, error: eventsError }, { data: dispatchLogs, error: dispatchError }, { data: ctoLogs, error: ctoLogsError }] =
    await Promise.all([jobsQuery, eventsQuery, dispatchLogsQuery, ctoLogsQuery]);

  if (jobsError) throw jobsError;
  if (eventsError) throw eventsError;
  if (dispatchError) throw dispatchError;
  if (ctoLogsError) throw ctoLogsError;

  const jobsList = Array.isArray(jobs) ? jobs : [];
  const eventsList = Array.isArray(events) ? events : [];
  const logsList = Array.isArray(dispatchLogs) ? dispatchLogs : [];
  const ctoLogList = Array.isArray(ctoLogs) ? ctoLogs : [];

  const latestEventByJobId = new Map();
  for (const ev of eventsList) {
    if (!ev?.job_id || latestEventByJobId.has(ev.job_id)) continue;
    latestEventByJobId.set(ev.job_id, ev);
  }

  const nowMs = Date.now();
  const dueLagMs = queueLagMinutes * 60 * 1000;
  const overdueQueued = jobsList.filter((job) => {
    if (job?.status !== "queued" || job?.is_paused) return false;
    const nextAt = parseIsoDate(job?.next_attempt_at);
    return nextAt ? nowMs - nextAt.getTime() > dueLagMs : false;
  });

  const staleWait = jobsList.filter((job) => {
    if (job?.sent_at || job?.is_paused) return false;
    const latest = latestEventByJobId.get(job?.id);
    if (!latest) return false;
    const eventType = String(latest?.event_type || "").toLowerCase();
    const createdAt = parseIsoDate(latest?.created_at);
    if (!createdAt) return false;
    const ageHours = (nowMs - createdAt.getTime()) / (60 * 60 * 1000);
    if (eventType === "queued_wait") return ageHours >= waitHours;
    if (eventType === "cooling_off") return ageHours >= cooloffHours;
    return false;
  });

  const sentStatusDrift = jobsList.filter((job) => {
    const latest = latestEventByJobId.get(job?.id);
    if (!latest) return false;
    const eventType = String(latest?.event_type || "").toLowerCase();
    return eventType === "sent" && String(job?.status || "").toLowerCase() !== "sent";
  });

  const failed15m = logsList.filter((row) => {
    if (String(row?.status || "").toLowerCase() !== "failed") return false;
    const createdAt = parseIsoDate(row?.created_at);
    return createdAt ? nowMs - createdAt.getTime() <= 15 * 60 * 1000 : false;
  });
  const missingProvider15m = logsList.filter((row) => {
    const createdAt = parseIsoDate(row?.created_at);
    if (!(createdAt && nowMs - createdAt.getTime() <= 15 * 60 * 1000)) return false;
    return !String(row?.provider_message_id || "").trim();
  });

  const hardWorkerErrors = ctoLogList.filter((row) => {
    const status = String(row?.status || "").toLowerCase();
    const message = String(row?.message || "");
    return status === "down" || status === "degraded" || isLikelyDispatchErrorText(message);
  });

  const rows = [];
  rows.push(
    buildMetricRow({
      labId,
      checkedAt,
      serviceKey: "auto_dispatch_queue_stall",
      label: "Auto Dispatch Queue Stall",
      status: overdueQueued.length > 0 ? "down" : "healthy",
      message:
        overdueQueued.length > 0
          ? `${overdueQueued.length} queued jobs are overdue by > ${queueLagMinutes}m`
          : `No queued jobs overdue by > ${queueLagMinutes}m`,
      payload: {
        overdue_count: overdueQueued.length,
        threshold_minutes: queueLagMinutes,
        samples: overdueQueued.slice(0, 20).map((j) => ({ id: j.id, reqno: j.reqno, next_attempt_at: j.next_attempt_at }))
      }
    })
  );

  rows.push(
    buildMetricRow({
      labId,
      checkedAt,
      serviceKey: "auto_dispatch_wait_state_stuck",
      label: "Auto Dispatch Wait-State Stuck",
      status: staleWait.length > 0 ? "down" : "healthy",
      message:
        staleWait.length > 0
          ? `${staleWait.length} jobs stuck in queued_wait/cooling_off beyond threshold`
          : "No stale wait-state jobs",
      payload: {
        stuck_count: staleWait.length,
        stuck_queued_wait_hours: waitHours,
        stuck_cooling_off_hours: cooloffHours,
        samples: staleWait.slice(0, 20).map((j) => {
          const ev = latestEventByJobId.get(j.id);
          return { id: j.id, reqno: j.reqno, status: j.status, latest_event: ev?.event_type || null, latest_event_at: ev?.created_at || null };
        })
      }
    })
  );

  rows.push(
    buildMetricRow({
      labId,
      checkedAt,
      serviceKey: "auto_dispatch_state_drift",
      label: "Auto Dispatch State Drift",
      status: sentStatusDrift.length > 0 ? "degraded" : "healthy",
      message:
        sentStatusDrift.length > 0
          ? `${sentStatusDrift.length} jobs have latest event=sent but status != sent`
          : "No sent-state drift detected",
      payload: {
        drift_count: sentStatusDrift.length,
        samples: sentStatusDrift.slice(0, 20).map((j) => ({ id: j.id, reqno: j.reqno, status: j.status }))
      }
    })
  );

  rows.push(
    buildMetricRow({
      labId,
      checkedAt,
      serviceKey: "auto_dispatch_failures_15m",
      label: "Auto Dispatch Failures (15m)",
      status: failed15m.length >= failSpikeThreshold ? "down" : failed15m.length > 0 ? "degraded" : "healthy",
      message: `${failed15m.length} failed dispatch logs in last 15m`,
      payload: {
        failed_15m: failed15m.length,
        threshold: failSpikeThreshold
      }
    })
  );

  rows.push(
    buildMetricRow({
      labId,
      checkedAt,
      serviceKey: "auto_dispatch_missing_provider_id_15m",
      label: "Missing Provider Message ID (15m)",
      status:
        missingProvider15m.length >= missingProviderIdThreshold
          ? "degraded"
          : "healthy",
      message: `${missingProvider15m.length} dispatch logs missing provider_message_id in last 15m`,
      payload: {
        missing_provider_id_15m: missingProvider15m.length,
        threshold: missingProviderIdThreshold
      }
    })
  );

  rows.push(
    buildMetricRow({
      labId,
      checkedAt,
      serviceKey: "auto_dispatch_worker_health",
      label: "Auto Dispatch Worker Health",
      status: hardWorkerErrors.length > 0 ? "down" : "healthy",
      message:
        hardWorkerErrors.length > 0
          ? `${hardWorkerErrors.length} worker hard-error log(s) in last 2h`
          : "No hard worker errors in last 2h",
      payload: {
        error_count: hardWorkerErrors.length,
        samples: hardWorkerErrors.slice(0, 15).map((r) => ({
          service_key: r.service_key,
          status: r.status,
          created_at: r.created_at,
          message: String(r.message || "").slice(0, 220)
        }))
      }
    })
  );

  return rows;
}

async function loadWebsiteAnalytics(labId) {
  if (!supabase) return null;
  const now = Date.now();
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since15m = new Date(now - 15 * 60 * 1000).toISOString();

  let dailyQuery = supabase
    .from("website_events")
    .select("created_at, session_id")
    .gte("created_at", since30d)
    .order("created_at", { ascending: false })
    .limit(50000);

  let topPagesQuery = supabase
    .from("website_events")
    .select("page_path, session_id")
    .gte("created_at", since7d)
    .order("created_at", { ascending: false })
    .limit(50000);

  let activeQuery = supabase
    .from("website_events")
    .select("session_id")
    .gte("created_at", since15m)
    .order("created_at", { ascending: false })
    .limit(20000);

  if (labId) {
    dailyQuery = dailyQuery.eq("lab_id", labId);
    topPagesQuery = topPagesQuery.eq("lab_id", labId);
    activeQuery = activeQuery.eq("lab_id", labId);
  }

  const [{ data: dailyRows, error: dailyError }, { data: topPageRows, error: topPageError }, { data: activeRows, error: activeError }] =
    await Promise.all([dailyQuery, topPagesQuery, activeQuery]);

  if (dailyError) throw dailyError;
  if (topPageError) throw topPageError;
  if (activeError) throw activeError;

  const dailySets = new Map();
  for (const row of dailyRows || []) {
    const day = getIstDayKey(row?.created_at);
    const sessionId = String(row?.session_id || "").trim();
    if (!day || !sessionId) continue;
    if (!dailySets.has(day)) dailySets.set(day, new Set());
    dailySets.get(day).add(sessionId);
  }

  const dailyUniqueVisitors = Array.from(dailySets.entries())
    .map(([day, set]) => ({ day, unique_visitors: set.size }))
    .sort((a, b) => String(b.day).localeCompare(String(a.day)))
    .slice(0, 30);

  const currentIstDay = getIstDayKey(new Date().toISOString());
  const uniqueVisitorsToday =
    dailyUniqueVisitors.find((row) => row.day === currentIstDay)?.unique_visitors || 0;
  const uniqueVisitors30d = Array.from(
    new Set((dailyRows || []).map((row) => String(row?.session_id || "").trim()).filter(Boolean))
  ).length;

  const uniqueVisitors7d = Array.from(
    new Set((topPageRows || []).map((row) => String(row?.session_id || "").trim()).filter(Boolean))
  ).length;

  const pageSets = new Map();
  for (const row of topPageRows || []) {
    const page = String(row?.page_path || "").trim() || "unknown";
    const sessionId = String(row?.session_id || "").trim();
    if (!sessionId) continue;
    if (!pageSets.has(page)) pageSets.set(page, new Set());
    pageSets.get(page).add(sessionId);
  }

  const topPages7d = Array.from(pageSets.entries())
    .map(([page_path, set]) => ({ page_path, unique_visitors: set.size }))
    .sort((a, b) => b.unique_visitors - a.unique_visitors)
    .slice(0, 8);

  const activeSessions15m = Array.from(
    new Set((activeRows || []).map((row) => String(row?.session_id || "").trim()).filter(Boolean))
  ).length;

  return {
    active_sessions_15m: activeSessions15m,
    unique_visitors_today: uniqueVisitorsToday,
    unique_visitors_7d: uniqueVisitors7d,
    unique_visitors_30d: uniqueVisitors30d,
    daily_unique_visitors_30d: dailyUniqueVisitors,
    top_pages_7d: topPages7d
  };
}

export async function GET(request) {
  const response = NextResponse.next();

  try {
    const session = await getIronSession(request, response, ironOptions);
    const user = session?.user;

    if (!canAccessCto(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!supabase) {
      return NextResponse.json({ error: "Supabase server client unavailable" }, { status: 500 });
    }

    const url = new URL(request.url);
    const requestedLabId = String(url.searchParams.get("lab_id") || "").trim() || null;
    const assignedLabIds = Array.isArray(user?.labIds) ? user.labIds.filter(Boolean) : [];
    const isProductCto = assignedLabIds.length === 0;

    if (!isProductCto && requestedLabId && !assignedLabIds.includes(requestedLabId)) {
      return NextResponse.json({ error: "Forbidden for requested lab" }, { status: 403 });
    }

    const labId = requestedLabId || assignedLabIds[0] || null;

    let query = supabase
      .from("cto_service_latest")
      .select("*")
      .order("category", { ascending: true })
      .order("service_key", { ascending: true });

    if (labId) {
      query = query.eq("lab_id", labId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[cto/latest] fetch error", error);
      return NextResponse.json({ error: "Failed to load latest service status" }, { status: 500 });
    }

    const rows = data || [];
    let whatsappMetrics = [];
    let autoDispatchMetrics = [];
    let websiteAnalytics = null;

    try {
      whatsappMetrics = await loadWhatsappBotMetrics(labId);
    } catch (metricError) {
      console.error("[cto/latest] whatsapp metrics error", metricError);
    }
    try {
      autoDispatchMetrics = await loadAutoDispatchMetrics(labId);
    } catch (dispatchMetricError) {
      console.error("[cto/latest] auto dispatch metrics error", dispatchMetricError);
    }

    try {
      websiteAnalytics = await loadWebsiteAnalytics(labId);
    } catch (analyticsError) {
      console.error("[cto/latest] website analytics error", analyticsError);
    }

    const nowMs = Date.now();
    const combinedRows = [...rows, ...whatsappMetrics, ...autoDispatchMetrics].map((row) => normalizeServiceStatus(row, nowMs));
    const summary = combinedRows.reduce(
      (acc, row) => {
        acc.total += 1;
        acc[row.status] = (acc[row.status] || 0) + 1;
        return acc;
      },
      { total: 0, healthy: 0, degraded: 0, down: 0, unknown: 0 }
    );

    return NextResponse.json(
      {
        lab_id: labId,
        is_product_cto: isProductCto,
        allowed_lab_ids: isProductCto ? null : assignedLabIds,
        summary,
        services: combinedRows,
        website_analytics: websiteAnalytics,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("[cto/latest] unexpected error", error);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
