import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";

const RANGE_PRESETS = {
  today: { days: 1, granularity: "hour" },
  "24h": { days: 1, granularity: "hour" },
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
  return RANGE_PRESETS[String(value || "24h").toLowerCase()] || RANGE_PRESETS["24h"];
}

function startOfUtcDay(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfIstDay(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const shifted = new Date(date.getTime() + istOffsetMs);
  const istMidnightUtcMs = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    0, 0, 0, 0
  ) - istOffsetMs;
  return new Date(istMidnightUtcMs);
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

function hourKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:00`;
}

function bucketKeyFromDate(date, granularity) {
  if (granularity === "hour") return hourKey(date);
  if (granularity === "week") return weekStartKey(date);
  if (granularity === "month") return monthKey(date);
  return formatDayKey(date);
}

function bucketLabelFromKey(key, granularity) {
  if (granularity === "hour") {
    const parsed = new Date(String(key).replace(" ", "T") + ":00.000Z");
    if (Number.isNaN(parsed.getTime())) return key;
    const day = parsed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
    const time = parsed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
    return `${day} ${time}`;
  }
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

function extractPayloadMetric(payload, keys = []) {
  if (!payload || typeof payload !== "object") return null;
  for (const key of keys) {
    const value = payload[key];
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function initializeHostBucket() {
  return {
    samples: 0,
    memory_sum: 0,
    memory_count: 0,
    disk_sum: 0,
    disk_count: 0,
    swap_sum: 0,
    swap_count: 0,
    load_sum: 0,
    load_count: 0,
    load_per_core_sum: 0,
    load_per_core_count: 0
  };
}

function finalizeHostBucket(key, granularity, bucket) {
  const avg = (sum, count) => (count > 0 ? Number((sum / count).toFixed(2)) : null);
  return {
    bucket_key: key,
    bucket_label: bucketLabelFromKey(key, granularity),
    samples: bucket.samples,
    host_memory_pct: avg(bucket.memory_sum, bucket.memory_count),
    host_disk_pct: avg(bucket.disk_sum, bucket.disk_count),
    host_swap_pct: avg(bucket.swap_sum, bucket.swap_count),
    host_load_1: avg(bucket.load_sum, bucket.load_count),
    host_load_per_core_pct: avg(bucket.load_per_core_sum, bucket.load_per_core_count)
  };
}

function buildHostPointsFromRawRows(rows, granularity, serviceKeyFilter = "", nodeRoleFilter = "") {
  const bucketMap = new Map();

  for (const row of rows || []) {
    if (!row?.checked_at || !row?.service_key) continue;
    if (serviceKeyFilter && row.service_key !== serviceKeyFilter) continue;
    if (!matchesNodeRole(row.service_key, nodeRoleFilter)) continue;

    const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
    const memory = extractPayloadMetric(payload, ["memory_pct", "mem_pct", "memory_percent", "ram_used_pct"]);
    const disk = extractPayloadMetric(payload, ["disk_pct", "disk_used_pct", "disk_percent", "root_disk_pct"]);
    const swap = extractPayloadMetric(payload, ["swap_pct", "swap_used_pct", "swap_percent"]);
    const load1 = extractPayloadMetric(payload, ["load_1", "load1", "loadavg_1"]);
    const loadPerCore = extractPayloadMetric(payload, ["load_1_per_core_pct", "load_per_core_pct"]);

    if (
      !Number.isFinite(memory) &&
      !Number.isFinite(disk) &&
      !Number.isFinite(swap) &&
      !Number.isFinite(load1) &&
      !Number.isFinite(loadPerCore)
    ) {
      continue;
    }

    const checkedAt = new Date(row.checked_at);
    if (Number.isNaN(checkedAt.getTime())) continue;
    const key = bucketKeyFromDate(checkedAt, granularity);
    if (!key) continue;
    const bucket = bucketMap.get(key) || initializeHostBucket();
    bucket.samples += 1;
    if (Number.isFinite(memory)) {
      bucket.memory_sum += memory;
      bucket.memory_count += 1;
    }
    if (Number.isFinite(disk)) {
      bucket.disk_sum += disk;
      bucket.disk_count += 1;
    }
    if (Number.isFinite(swap)) {
      bucket.swap_sum += swap;
      bucket.swap_count += 1;
    }
    if (Number.isFinite(load1)) {
      bucket.load_sum += load1;
      bucket.load_count += 1;
    }
    if (Number.isFinite(loadPerCore)) {
      bucket.load_per_core_sum += loadPerCore;
      bucket.load_per_core_count += 1;
    }
    bucketMap.set(key, bucket);
  }

  return [...bucketMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, bucket]) => finalizeHostBucket(key, granularity, bucket));
}

function buildHostPointsFromDigestRows(rows, granularity, serviceKeyFilter = "", nodeRoleFilter = "") {
  const bucketMap = new Map();
  const toNum = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  for (const row of rows || []) {
    if (!row?.day_date || !row?.service_key) continue;
    if (serviceKeyFilter && row.service_key !== serviceKeyFilter) continue;
    if (!matchesNodeRole(row.service_key, nodeRoleFilter)) continue;

    const dayStart = new Date(`${String(row.day_date).slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(dayStart.getTime())) continue;
    const key = bucketKeyFromDate(dayStart, granularity);
    if (!key) continue;

    const metricSamples = toNum(row.host_metric_samples) || 0;
    const memoryAvg = toNum(row.host_memory_avg_pct);
    const diskAvg = toNum(row.host_disk_avg_pct);
    const swapAvg = toNum(row.host_swap_avg_pct);
    const load1Avg = toNum(row.host_load1_avg);
    const loadPerCoreAvg = toNum(row.host_load_per_core_avg_pct);
    const hasMetric =
      memoryAvg != null || diskAvg != null || swapAvg != null || load1Avg != null || loadPerCoreAvg != null;
    if (!hasMetric) continue;

    const bucket = bucketMap.get(key) || initializeHostBucket();
    bucket.samples += metricSamples > 0 ? metricSamples : 1;

    const weight = metricSamples > 0 ? metricSamples : 1;
    if (memoryAvg != null) {
      bucket.memory_sum += memoryAvg * weight;
      bucket.memory_count += weight;
    }
    if (diskAvg != null) {
      bucket.disk_sum += diskAvg * weight;
      bucket.disk_count += weight;
    }
    if (swapAvg != null) {
      bucket.swap_sum += swapAvg * weight;
      bucket.swap_count += weight;
    }
    if (load1Avg != null) {
      bucket.load_sum += load1Avg * weight;
      bucket.load_count += weight;
    }
    if (loadPerCoreAvg != null) {
      bucket.load_per_core_sum += loadPerCoreAvg * weight;
      bucket.load_per_core_count += weight;
    }
    bucketMap.set(key, bucket);
  }

  return [...bucketMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, bucket]) => finalizeHostBucket(key, granularity, bucket));
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
    const key = granularity === "hour"
      ? dayKey
      : granularity === "day"
        ? dayKey
        : bucketKeyFromDate(new Date(`${dayKey}T00:00:00.000Z`), granularity);
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
  if (
    normalized.startsWith("vps_host") ||
    normalized.startsWith("pm2_") ||
    normalized.startsWith("docker_") ||
    normalized.startsWith("tailscale_")
  ) {
    return "VPS";
  }
  return "Unspecified";
}

function matchesNodeRole(serviceKey = "", nodeRole = "") {
  if (!nodeRole) return true;
  const normalized = String(serviceKey || "").trim().toLowerCase();
  if (normalized.endsWith(`__${nodeRole}`)) return true;

  // Backward compatibility for older collector keys that did not carry __vps/__local suffix.
  if (nodeRole === "vps") {
    return (
      normalized.startsWith("vps_host") ||
      normalized.startsWith("pm2_") ||
      normalized.startsWith("docker_") ||
      normalized.startsWith("tailscale_")
    );
  }
  return false;
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

function aggregateRawRowsToServiceDay(rows, serviceKeyFilter = "", nodeRoleFilter = "", granularity = "day") {
  const byServiceDay = new Map();
  const latenciesByServiceDay = new Map();

  for (const row of rows || []) {
    if (!row?.checked_at || !row?.service_key) continue;
    if (serviceKeyFilter && row.service_key !== serviceKeyFilter) continue;
    if (!matchesNodeRole(row.service_key, nodeRoleFilter)) continue;

    const checkedAt = new Date(row.checked_at);
    if (Number.isNaN(checkedAt.getTime())) continue;
    const dayKey = bucketKeyFromDate(checkedAt, granularity);
    if (!dayKey) continue;
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
    const rangeInput = String(url.searchParams.get("range") || "24h").trim().toLowerCase();
    const preset = parseRangePreset(rangeInput);
    const granularity = String(url.searchParams.get("bucket") || preset.granularity).trim().toLowerCase();

    const bucketType = ["hour", "day", "week", "month"].includes(granularity) ? granularity : preset.granularity;
    const nowTs = new Date();
    const nowDay = startOfUtcDay(nowTs);
    const startTs = bucketType === "hour"
      ? (rangeInput === "today" ? startOfIstDay(nowTs) : new Date(nowTs.getTime() - 24 * 60 * 60 * 1000))
      : addUtcDays(nowDay, -(preset.days - 1));
    const startDay = startOfUtcDay(startTs);
    const endExclusive = bucketType === "hour" ? nowTs : addUtcDays(nowDay, 1);
    const useDigest = bucketType !== "hour";

    let digestRows = [];
    let digestAvailable = useDigest;

    if (useDigest) {
      let digestQuery = supabase
        .from("cto_service_daily_digest")
        .select("day_date, service_key, total_checks, healthy_count, degraded_count, down_count, unknown_count, avg_latency_ms, latency_sample_count, max_latency_ms, p95_latency_ms, status_transitions, last_status, host_metric_samples, host_memory_avg_pct, host_disk_avg_pct, host_swap_avg_pct, host_load1_avg, host_load_per_core_avg_pct")
        .gte("day_date", formatDayKey(startDay))
        .lt("day_date", formatDayKey(endExclusive))
        .order("day_date", { ascending: true })
        .limit(12000);

      if (labId) digestQuery = digestQuery.eq("lab_id", labId);
      if (serviceKey) digestQuery = digestQuery.eq("service_key", serviceKey);

      const { data: digestData, error: digestError } = await digestQuery;

      if (digestError) {
        const missingColumn =
          String(digestError?.code || "") === "42703" ||
          String(digestError?.message || "").toLowerCase().includes("column");
        if (isMissingRelationError(digestError)) {
          digestAvailable = false;
        } else if (missingColumn) {
          let legacyQuery = supabase
            .from("cto_service_daily_digest")
            .select("day_date, service_key, total_checks, healthy_count, degraded_count, down_count, unknown_count, avg_latency_ms, latency_sample_count, max_latency_ms, p95_latency_ms, status_transitions, last_status")
            .gte("day_date", formatDayKey(startDay))
            .lt("day_date", formatDayKey(endExclusive))
            .order("day_date", { ascending: true })
            .limit(12000);
          if (labId) legacyQuery = legacyQuery.eq("lab_id", labId);
          if (serviceKey) legacyQuery = legacyQuery.eq("service_key", serviceKey);
          const { data: legacyData, error: legacyError } = await legacyQuery;
          if (legacyError) {
            console.error("[cto/trends] legacy digest query failed", legacyError);
            return NextResponse.json({ error: "Failed to load trend digest" }, { status: 500 });
          }
          digestRows = Array.isArray(legacyData) ? legacyData : [];
        } else {
          console.error("[cto/trends] digest query failed", digestError);
          return NextResponse.json({ error: "Failed to load trend digest" }, { status: 500 });
        }
      } else {
        digestRows = Array.isArray(digestData) ? digestData : [];
      }
    }

    const hasDigestRows = useDigest && digestAvailable && digestRows.length > 0;
    const rawWindowStart = hasDigestRows
      ? addUtcDays(nowDay, -RECENT_RAW_DAYS)
      : startTs;
    const effectiveRawStart = rawWindowStart > startDay ? rawWindowStart : startTs;

    const rawAscending = hasDigestRows;

    let rawQuery = supabase
      .from("cto_service_logs")
      .select("checked_at, service_key, status, latency_ms, payload")
      .gte("checked_at", effectiveRawStart.toISOString())
      .lt("checked_at", endExclusive.toISOString())
      .order("checked_at", { ascending: rawAscending })
      .limit(MAX_RAW_ROWS);

    if (labId) rawQuery = rawQuery.eq("lab_id", labId);

    const { data: rawData, error: rawError } = await rawQuery;

    if (rawError) {
      console.error("[cto/trends] raw query failed", rawError);
      return NextResponse.json({ error: "Failed to load trend logs" }, { status: 500 });
    }

    const rawRows = Array.isArray(rawData) ? rawData : [];
    const digestServiceDay = useDigest
      ? aggregateDigestRowsToServiceDay(digestRows, serviceKey, nodeRoleFilter)
      : new Map();
    const rawServiceDay = aggregateRawRowsToServiceDay(rawRows, serviceKey, nodeRoleFilter, bucketType);

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

    const points = buildPointsFromDailyMap(mergedDailyMap, bucketType);

    // Host pressure should always be node-wide and independent of service filters.
    // Use dedicated host metric rows so charts remain stable when service drilldowns are active.
    let hostDigestRows = [];
    let hostRawRows = [];
    if (nodeRoleFilter === "vps") {
      if (useDigest && digestAvailable) {
        let hostDigestQuery = supabase
          .from("cto_service_daily_digest")
          .select("day_date, service_key, host_metric_samples, host_memory_avg_pct, host_disk_avg_pct, host_swap_avg_pct, host_load1_avg, host_load_per_core_avg_pct")
          .eq("service_key", "vps_host__vps")
          .gte("day_date", formatDayKey(startDay))
          .lt("day_date", formatDayKey(endExclusive))
          .order("day_date", { ascending: true })
          .limit(12000);
        if (labId) hostDigestQuery = hostDigestQuery.eq("lab_id", labId);
        const { data: hostDigestData, error: hostDigestError } = await hostDigestQuery;
        if (!hostDigestError && Array.isArray(hostDigestData)) {
          hostDigestRows = hostDigestData;
        }
      }

      let hostRawQuery = supabase
        .from("cto_service_logs")
        .select("checked_at, service_key, payload")
        .eq("service_key", "vps_host__vps")
        .gte("checked_at", effectiveRawStart.toISOString())
        .lt("checked_at", endExclusive.toISOString())
        .order("checked_at", { ascending: true })
        .limit(MAX_RAW_ROWS);
      if (labId) hostRawQuery = hostRawQuery.eq("lab_id", labId);
      const { data: hostRawData, error: hostRawError } = await hostRawQuery;
      if (!hostRawError && Array.isArray(hostRawData)) {
        hostRawRows = hostRawData;
      }
    }

    const digestHostPoints =
      useDigest && nodeRoleFilter === "vps"
        ? buildHostPointsFromDigestRows(hostDigestRows, bucketType, "", nodeRoleFilter)
        : [];
    const rawHostPoints =
      nodeRoleFilter === "vps"
        ? buildHostPointsFromRawRows(hostRawRows, bucketType, "", nodeRoleFilter)
        : [];
    const hostPointsMap = new Map();
    for (const point of digestHostPoints) hostPointsMap.set(point.bucket_key, point);
    for (const point of rawHostPoints) hostPointsMap.set(point.bucket_key, point);
    const hostPoints = [...hostPointsMap.values()].sort((a, b) =>
      String(a?.bucket_key || "").localeCompare(String(b?.bucket_key || ""))
    );
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
        host_points: hostPoints,
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
          raw_window_hours: Math.round((endExclusive.getTime() - effectiveRawStart.getTime()) / (60 * 60 * 1000)),
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
