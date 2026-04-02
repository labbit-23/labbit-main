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

    try {
      whatsappMetrics = await loadWhatsappBotMetrics(labId);
    } catch (metricError) {
      console.error("[cto/latest] whatsapp metrics error", metricError);
    }

    const combinedRows = [...rows, ...whatsappMetrics];
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
