import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";

const RANGE_PRESETS = {
  "7d": { days: 7, granularity: "day" },
  "30d": { days: 30, granularity: "day" },
  "12w": { days: 84, granularity: "week" },
  "12m": { days: 365, granularity: "month" }
};

const MAX_RAW_ROWS = 25000;
const RECENT_RAW_DAYS = 2;

function canAccessCto(user) {
  return user?.userType === "executive" && (user?.executiveType || "").toLowerCase() === "director";
}

function parseRangePreset(value) {
  return RANGE_PRESETS[String(value || "30d").toLowerCase()] || RANGE_PRESETS["30d"];
}

function startOfUtcDay(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatDayKey(date) {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

function weekStartKey(date) {
  const dayStart = startOfUtcDay(date);
  const dayOfWeek = dayStart.getUTCDay();
  const shift = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday start
  return formatDayKey(addUtcDays(dayStart, shift));
}

function monthKey(date) {
  const d = startOfUtcDay(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function bucketKeyFromDate(date, granularity) {
  if (granularity === "week") return weekStartKey(date);
  if (granularity === "month") return monthKey(date);
  return formatDayKey(date);
}

function bucketLabelFromKey(key, granularity) {
  if (granularity === "month") return key;
  const parsed = new Date(`${key}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return key;
  if (granularity === "week") {
    const end = addUtcDays(parsed, 6);
    return `${parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" })} - ${end.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" })}`;
  }
  return parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
}

function isMissingRelationError(error) {
  const message = String(error?.message || "").toLowerCase();
  return String(error?.code || "") === "42P01" || message.includes("does not exist");
}

function initializeBucket() {
  return {
    total_checks: 0,
    healthy_count: 0,
    degraded_count: 0,
    down_count: 0,
    unknown_count: 0,
    latency_sum: 0,
    latency_sample_count: 0,
    max_latency_ms: null,
    p95_latency_ms: null,
    status_transitions: 0,
    last_status: null
  };
}

function mergeSummary(target, source) {
  target.total_checks += source.total_checks || 0;
  target.healthy_count += source.healthy_count || 0;
  target.degraded_count += source.degraded_count || 0;
  target.down_count += source.down_count || 0;
  target.unknown_count += source.unknown_count || 0;
  target.latency_sum += source.latency_sum || 0;
  target.latency_sample_count += source.latency_sample_count || 0;
  target.status_transitions += source.status_transitions || 0;

  if (typeof source.max_latency_ms === "number") {
    target.max_latency_ms = target.max_latency_ms == null ? source.max_latency_ms : Math.max(target.max_latency_ms, source.max_latency_ms);
  }

  if (typeof source.p95_latency_ms === "number") {
    target.p95_latency_ms = target.p95_latency_ms == null ? source.p95_latency_ms : Math.max(target.p95_latency_ms, source.p95_latency_ms);
  }

  if (source.last_status) {
    target.last_status = source.last_status;
  }
}

function finalizeBucket(key, granularity, summary) {
  const avgLatency =
    summary.latency_sample_count > 0 ? Number((summary.latency_sum / summary.latency_sample_count).toFixed(2)) : null;
  const healthyRate = summary.total_checks > 0 ? Number((summary.healthy_count / summary.total_checks).toFixed(4)) : null;
  const downRate = summary.total_checks > 0 ? Number((summary.down_count / summary.total_checks).toFixed(4)) : null;

  return {
    bucket_key: key,
    bucket_label: bucketLabelFromKey(key, granularity),
    total_checks: summary.total_checks,
    healthy_count: summary.healthy_count,
    degraded_count: summary.degraded_count,
    down_count: summary.down_count,
    unknown_count: summary.unknown_count,
    healthy_rate: healthyRate,
    down_rate: downRate,
    avg_latency_ms: avgLatency,
    max_latency_ms: summary.max_latency_ms,
    p95_latency_ms: summary.p95_latency_ms,
    status_transitions: summary.status_transitions,
    last_status: summary.last_status
  };
}

function buildPointsFromDailyMap(dailyMap, granularity) {
  const bucketMap = new Map();

  for (const [dayKey, daySummary] of dailyMap.entries()) {
    const key = granularity === "day" ? dayKey : bucketKeyFromDate(new Date(`${dayKey}T00:00:00.000Z`), granularity);
    const current = bucketMap.get(key) || initializeBucket();
    mergeSummary(current, daySummary);
    bucketMap.set(key, current);
  }

  return [...bucketMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, summary]) => finalizeBucket(key, granularity, summary));
}

function parseServiceKey(serviceKey = "") {
  const normalized = String(serviceKey || "").trim().toLowerCase();
  const parts = normalized.split("__");
  const baseKey = parts[0] || "";
  return { normalized, baseKey };
}

function domainForServiceKey(serviceKey = "") {
  const { baseKey } = parseServiceKey(serviceKey);
  if (baseKey.startsWith("whatsapp_bot_")) return "WhatsApp Chatbot";
  if (baseKey === "supabase_main") return "Database";
  if (
    baseKey === "orthanc_main" ||
    baseKey.startsWith("mirth_") ||
    baseKey === "tailscale_mirth"
  ) {
    return "Machine Interfacing";
  }
  if (baseKey.startsWith("tomcat_")) return "App Servers";
  if (baseKey === "labbit_health") return "Core Platform";
  return "Other";
}

function nodeGroupForServiceKey(serviceKey = "") {
  const normalized = String(serviceKey || "").trim().toLowerCase();
  if (normalized.endsWith("__vps")) return "VPS";
  if (normalized.endsWith("__local")) return "Local";
  return "Unspecified";
}

function matchesNodeRole(serviceKey = "", nodeRole = "") {
  if (!nodeRole) return true;
  const normalized = String(serviceKey || "").trim().toLowerCase();
  return normalized.endsWith(`__${nodeRole}`);
}

function aggregateDigestRowsToServiceDay(rows, serviceKeyFilter = "", nodeRoleFilter = "") {
  const byServiceDay = new Map();

  for (const row of rows || []) {
    if (!row?.day_date || !row?.service_key) continue;
    if (serviceKeyFilter && row.service_key !== serviceKeyFilter) continue;
    if (!matchesNodeRole(row.service_key, nodeRoleFilter)) continue;
    const dayKey = String(row.day_date).slice(0, 10);
    const serviceKey = String(row.service_key);
    const composedKey = `${serviceKey}::${dayKey}`;

    const entry = byServiceDay.get(composedKey) || initializeBucket();
    mergeSummary(entry, {
      total_checks: row.total_checks || 0,
      healthy_count: row.healthy_count || 0,
      degraded_count: row.degraded_count || 0,
      down_count: row.down_count || 0,
      unknown_count: row.unknown_count || 0,
      latency_sum: Number(row.avg_latency_ms || 0) * Number(row.latency_sample_count || 0),
      latency_sample_count: row.latency_sample_count || 0,
      max_latency_ms: row.max_latency_ms,
      p95_latency_ms: row.p95_latency_ms,
      status_transitions: row.status_transitions || 0,
      last_status: row.last_status
    });
    byServiceDay.set(composedKey, entry);
  }

  return byServiceDay;
}

function aggregateRawRowsToServiceDay(rows, serviceKeyFilter = "", nodeRoleFilter = "") {
  const byServiceDay = new Map();
  const latenciesByServiceDay = new Map();

  for (const row of rows || []) {
    if (!row?.checked_at || !row?.service_key) continue;
    if (serviceKeyFilter && row.service_key !== serviceKeyFilter) continue;
    if (!matchesNodeRole(row.service_key, nodeRoleFilter)) continue;

    const dayKey = formatDayKey(row.checked_at);
    const serviceKey = String(row.service_key);
    const composedKey = `${serviceKey}::${dayKey}`;
    const entry = byServiceDay.get(composedKey) || initializeBucket();

    entry.total_checks += 1;
    const status = String(row.status || "unknown");
    if (status === "healthy") entry.healthy_count += 1;
    else if (status === "degraded") entry.degraded_count += 1;
    else if (status === "down") entry.down_count += 1;
    else entry.unknown_count += 1;

    if (typeof row.latency_ms === "number" && Number.isFinite(row.latency_ms)) {
      entry.latency_sum += row.latency_ms;
      entry.latency_sample_count += 1;
      entry.max_latency_ms = entry.max_latency_ms == null ? row.latency_ms : Math.max(entry.max_latency_ms, row.latency_ms);
      const list = latenciesByServiceDay.get(composedKey) || [];
      list.push(row.latency_ms);
      latenciesByServiceDay.set(composedKey, list);
    }

    entry.last_status = status;
    byServiceDay.set(composedKey, entry);
  }

  for (const [composedKey, list] of latenciesByServiceDay.entries()) {
    if (!list.length) continue;
    list.sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(list.length - 1, Math.ceil(list.length * 0.95) - 1));
    const entry = byServiceDay.get(composedKey);
    if (entry) entry.p95_latency_ms = list[idx];
  }

  return byServiceDay;
}

function buildSummary(points = []) {
  const summary = points.reduce(
    (acc, point) => {
      acc.total_checks += point.total_checks || 0;
      acc.healthy_count += point.healthy_count || 0;
      acc.degraded_count += point.degraded_count || 0;
      acc.down_count += point.down_count || 0;
      acc.unknown_count += point.unknown_count || 0;
      acc.status_transitions += point.status_transitions || 0;
      if (typeof point.avg_latency_ms === "number") {
        acc.avg_latency_sum += point.avg_latency_ms;
        acc.avg_latency_points += 1;
      }
      if (typeof point.max_latency_ms === "number") {
        acc.max_latency_ms = acc.max_latency_ms == null ? point.max_latency_ms : Math.max(acc.max_latency_ms, point.max_latency_ms);
      }
      return acc;
    },
    {
      total_checks: 0,
      healthy_count: 0,
      degraded_count: 0,
      down_count: 0,
      unknown_count: 0,
      status_transitions: 0,
      max_latency_ms: null,
      avg_latency_sum: 0,
      avg_latency_points: 0
    }
  );

  return {
    total_checks: summary.total_checks,
    healthy_count: summary.healthy_count,
    degraded_count: summary.degraded_count,
    down_count: summary.down_count,
    unknown_count: summary.unknown_count,
    status_transitions: summary.status_transitions,
    healthy_rate: summary.total_checks > 0 ? Number((summary.healthy_count / summary.total_checks).toFixed(4)) : null,
    down_rate: summary.total_checks > 0 ? Number((summary.down_count / summary.total_checks).toFixed(4)) : null,
    avg_latency_ms: summary.avg_latency_points > 0 ? Number((summary.avg_latency_sum / summary.avg_latency_points).toFixed(2)) : null,
    max_latency_ms: summary.max_latency_ms
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
    const serviceKey = String(url.searchParams.get("service_key") || "").trim();
    const nodeRole = String(url.searchParams.get("node_role") || "").trim().toLowerCase();
    const nodeRoleFilter = ["vps", "local"].includes(nodeRole) ? nodeRole : "";
    const rangeInput = String(url.searchParams.get("range") || "30d").trim().toLowerCase();
    const preset = parseRangePreset(rangeInput);
    const granularity = String(url.searchParams.get("bucket") || preset.granularity).trim().toLowerCase();

    const nowDay = startOfUtcDay(new Date());
    const startDay = addUtcDays(nowDay, -(preset.days - 1));
    const endExclusive = addUtcDays(nowDay, 1);

    let digestRows = [];
    let digestAvailable = true;

    let digestQuery = supabase
      .from("cto_service_daily_digest")
      .select("day_date, service_key, total_checks, healthy_count, degraded_count, down_count, unknown_count, avg_latency_ms, latency_sample_count, max_latency_ms, p95_latency_ms, status_transitions, last_status")
      .gte("day_date", formatDayKey(startDay))
      .lt("day_date", formatDayKey(endExclusive))
      .order("day_date", { ascending: true })
      .limit(12000);

    if (labId) digestQuery = digestQuery.eq("lab_id", labId);
    if (serviceKey) digestQuery = digestQuery.eq("service_key", serviceKey);

    const { data: digestData, error: digestError } = await digestQuery;

    if (digestError) {
      if (isMissingRelationError(digestError)) {
        digestAvailable = false;
      } else {
        console.error("[cto/trends] digest query failed", digestError);
        return NextResponse.json({ error: "Failed to load trend digest" }, { status: 500 });
      }
    } else {
      digestRows = Array.isArray(digestData) ? digestData : [];
    }

    const hasDigestRows = digestAvailable && digestRows.length > 0;
    const rawWindowStart = hasDigestRows
      ? addUtcDays(nowDay, -RECENT_RAW_DAYS)
      : startDay;
    const effectiveRawStart = rawWindowStart > startDay ? rawWindowStart : startDay;

    const rawAscending = hasDigestRows;

    let rawQuery = supabase
      .from("cto_service_logs")
      .select("checked_at, service_key, status, latency_ms")
      .gte("checked_at", effectiveRawStart.toISOString())
      .lt("checked_at", endExclusive.toISOString())
      .order("checked_at", { ascending: rawAscending })
      .limit(MAX_RAW_ROWS);

    if (labId) rawQuery = rawQuery.eq("lab_id", labId);
    if (serviceKey) rawQuery = rawQuery.eq("service_key", serviceKey);

    const { data: rawData, error: rawError } = await rawQuery;

    if (rawError) {
      console.error("[cto/trends] raw query failed", rawError);
      return NextResponse.json({ error: "Failed to load trend logs" }, { status: 500 });
    }

    const rawRows = Array.isArray(rawData) ? rawData : [];
    const digestServiceDay = aggregateDigestRowsToServiceDay(digestRows, serviceKey, nodeRoleFilter);
    const rawServiceDay = aggregateRawRowsToServiceDay(rawRows, serviceKey, nodeRoleFilter);

    // Raw rows override same-day service digest rows to keep in-progress windows accurate.
    const mergedServiceDay = new Map(digestServiceDay);
    for (const [serviceDayKey, summary] of rawServiceDay.entries()) {
      mergedServiceDay.set(serviceDayKey, summary);
    }

    const mergedDailyMap = new Map();
    const domainDailyMap = new Map();
    const nodeDailyMap = new Map();
    for (const [serviceDayKey, summary] of mergedServiceDay.entries()) {
      const [serviceKeyFromRow, dayKey] = String(serviceDayKey).split("::");
      if (!serviceKeyFromRow || !dayKey) continue;

      const daySummary = mergedDailyMap.get(dayKey) || initializeBucket();
      mergeSummary(daySummary, summary);
      mergedDailyMap.set(dayKey, daySummary);

      const domainKey = domainForServiceKey(serviceKeyFromRow);
      const domainMap = domainDailyMap.get(domainKey) || new Map();
      const domainDaySummary = domainMap.get(dayKey) || initializeBucket();
      mergeSummary(domainDaySummary, summary);
      domainMap.set(dayKey, domainDaySummary);
      domainDailyMap.set(domainKey, domainMap);

      const nodeKey = nodeGroupForServiceKey(serviceKeyFromRow);
      const nodeMap = nodeDailyMap.get(nodeKey) || new Map();
      const nodeDaySummary = nodeMap.get(dayKey) || initializeBucket();
      mergeSummary(nodeDaySummary, summary);
      nodeMap.set(dayKey, nodeDaySummary);
      nodeDailyMap.set(nodeKey, nodeMap);
    }

    const bucketType = ["day", "week", "month"].includes(granularity) ? granularity : preset.granularity;
    const points = buildPointsFromDailyMap(mergedDailyMap, bucketType);
    const domainBreakdown = serviceKey
      ? []
      : [...domainDailyMap.entries()]
          .map(([domain, dailyMap]) => {
            const domainPoints = buildPointsFromDailyMap(dailyMap, bucketType);
            return {
              domain,
              points: domainPoints,
              summary: buildSummary(domainPoints)
            };
          })
          .sort((a, b) => Number(b?.summary?.total_checks || 0) - Number(a?.summary?.total_checks || 0))
          .slice(0, 8);
    const nodeBreakdown = serviceKey
      ? []
      : [...nodeDailyMap.entries()]
          .map(([node, dailyMap]) => {
            const nodePoints = buildPointsFromDailyMap(dailyMap, bucketType);
            return {
              node,
              points: nodePoints,
              summary: buildSummary(nodePoints)
            };
          })
          .sort((a, b) => Number(b?.summary?.total_checks || 0) - Number(a?.summary?.total_checks || 0));

    return NextResponse.json(
      {
        lab_id: labId,
        service_key: serviceKey || null,
        node_role: nodeRoleFilter || null,
        range: rangeInput,
        bucket: bucketType,
        points,
        domain_breakdown: domainBreakdown,
        node_breakdown: nodeBreakdown,
        summary: buildSummary(points),
        source: {
          digest_available: digestAvailable,
          digest_has_rows: hasDigestRows,
          digest_rows: digestRows.length,
          raw_rows: rawRows.length,
          raw_order: rawAscending ? "asc" : "desc",
          raw_window_start: effectiveRawStart.toISOString(),
          raw_window_days: Math.round((endExclusive.getTime() - effectiveRawStart.getTime()) / (24 * 60 * 60 * 1000)),
          raw_truncated: rawRows.length >= MAX_RAW_ROWS
        }
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0"
        }
      }
    );
  } catch (error) {
    console.error("[cto/trends] unexpected error", error);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
