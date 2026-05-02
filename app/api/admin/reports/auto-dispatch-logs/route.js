import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
import { canUseReportDispatch } from "@/lib/reportDispatchScope";
import { hasPermission } from "@/lib/uac/policy";

const JOBS_TABLE = "report_auto_dispatch_jobs";
const EVENTS_TABLE = "report_auto_dispatch_events";
const METRICS_TABLE = "report_auto_dispatch_daily_metrics";
const ALLOWED_ACTIONS = new Set(["pause", "resume", "push_now", "cancel", "pause_all", "resume_all", "send_to"]);
const ELIGIBLE_STATUSES = ["queued", "cooling_off", "retrying"];

function toInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

function normalizeLabIds(user) {
  const ids = Array.isArray(user?.labIds) ? user.labIds : [];
  return ids.map((v) => String(v || "").trim()).filter(Boolean);
}

async function getUser() {
  const cookieStore = await cookies();
  const session = await getIronSession(cookieStore, ironOptions);
  return session?.user || null;
}

function applyLabScope(query, labIds) {
  if (!labIds?.length) return query;
  if (labIds.length === 1) return query.eq("lab_id", labIds[0]);
  return query.in("lab_id", labIds);
}

async function can(user, permission) {
  return hasPermission(user, permission, { labId: normalizeLabIds(user)[0] || null });
}

function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

function extractProviderMessageIdFromJob(job) {
  const payload = parseMaybeJson(job?.provider_response);
  const id = String(
    payload?.provider_message_id ||
      payload?.id ||
      payload?.message_id ||
      payload?.messages?.[0]?.id ||
      ""
  ).trim();
  return id || null;
}

function extractProviderMessageIdFromAny(value) {
  const payload = parseMaybeJson(value);
  if (!payload || typeof payload !== "object") return null;
  const direct = String(
    payload?.provider_message_id ||
      payload?.message_id ||
      payload?.id ||
      payload?.messages?.[0]?.id ||
      payload?.providerResponse?.message_id ||
      payload?.providerResponse?.messages?.[0]?.id ||
      payload?.response?.message_id ||
      payload?.response?.messages?.[0]?.id ||
      ""
  ).trim();
  return direct || null;
}

function deliveryRank(status) {
  const key = String(status || "").toLowerCase();
  if (key === "failed") return 0;
  if (key === "sent") return 1;
  if (key === "delivered") return 2;
  if (key === "read") return 3;
  return -1;
}

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function phoneLast10(value) {
  const digits = normalizeDigits(value);
  if (!digits) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function ymdKeyFromIsoDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[1]}${m[2]}${m[3]}`;
}

function istDayRange(selectedDate) {
  const m = String(selectedDate || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const startUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0) - (5.5 * 60 * 60 * 1000);
  const endUtcMs = startUtcMs + (24 * 60 * 60 * 1000);
  return {
    startIso: new Date(startUtcMs).toISOString(),
    endIso: new Date(endUtcMs).toISOString()
  };
}

function parseSnapshotTests(job) {
  const snap = parseMaybeJson(job?.last_status_snapshot);
  return Array.isArray(snap?.tests) ? snap.tests : [];
}

function summarizeSnapshotBuckets(job) {
  const snap = parseMaybeJson(job?.last_status_snapshot) || {};
  const tests = Array.isArray(snap?.tests) ? snap.tests : [];
  const out = {
    tests_total: 0,
    sameday_tests_total: 0,
    lab: { total: 0, sameday_total: 0, approved: 0, pending_approval: 0, ready: 0, waiting: 0 },
    radiology: { total: 0, sameday_total: 0, approved: 0, pending_approval: 0, ready: 0, waiting: 0 }
  };
  for (const row of tests) {
    out.tests_total += 1;
    let group = String(row?.GROUPNM ?? row?.groupnm ?? "").trim().toUpperCase();
    const gid = String(row?.GROUPID ?? row?.groupid ?? "").trim().toUpperCase();
    const dept = String(row?.DEPTID ?? row?.deptid ?? "").trim().toUpperCase();
    const reportStatus = String(row?.REPORT_STATUS ?? row?.report_status ?? "").trim().toUpperCase();
    const testName = String(row?.TESTNM ?? row?.testnm ?? row?.test_name ?? "").trim().toUpperCase();

    if (!group) {
      if (gid === "GDEP0002") group = "RADIOLOGY";
      else if (gid === "GDEP0001") group = "LAB";
    }
    if (!group && reportStatus.startsWith("RADIOLOGY")) group = "RADIOLOGY";
    if (!group && reportStatus.startsWith("LAB")) group = "LAB";
    if (!group && /\b(XRAY|X-RAY|CT|MRI|USG|ULTRASOUND|SONOGRAPHY|DOPPLER|MAMMO|SCAN)\b/.test(testName)) {
      group = "RADIOLOGY";
    }
    if (!group && dept.startsWith("RAD")) group = "RADIOLOGY";
    if (!group) group = "LAB";

    const bucket = group === "RADIOLOGY" ? out.radiology : out.lab;
    bucket.total += 1;
    const sameday = String(row?.SAMEDAYREPORT ?? row?.samedayreport ?? "").trim() === "1";
    if (sameday) {
      out.sameday_tests_total += 1;
      bucket.sameday_total += 1;
    }
    const approved = String(row?.APPROVEDFLG ?? row?.approvedflg ?? "").trim() === "1";
    const ready = reportStatus === "LAB_READY" || reportStatus === "RADIOLOGY_READY";
    const performedRaw = String(
      row?.TESTPERFORMEDFLG ??
      row?.testperformedflg ??
      row?.TESTPERFORMED ??
      row?.testperformed ??
      row?.PERFORMEDFLG ??
      row?.performedflg ??
      ""
    ).trim().toUpperCase();
    const performed = ["1", "Y", "YES", "TRUE", "DONE"].includes(performedRaw);
    if (approved) bucket.approved += 1;
    else if (performed) bucket.pending_approval += 1;
    if (ready) bucket.ready += 1;
    else if (!performed) bucket.waiting += 1;
  }

  // Fallback for environments where test rows miss reliable radiology markers.
  // Use aggregate snapshot totals if radiology bucket remained empty.
  const snapRadTotal = Number(snap?.radiology_total || 0);
  const snapRadReady = Number(snap?.radiology_ready || 0);
  if (out.radiology.total === 0 && snapRadTotal > 0) {
    out.radiology.total = snapRadTotal;
    out.radiology.ready = Math.max(0, Math.min(snapRadReady, snapRadTotal));
    out.radiology.waiting = Math.max(0, snapRadTotal - out.radiology.ready);
  }

  const snapLabTotal = Number(snap?.lab_total || 0);
  const snapLabReady = Number(snap?.lab_ready || 0);
  if (out.lab.total === 0 && snapLabTotal > 0) {
    out.lab.total = snapLabTotal;
    out.lab.ready = Math.max(0, Math.min(snapLabReady, snapLabTotal));
    out.lab.waiting = Math.max(0, snapLabTotal - out.lab.ready);
  }
  return out;
}

export async function GET(request) {
  try {
    const user = await getUser();
    if (!user || !canUseReportDispatch(user)) {
      return new Response("Forbidden", { status: 403 });
    }
    const canView = (await can(user, "reports.auto_dispatch.view")) || (await can(user, "reports.dispatch"));
    if (!canView) return new Response("Forbidden", { status: 403 });

    const labIds = normalizeLabIds(user);
    if (!labIds.length) {
      return NextResponse.json({ jobs: [], events: [], count: 0, scoped_lab_ids: [] }, { status: 200 });
    }

    const url = new URL(request.url);
    const status = String(url.searchParams.get("status") || "").trim();
    const limit = Math.min(toInt(url.searchParams.get("limit"), 50), 200);
    const selectedDate = String(url.searchParams.get("selected_date") || "").trim();
    const jobId = String(url.searchParams.get("job_id") || "").trim();
    const selectedDateKey = ymdKeyFromIsoDate(selectedDate);

    let jobsQuery = supabase
      .from(JOBS_TABLE)
      .select("id,lab_id,reqno,reqid,mrno,phone,patient_name,report_label,status,is_paused,force_send_now,cooloff_minutes,scheduled_at,next_attempt_at,sent_at,attempt_count,max_attempts,last_attempt_at,last_error,last_status_snapshot,provider_response,created_at,updated_at", { count: "exact" })
      .order("updated_at", { ascending: false })
      .limit(limit);

    jobsQuery = applyLabScope(jobsQuery, labIds);

    if (status) {
      jobsQuery = jobsQuery.eq("status", status);
    }

    if (selectedDateKey) {
      const st = String(status || "").toLowerCase();
      if (st === "sent") {
        const range = istDayRange(selectedDate);
        if (range) {
          jobsQuery = jobsQuery.gte("sent_at", range.startIso).lt("sent_at", range.endIso);
        } else {
          jobsQuery = jobsQuery.like("reqno", `${selectedDateKey}%`);
        }
      } else {
        jobsQuery = jobsQuery.like("reqno", `${selectedDateKey}%`);
      }
    }

    if (jobId) {
      jobsQuery = jobsQuery.eq("id", jobId);
    }

    const { data: jobs, error: jobsError, count } = await jobsQuery;
    if (jobsError) {
      return new Response(jobsError.message || "Failed to load jobs", { status: 500 });
    }

    let enrichedJobs = Array.isArray(jobs) ? [...jobs] : [];
    const providerIdByJobId = new Map();
    for (const row of enrichedJobs) {
      const id = extractProviderMessageIdFromJob(row);
      if (id) providerIdByJobId.set(Number(row?.id), id);
    }

    const unresolvedJobIds = enrichedJobs
      .map((row) => Number(row?.id))
      .filter((id) => Number.isFinite(id) && !providerIdByJobId.has(id));

    if (unresolvedJobIds.length > 0) {
      const { data: eventRows } = await supabase
        .from(EVENTS_TABLE)
        .select("job_id,payload,created_at")
        .in("job_id", unresolvedJobIds)
        .order("created_at", { ascending: false })
        .limit(2000);
      for (const ev of eventRows || []) {
        const jobIdNum = Number(ev?.job_id);
        if (!Number.isFinite(jobIdNum) || providerIdByJobId.has(jobIdNum)) continue;
        const fromEvent = extractProviderMessageIdFromAny(ev?.payload);
        if (fromEvent) providerIdByJobId.set(jobIdNum, fromEvent);
      }
    }

    const providerIds = Array.from(new Set(Array.from(providerIdByJobId.values()).filter(Boolean)));

    // Pull recent status rows once; use message_id-first matching, then phone+time fallback.
    let statusRows = [];
    const statusWindowStartIso = new Date(Date.now() - (3 * 24 * 60 * 60 * 1000)).toISOString();
    const statusPhones = Array.from(
      new Set(
        enrichedJobs
          .map((row) => phoneLast10(row?.phone))
          .filter(Boolean)
      )
    );
    if (providerIds.length > 0 || statusPhones.length > 0) {
      const rows = [];
      if (providerIds.length > 0) {
        const { data } = await supabase
          .from("whatsapp_messages")
          .select("message_id,phone,status,payload,created_at")
          .eq("direction", "status")
          .gte("created_at", statusWindowStartIso)
          .in("message_id", providerIds)
          .order("created_at", { ascending: false })
          .limit(5000);
        if (Array.isArray(data)) rows.push(...data);
      }
      if (statusPhones.length > 0 && statusPhones.length <= 200) {
        const indiaPhones = statusPhones.map((p) => `91${p}`);
        const { data } = await supabase
          .from("whatsapp_messages")
          .select("message_id,phone,status,payload,created_at")
          .eq("direction", "status")
          .gte("created_at", statusWindowStartIso)
          .in("phone", indiaPhones)
          .order("created_at", { ascending: false })
          .limit(5000);
        if (Array.isArray(data)) rows.push(...data);
      }
      const dedup = new Map();
      for (const row of rows) {
        const k = `${String(row?.message_id || "")}|${String(row?.phone || "")}|${String(row?.created_at || "")}|${String(row?.status || "")}`;
        if (!dedup.has(k)) dedup.set(k, row);
      }
      statusRows = Array.from(dedup.values());
    }

    if (statusRows.length > 0) {
      const byMessageId = new Map();
      const byPhone = new Map();
      for (const row of statusRows || []) {
        const payload = parseMaybeJson(row?.payload);
        const statusKey = String(row?.status || payload?.status || "").trim().toLowerCase();
        if (!statusKey) continue;

        const messageId = String(row?.message_id || "").trim();
        if (messageId) {
          const prev = byMessageId.get(messageId);
          if (!prev || deliveryRank(statusKey) >= deliveryRank(prev.status)) {
            byMessageId.set(messageId, { status: statusKey, at: row?.created_at || null });
          }
        }

        const p10 = phoneLast10(row?.phone || payload?.recipient_id);
        if (p10) {
          if (!byPhone.has(p10)) byPhone.set(p10, []);
          byPhone.get(p10).push({ status: statusKey, at: row?.created_at || null });
        }
      }

      enrichedJobs = enrichedJobs.map((row) => {
        const providerMessageId = providerIdByJobId.get(Number(row?.id)) || extractProviderMessageIdFromJob(row);
        let delivery = providerMessageId ? byMessageId.get(providerMessageId) : null;
        if (!delivery) {
          // Fallback correlation: same phone, first statuses after sent_at (or created_at).
          const p10 = phoneLast10(row?.phone);
          const candidates = p10 ? (byPhone.get(p10) || []) : [];
          const sentTs = new Date(row?.sent_at || row?.updated_at || row?.created_at || 0).getTime();
          if (Number.isFinite(sentTs) && sentTs > 0 && candidates.length > 0) {
            const horizon = sentTs + (12 * 60 * 60 * 1000);
            let best = null;
            for (const c of candidates) {
              const t = new Date(c?.at || 0).getTime();
              if (!Number.isFinite(t) || t < sentTs - 30_000 || t > horizon) continue;
              if (!best || deliveryRank(c.status) >= deliveryRank(best.status)) best = c;
            }
            delivery = best;
          }
        }
        return {
          ...row,
          provider_message_id: providerMessageId,
          delivery_status: delivery?.status || null,
          delivery_status_at: delivery?.at || null,
        };
      });
    }

    let events = [];
    if (jobId) {
      let eventsQuery = supabase
        .from(EVENTS_TABLE)
        .select("id,job_id,reqno,reqid,phone,event_type,message,payload,created_at")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(200);

      const { data: evRows, error: evError } = await eventsQuery;
      if (evError) {
        return new Response(evError.message || "Failed to load events", { status: 500 });
      }
      events = Array.isArray(evRows) ? evRows : [];
    }

    const summaryDateKey = selectedDateKey || ymdKeyFromIsoDate(new Date().toISOString().slice(0, 10));
    const dateJobs = enrichedJobs.filter((row) => String(row?.reqno || "").startsWith(summaryDateKey));
    const summary = {
      selected_date: selectedDate || new Date().toISOString().slice(0, 10),
      total_jobs: dateJobs.length,
      queued_jobs: 0,
      cooling_off_jobs: 0,
      retrying_jobs: 0,
      sent_jobs: 0,
      failed_jobs: 0,
      paused_jobs: 0,
      delivery_read_jobs: 0,
      delivery_delivered_jobs: 0,
      delivery_sent_only_jobs: 0,
      tests_total: 0,
      sameday_tests_total: 0,
      lab_total: 0,
      lab_sameday_total: 0,
      lab_approved_tests: 0,
      lab_pending_approval_tests: 0,
      lab_ready_tests: 0,
      lab_waiting_tests: 0,
      radiology_total: 0,
      radiology_sameday_total: 0,
      radiology_approved_tests: 0,
      radiology_pending_approval_tests: 0,
      radiology_ready_tests: 0,
      radiology_waiting_tests: 0
    };
    for (const row of dateJobs) {
      const st = String(row?.status || "").trim().toLowerCase();
      if (st === "queued") summary.queued_jobs += 1;
      else if (st === "cooling_off") summary.cooling_off_jobs += 1;
      else if (st === "retrying") summary.retrying_jobs += 1;
      else if (st === "sent") summary.sent_jobs += 1;
      else if (st === "failed") summary.failed_jobs += 1;
      if (row?.is_paused) summary.paused_jobs += 1;
      if (st === "sent") {
        const d = String(row?.delivery_status || "").trim().toLowerCase();
        if (d === "read") summary.delivery_read_jobs += 1;
        else if (d === "delivered") summary.delivery_delivered_jobs += 1;
        else summary.delivery_sent_only_jobs += 1;
      }
      const b = summarizeSnapshotBuckets(row);
      summary.tests_total += b.tests_total;
      summary.sameday_tests_total += b.sameday_tests_total;
      summary.lab_total += b.lab.total;
      summary.lab_sameday_total += b.lab.sameday_total;
      summary.lab_approved_tests += b.lab.approved;
      summary.lab_pending_approval_tests += b.lab.pending_approval;
      summary.lab_ready_tests += b.lab.ready;
      summary.lab_waiting_tests += b.lab.waiting;
      summary.radiology_total += b.radiology.total;
      summary.radiology_sameday_total += b.radiology.sameday_total;
      summary.radiology_approved_tests += b.radiology.approved;
      summary.radiology_pending_approval_tests += b.radiology.pending_approval;
      summary.radiology_ready_tests += b.radiology.ready;
      summary.radiology_waiting_tests += b.radiology.waiting;
    }

    // Best-effort persistence for CEO metrics; non-blocking if table missing.
    try {
      const labScopeKey = [...labIds].sort().join(",");
      await supabase.from(METRICS_TABLE).upsert(
        {
          metric_date: summary.selected_date,
          lab_scope_key: labScopeKey,
          lab_ids: labIds,
          summary,
          updated_at: new Date().toISOString()
        },
        { onConflict: "metric_date,lab_scope_key" }
      );
    } catch (metricErr) {
      console.warn("[auto-dispatch-logs] metrics upsert skipped", metricErr?.message || String(metricErr));
    }

    return NextResponse.json(
      {
        jobs: enrichedJobs,
        events,
        summary,
        count: Number(count || 0),
        scoped_lab_ids: labIds,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[auto-dispatch-logs][GET] error", error);
    return new Response("Internal server error", { status: 500 });
  }
}

export async function POST(request) {
  try {
    const user = await getUser();
    if (!user || !canUseReportDispatch(user)) {
      return new Response("Forbidden", { status: 403 });
    }

    const labIds = normalizeLabIds(user);
    if (!labIds.length) {
      return new Response("No lab scope", { status: 400 });
    }

    const body = await request.json();
    const jobId = String(body?.job_id || "").trim();
    const action = String(body?.action || "").trim().toLowerCase();
    const sendToPhone = String(body?.phone || "").replace(/\D/g, "").slice(-10);
    const pauseAllJobIds = Array.isArray(body?.job_ids)
      ? body.job_ids.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : [];

    if (!jobId && action !== "pause_all" && action !== "resume_all") return new Response("Missing job_id", { status: 400 });
    if (!ALLOWED_ACTIONS.has(action)) return new Response("Invalid action", { status: 400 });
    if (action === "send_to" && sendToPhone.length !== 10) {
      return new Response("Valid 10-digit phone is required for send_to", { status: 400 });
    }

    const canPush = await can(user, "reports.auto_dispatch.push");
    const canSendTo = await can(user, "reports.auto_dispatch.send_to");
    const canPause = await can(user, "reports.auto_dispatch.pause");
    const canPauseAll = await can(user, "reports.auto_dispatch.pause_all");

    if ((action === "push_now" || action === "cancel") && !canPush) return new Response("Forbidden", { status: 403 });
    if (action === "send_to" && !canSendTo) return new Response("Forbidden", { status: 403 });
    if ((action === "pause" || action === "resume") && !canPause) return new Response("Forbidden", { status: 403 });
    if ((action === "pause_all" || action === "resume_all") && !canPauseAll) return new Response("Forbidden", { status: 403 });

    if (action === "pause_all" || action === "resume_all") {
      const nowIso = new Date().toISOString();
      const isResumeAll = action === "resume_all";
      let query = supabase
        .from(JOBS_TABLE)
        .update({ is_paused: !isResumeAll ? true : false, updated_at: nowIso });
      if (!isResumeAll) query = query.in("status", ELIGIBLE_STATUSES);
      else query = query.eq("is_paused", true);
      query = query
        .select("id");
      if (pauseAllJobIds.length > 0) query = query.in("id", pauseAllJobIds);
      query = applyLabScope(query, labIds);
      const { data: updatedRows, error: pauseAllError } = await query;
      if (pauseAllError) return new Response(pauseAllError.message || `Failed ${action}`, { status: 500 });

      const payload = {
        actor_user_id: user?.id || null,
        actor_name: user?.name || null,
        actor_role: user?.userType || null,
        updated_count: Array.isArray(updatedRows) ? updatedRows.length : 0,
        statuses: !isResumeAll ? ELIGIBLE_STATUSES : ["is_paused=true"]
      };
      const { error: eventError } = await supabase.from(EVENTS_TABLE).insert({
        job_id: null,
        reqno: null,
        reqid: null,
        phone: null,
        event_type: `admin_${action}`,
        message: `Admin action: ${action}`,
        payload,
        created_at: nowIso
      });
      if (eventError) console.error(`[auto-dispatch-logs][POST] ${action} event insert failed`, eventError);
      return NextResponse.json({ ok: true, action, updated_count: payload.updated_count }, { status: 200 });
    }

    let getJobQuery = supabase
      .from(JOBS_TABLE)
      .select("*")
      .eq("id", jobId)
      .limit(1)
      .maybeSingle();

    getJobQuery = applyLabScope(getJobQuery, labIds);

    const { data: job, error: jobError } = await getJobQuery;
    if (jobError) return new Response(jobError.message || "Failed to load job", { status: 500 });
    if (!job) return new Response("Job not found", { status: 404 });

    if (action === "push_now" && String(job?.status || "").toLowerCase() === "sent") {
      const nowIso = new Date().toISOString();
      const resendJob = {
        lab_id: job.lab_id,
        reqno: job.reqno,
        reqid: job.reqid,
        mrno: job.mrno,
        phone: job.phone,
        patient_name: job.patient_name,
        report_label: job.report_label,
        status: "eligible",
        is_paused: false,
        force_send_now: true,
        cooloff_minutes: job.cooloff_minutes,
        scheduled_at: nowIso,
        next_attempt_at: nowIso,
        sent_at: null,
        attempt_count: 0,
        max_attempts: job.max_attempts,
        last_attempt_at: null,
        last_error: null,
        created_at: nowIso,
        updated_at: nowIso
      };

      const { data: insertedJob, error: insertError } = await supabase
        .from(JOBS_TABLE)
        .insert(resendJob)
        .select("id,lab_id,status,is_paused,force_send_now,next_attempt_at,updated_at,phone,reqno,reqid,mrno,patient_name")
        .limit(1)
        .maybeSingle();
      if (insertError) return new Response(insertError.message || "Failed to create resend job", { status: 500 });

      const eventRow = {
        job_id: Number(insertedJob?.id || 0) || null,
        reqno: insertedJob?.reqno || null,
        reqid: insertedJob?.reqid || null,
        phone: insertedJob?.phone || null,
        event_type: "admin_push_now_resend",
        message: "Admin action: push_now on sent job (created resend job)",
        payload: {
          actor_user_id: user?.id || null,
          actor_name: user?.name || null,
          actor_role: user?.userType || null,
          source_job_id: Number(jobId)
        },
        created_at: nowIso
      };
      const { error: eventError } = await supabase.from(EVENTS_TABLE).insert(eventRow);
      if (eventError) {
        console.error("[auto-dispatch-logs][POST] push_now resend event insert failed", eventError);
      }

      return NextResponse.json(
        { ok: true, action, job: insertedJob || null, source_job_id: Number(jobId), mode: "resend_clone" },
        { status: 200 }
      );
    }

    if (action === "send_to") {
      const nowIso = new Date().toISOString();
      const sourcePhone = String(job?.phone || "").replace(/\D/g, "").slice(-10);
      if (sourcePhone === sendToPhone) {
        return new Response("send_to phone matches existing job phone", { status: 400 });
      }

      const newJob = {
        lab_id: job.lab_id,
        reqno: job.reqno,
        reqid: job.reqid,
        mrno: job.mrno,
        phone: sendToPhone,
        patient_name: job.patient_name,
        report_label: job.report_label,
        status: "eligible",
        is_paused: false,
        force_send_now: true,
        cooloff_minutes: job.cooloff_minutes,
        scheduled_at: job.scheduled_at || nowIso,
        next_attempt_at: nowIso,
        sent_at: null,
        attempt_count: 0,
        max_attempts: job.max_attempts,
        last_attempt_at: null,
        last_error: null,
        created_at: nowIso,
        updated_at: nowIso
      };

      const { data: insertedJob, error: insertError } = await supabase
        .from(JOBS_TABLE)
        .insert(newJob)
        .select("id,lab_id,status,is_paused,force_send_now,next_attempt_at,updated_at,phone,reqno,reqid,mrno,patient_name")
        .limit(1)
        .maybeSingle();
      if (insertError) return new Response(insertError.message || "Failed to create send_to job", { status: 500 });

      const eventRow = {
        job_id: Number(insertedJob?.id || 0) || null,
        reqno: insertedJob?.reqno || null,
        reqid: insertedJob?.reqid || null,
        phone: sendToPhone,
        event_type: "admin_send_to",
        message: "Admin action: send_to (created additional dispatch job)",
        payload: {
          actor_user_id: user?.id || null,
          actor_name: user?.name || null,
          actor_role: user?.userType || null,
          source_job_id: Number(jobId),
          source_phone: sourcePhone || null,
          destination_phone: sendToPhone
        },
        created_at: nowIso
      };
      const { error: eventError } = await supabase.from(EVENTS_TABLE).insert(eventRow);
      if (eventError) {
        console.error("[auto-dispatch-logs][POST] send_to event insert failed", eventError);
      }

      return NextResponse.json(
        { ok: true, action, job: insertedJob || null, source_job_id: Number(jobId) },
        { status: 200 }
      );
    }

    const nowIso = new Date().toISOString();
    const patch = { updated_at: nowIso };
    if (action === "pause") patch.is_paused = true;
    if (action === "resume") patch.is_paused = false;
    if (action === "push_now") {
      patch.force_send_now = true;
      patch.is_paused = false;
      patch.next_attempt_at = nowIso;
      if (ELIGIBLE_STATUSES.includes(String(job.status || ""))) {
        patch.status = "eligible";
      }
    }
    if (action === "cancel") {
      patch.status = "cancelled";
      patch.force_send_now = false;
      patch.is_paused = false;
    }

    let updateQuery = supabase
      .from(JOBS_TABLE)
      .update(patch)
      .eq("id", jobId)
      .select("id,lab_id,status,is_paused,force_send_now,next_attempt_at,updated_at,phone")
      .limit(1)
      .maybeSingle();

    updateQuery = applyLabScope(updateQuery, labIds);

    const { data: updated, error: updateError } = await updateQuery;
    if (updateError) return new Response(updateError.message || "Failed to update job", { status: 500 });

    const eventRow = {
      job_id: Number(jobId),
      reqno: null,
      reqid: null,
      phone: null,
      event_type: `admin_${action}`,
      message: `Admin action: ${action}`,
      payload: {
        actor_user_id: user?.id || null,
        actor_name: user?.name || null,
        actor_role: user?.userType || null,
        patch,
      },
      created_at: nowIso,
    };

    const { error: eventError } = await supabase.from(EVENTS_TABLE).insert(eventRow);
    if (eventError) {
      console.error("[auto-dispatch-logs][POST] event insert failed", eventError);
    }

    return NextResponse.json({ ok: true, action, job: updated || null }, { status: 200 });
  } catch (error) {
    console.error("[auto-dispatch-logs][POST] error", error);
    return new Response("Internal server error", { status: 500 });
  }
}
