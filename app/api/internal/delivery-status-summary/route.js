import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { extractProviderMessageId, fetchDeliveryStatusByMessageId } from "@/lib/deliveryStatus";

// GET /api/internal/delivery-status-summary?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
//
// Service-to-service read for labit-core's MD Dashboard: an AGGREGATE (sent/
// delivered/read/failed job counts) over report_auto_dispatch_jobs for a date
// range, ONE endpoint call per dashboard render -- NOT per-requisition.
//
// Director, 2026-09-09: "Aggregates... can't they come from labit-main as
// well?... The Dashboard calls it, pulls it, like CEO Dashboard of Main now
// does?" Correct -- app/api/admin/reports/auto-dispatch-logs/route.js (the
// existing "CEO Dashboard of Main" summary) already computes this exact shape
// of aggregate from this same table, just single-day, cookie-session-authed,
// and folded into a much larger admin payload (risk/latency analysis etc).
// This is a lean, purpose-built sibling: date-RANGE (not single day),
// x-internal-token-authed (matches delivery-status/[reqno]'s own pattern, not
// a browser session).
//
// 2026-09-09 FIXED (first version 500'd live): delivery_status/
// delivery_status_at are NOT raw columns on report_auto_dispatch_jobs --
// confirmed the hard way (labit-core's fetch_main_delivery_status_summary
// returned {"available": false, "error": "column
// report_auto_dispatch_jobs.delivery_status does not exist"} against real
// production data the moment this shipped). lib/deliveryStatus.js's
// getDeliveryStatusForReqno() computes them per-job by extracting a
// provider_message_id from provider_response, then joining against
// whatsapp_messages (direction='status') -- reuses that exact same shared
// logic here (now exported) rather than inventing a second, divergent
// implementation of the same lookup.
//
// Called live, not cached, same posture as delivery-status/[reqno] -- a
// dashboard render is exactly the "ask fresh" case, not a background job.
function getAuthToken(request) {
  return (
    request.headers.get("x-internal-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  ).trim();
}

// Same +5:30 day-boundary math as auto-dispatch-logs/route.js's istDayRange,
// extended to a date RANGE (start of date_from's IST day -> end of date_to's
// IST day) instead of one calendar day.
function istRangeBounds(dateFrom, dateTo) {
  const fromMatch = String(dateFrom || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const toMatch = String(dateTo || dateFrom || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!fromMatch || !toMatch) return null;
  const startUtcMs =
    Date.UTC(Number(fromMatch[1]), Number(fromMatch[2]) - 1, Number(fromMatch[3]), 0, 0, 0) -
    5.5 * 60 * 60 * 1000;
  const endUtcMs =
    Date.UTC(Number(toMatch[1]), Number(toMatch[2]) - 1, Number(toMatch[3]), 0, 0, 0) -
    5.5 * 60 * 60 * 1000 +
    24 * 60 * 60 * 1000;
  return { startIso: new Date(startUtcMs).toISOString(), endIso: new Date(endUtcMs).toISOString() };
}

const JOBS_TABLE = "report_auto_dispatch_jobs";
// Same reasoning as auto-dispatch-logs/route.js's own comment: paginate a
// wide date range's row count safely rather than trust a single unbounded
// SELECT.
const PAGE_SIZE = 1000;

export async function GET(request) {
  const expectedToken = process.env.LABIT_CORE_INTERNAL_TOKEN || "";
  if (!expectedToken) {
    return NextResponse.json({ error: "LABIT_CORE_INTERNAL_TOKEN not configured" }, { status: 503 });
  }
  const providedToken = getAuthToken(request);
  if (!providedToken || providedToken !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dateFrom = url.searchParams.get("date_from");
  const dateTo = url.searchParams.get("date_to") || dateFrom;
  const range = istRangeBounds(dateFrom, dateTo);
  if (!range) {
    return NextResponse.json({ error: "date_from (YYYY-MM-DD) is required" }, { status: 400 });
  }

  try {
    // Pass 1: pull every job in range (status + provider_response, the
    // field extractProviderMessageId reads) and tally the plain-column
    // status buckets while we're at it.
    const jobs = [];
    const summary = {
      date_from: dateFrom,
      date_to: dateTo,
      total_jobs: 0,
      queued_jobs: 0,
      cooling_off_jobs: 0,
      retrying_jobs: 0,
      sent_jobs: 0,
      failed_jobs: 0,
      // Mutually exclusive buckets for a sent job, by its BEST known
      // delivery signal -- read implies delivered, so a read job is
      // counted only in read_jobs, never double-counted into
      // delivered_only_jobs too. ever_delivered_jobs (read_jobs +
      // delivered_only_jobs) mirrors lib/deliveryStatus.js's own
      // everDelivered semantics for a caller that just wants one "reached
      // the patient's phone" number.
      read_jobs: 0,
      delivered_only_jobs: 0,
      sent_only_jobs: 0,
    };
    let from = 0;
    for (;;) {
      const { data: rows, error } = await supabase
        .from(JOBS_TABLE)
        .select("status, provider_response")
        .gte("created_at", range.startIso)
        .lt("created_at", range.endIso)
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (!rows?.length) break;
      for (const row of rows) {
        summary.total_jobs += 1;
        const status = String(row.status || "");
        if (status === "queued") summary.queued_jobs += 1;
        else if (status === "cooling_off") summary.cooling_off_jobs += 1;
        else if (status === "retrying") summary.retrying_jobs += 1;
        else if (status === "sent") summary.sent_jobs += 1;
        else if (status === "failed") summary.failed_jobs += 1;
        jobs.push(row);
      }
      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    // Pass 2: real delivered/read status, same shared lookup
    // getDeliveryStatusForReqno() uses for a single reqno -- extract each
    // sent job's provider_message_id, batch-fetch their actual WhatsApp
    // status rows, then classify the same way that function does.
    const providerIds = Array.from(
      new Set(jobs.map(extractProviderMessageId).filter(Boolean))
    );
    const statusByMessageId = await fetchDeliveryStatusByMessageId(providerIds);
    for (const job of jobs) {
      const status = String(job.status || "");
      if (status !== "sent") continue;
      const providerMessageId = extractProviderMessageId(job);
      const delivery = providerMessageId ? statusByMessageId.get(providerMessageId) : null;
      const deliveryStatus = delivery?.status || "sent";
      if (deliveryStatus === "read") summary.read_jobs += 1;
      else if (deliveryStatus === "delivered") summary.delivered_only_jobs += 1;
      else summary.sent_only_jobs += 1;
    }
    summary.ever_delivered_jobs = summary.read_jobs + summary.delivered_only_jobs;
    return NextResponse.json({ available: true, ...summary }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { available: false, error: err?.message || "Failed to compute delivery status summary" },
      { status: 200 }
    );
  }
}
