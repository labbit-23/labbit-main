import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
import { canUseReportDispatch } from "@/lib/reportDispatchScope";

const JOBS_TABLE = "report_auto_dispatch_jobs";
const EVENTS_TABLE = "report_auto_dispatch_events";
const ALLOWED_ACTIONS = new Set(["pause", "resume", "push_now", "cancel"]);

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

export async function GET(request) {
  try {
    const user = await getUser();
    if (!user || !canUseReportDispatch(user)) {
      return new Response("Forbidden", { status: 403 });
    }

    const labIds = normalizeLabIds(user);
    if (!labIds.length) {
      return NextResponse.json({ jobs: [], events: [], count: 0, scoped_lab_ids: [] }, { status: 200 });
    }

    const url = new URL(request.url);
    const status = String(url.searchParams.get("status") || "").trim();
    const limit = Math.min(toInt(url.searchParams.get("limit"), 50), 200);
    const jobId = String(url.searchParams.get("job_id") || "").trim();

    let jobsQuery = supabase
      .from(JOBS_TABLE)
      .select("id,lab_id,reqno,reqid,mrno,phone,patient_name,report_label,status,is_paused,force_send_now,cooloff_minutes,scheduled_at,next_attempt_at,sent_at,attempt_count,max_attempts,last_attempt_at,last_error,created_at,updated_at", { count: "exact" })
      .order("updated_at", { ascending: false })
      .limit(limit);

    jobsQuery = applyLabScope(jobsQuery, labIds);

    if (status) {
      jobsQuery = jobsQuery.eq("status", status);
    }

    if (jobId) {
      jobsQuery = jobsQuery.eq("id", jobId);
    }

    const { data: jobs, error: jobsError, count } = await jobsQuery;
    if (jobsError) {
      return new Response(jobsError.message || "Failed to load jobs", { status: 500 });
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

    return NextResponse.json(
      {
        jobs: Array.isArray(jobs) ? jobs : [],
        events,
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

    if (!jobId) return new Response("Missing job_id", { status: 400 });
    if (!ALLOWED_ACTIONS.has(action)) return new Response("Invalid action", { status: 400 });

    let getJobQuery = supabase
      .from(JOBS_TABLE)
      .select("id,lab_id,status,is_paused,force_send_now")
      .eq("id", jobId)
      .limit(1)
      .maybeSingle();

    getJobQuery = applyLabScope(getJobQuery, labIds);

    const { data: job, error: jobError } = await getJobQuery;
    if (jobError) return new Response(jobError.message || "Failed to load job", { status: 500 });
    if (!job) return new Response("Job not found", { status: 404 });

    const nowIso = new Date().toISOString();
    const patch = { updated_at: nowIso };
    if (action === "pause") patch.is_paused = true;
    if (action === "resume") patch.is_paused = false;
    if (action === "push_now") {
      patch.force_send_now = true;
      patch.is_paused = false;
      patch.next_attempt_at = nowIso;
      if (["queued", "cooling_off", "retrying"].includes(String(job.status || ""))) {
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
      .select("id,lab_id,status,is_paused,force_send_now,next_attempt_at,updated_at")
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
