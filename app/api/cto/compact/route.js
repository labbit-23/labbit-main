import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";

const VALID_STATUSES = new Set(["healthy", "degraded", "down", "unknown"]);

function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401 });
}

function badRequest(message) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function startOfUtcDay(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatDay(date) {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

function parseTargetDay(value) {
  if (!value) return addUtcDays(startOfUtcDay(new Date()), -1);
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return startOfUtcDay(parsed);
}

function isMissingRelationError(error) {
  const message = String(error?.message || "").toLowerCase();
  return String(error?.code || "") === "42P01" || message.includes("does not exist");
}

function aggregateRowsToDigest(rows = []) {
  const byService = new Map();

  for (const row of rows) {
    const key = `${row.lab_id}__${row.service_key}`;
    const current = byService.get(key) || {
      lab_id: row.lab_id,
      service_key: row.service_key,
      category: row.category || null,
      label: row.label || null,
      source: row.source || null,
      total_checks: 0,
      healthy_count: 0,
      degraded_count: 0,
      down_count: 0,
      unknown_count: 0,
      latency_sum: 0,
      latency_sample_count: 0,
      latency_values: [],
      max_latency_ms: null,
      first_checked_at: null,
      last_checked_at: null,
      status_transitions: 0,
      last_status: null
    };

    const checkedAt = new Date(row.checked_at);
    const checkedMs = checkedAt.getTime();
    const status = VALID_STATUSES.has(row.status) ? row.status : "unknown";

    current.total_checks += 1;
    current[`${status}_count`] += 1;

    if (typeof row.latency_ms === "number" && Number.isFinite(row.latency_ms)) {
      current.latency_sum += row.latency_ms;
      current.latency_sample_count += 1;
      current.latency_values.push(row.latency_ms);
      current.max_latency_ms = current.max_latency_ms == null ? row.latency_ms : Math.max(current.max_latency_ms, row.latency_ms);
    }

    if (Number.isFinite(checkedMs)) {
      if (!current.first_checked_at || checkedMs < new Date(current.first_checked_at).getTime()) {
        current.first_checked_at = checkedAt.toISOString();
      }
      if (!current.last_checked_at || checkedMs > new Date(current.last_checked_at).getTime()) {
        current.last_checked_at = checkedAt.toISOString();
        current.last_status = status;
      }
    }

    if (current.__previous_status && current.__previous_status !== status) {
      current.status_transitions += 1;
    }
    current.__previous_status = status;

    byService.set(key, current);
  }

  return [...byService.values()].map((entry) => {
    let p95 = null;
    if (entry.latency_values.length > 0) {
      entry.latency_values.sort((a, b) => a - b);
      const idx = Math.max(0, Math.min(entry.latency_values.length - 1, Math.ceil(entry.latency_values.length * 0.95) - 1));
      p95 = entry.latency_values[idx];
    }

    return {
      lab_id: entry.lab_id,
      day_date: null,
      service_key: entry.service_key,
      category: entry.category,
      label: entry.label,
      source: entry.source,
      total_checks: entry.total_checks,
      healthy_count: entry.healthy_count,
      degraded_count: entry.degraded_count,
      down_count: entry.down_count,
      unknown_count: entry.unknown_count,
      avg_latency_ms:
        entry.latency_sample_count > 0 ? Number((entry.latency_sum / entry.latency_sample_count).toFixed(2)) : null,
      latency_sample_count: entry.latency_sample_count,
      p95_latency_ms: p95,
      max_latency_ms: entry.max_latency_ms,
      first_checked_at: entry.first_checked_at,
      last_checked_at: entry.last_checked_at,
      status_transitions: entry.status_transitions,
      last_status: entry.last_status || "unknown",
      updated_at: new Date().toISOString()
    };
  });
}

export async function POST(request) {
  try {
    const expectedToken = process.env.CTO_INGEST_TOKEN;
    const authHeader = request.headers.get("authorization") || "";
    const providedToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

    if (!expectedToken) {
      return NextResponse.json({ error: "CTO ingest token is not configured" }, { status: 500 });
    }

    if (!providedToken || providedToken !== expectedToken) {
      return unauthorized();
    }

    if (!supabase) {
      return NextResponse.json({ error: "Supabase server client unavailable" }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const targetDay = parseTargetDay(body?.day);
    if (!targetDay) return badRequest("Invalid day; expected YYYY-MM-DD");

    const labId = String(body?.lab_id || "").trim() || null;
    const dryRun = Boolean(body?.dry_run);
    const dropDigestedDay = Boolean(body?.drop_digested_day);
    const pruneRawOlderThanDays =
      body?.prune_raw_older_than_days === undefined || body?.prune_raw_older_than_days === null
        ? null
        : Number(body.prune_raw_older_than_days);

    if (pruneRawOlderThanDays !== null && (!Number.isFinite(pruneRawOlderThanDays) || pruneRawOlderThanDays < 1)) {
      return badRequest("prune_raw_older_than_days must be a positive number");
    }

    const dayStart = startOfUtcDay(targetDay);
    const dayEnd = addUtcDays(dayStart, 1);

    let sourceQuery = supabase
      .from("cto_service_logs")
      .select("lab_id, checked_at, source, service_key, category, label, status, latency_ms")
      .gte("checked_at", dayStart.toISOString())
      .lt("checked_at", dayEnd.toISOString())
      .order("checked_at", { ascending: true })
      .limit(50000);

    if (labId) sourceQuery = sourceQuery.eq("lab_id", labId);

    const { data: logRows, error: logError } = await sourceQuery;

    if (logError) {
      console.error("[cto/compact] failed to read source logs", logError);
      return NextResponse.json({ error: "Failed to load source logs" }, { status: 500 });
    }

    const digestRows = aggregateRowsToDigest(logRows || []).map((row) => ({
      ...row,
      day_date: formatDay(dayStart)
    }));

    if (dryRun) {
      return NextResponse.json({
        message: "Dry run complete",
        day: formatDay(dayStart),
        lab_id: labId,
        source_rows: (logRows || []).length,
        digest_rows: digestRows.length,
        wrote_digest: false,
        deleted_day_rows: 0,
        pruned_rows: 0
      });
    }

    let digestWriteError = null;
    if (digestRows.length > 0) {
      const { error } = await supabase
        .from("cto_service_daily_digest")
        .upsert(digestRows, { onConflict: "day_date,lab_id,service_key" });
      digestWriteError = error;
    }

    if (digestWriteError) {
      if (isMissingRelationError(digestWriteError)) {
        return NextResponse.json(
          {
            error: "cto_service_daily_digest table is missing. Run docs/cto-trends-compaction.sql first."
          },
          { status: 500 }
        );
      }
      console.error("[cto/compact] failed to upsert digest rows", digestWriteError);
      return NextResponse.json({ error: "Failed to write digest rows" }, { status: 500 });
    }

    let deletedDayRows = 0;
    if (dropDigestedDay) {
      let deleteDayQuery = supabase
        .from("cto_service_logs")
        .delete()
        .gte("checked_at", dayStart.toISOString())
        .lt("checked_at", dayEnd.toISOString());
      if (labId) deleteDayQuery = deleteDayQuery.eq("lab_id", labId);

      const { data: deletedData, error: deleteError } = await deleteDayQuery.select("id");
      if (deleteError) {
        console.error("[cto/compact] failed to delete digested day rows", deleteError);
        return NextResponse.json({ error: "Failed to delete digested day rows" }, { status: 500 });
      }
      deletedDayRows = Array.isArray(deletedData) ? deletedData.length : 0;
    }

    let prunedRows = 0;
    if (pruneRawOlderThanDays !== null) {
      const pruneBefore = addUtcDays(startOfUtcDay(new Date()), -pruneRawOlderThanDays);
      let pruneQuery = supabase
        .from("cto_service_logs")
        .delete()
        .lt("checked_at", pruneBefore.toISOString());
      if (labId) pruneQuery = pruneQuery.eq("lab_id", labId);

      const { data: prunedData, error: pruneError } = await pruneQuery.select("id");
      if (pruneError) {
        console.error("[cto/compact] failed to prune old rows", pruneError);
        return NextResponse.json({ error: "Failed to prune old rows" }, { status: 500 });
      }
      prunedRows = Array.isArray(prunedData) ? prunedData.length : 0;
    }

    return NextResponse.json({
      message: "CTO logs compacted",
      day: formatDay(dayStart),
      lab_id: labId,
      source_rows: (logRows || []).length,
      digest_rows: digestRows.length,
      wrote_digest: true,
      deleted_day_rows: deletedDayRows,
      pruned_rows: prunedRows
    });
  } catch (error) {
    console.error("[cto/compact] unexpected error", error);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
