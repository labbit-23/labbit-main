// "Sent Jobs" tab for patient_message_jobs sends (e.g. requisition_welcome/
// requisition_bill) -- these have NO row in report_auto_dispatch_jobs (that
// table is report-dispatch-only); every send/attempt is logged to
// report_dispatch_logs instead (see lib/patientMessageJobs/index.js::runJob,
// actor_name="patient_message_jobs", report_type=<job key>). This route
// mirrors auto-dispatch-logs' date-scoping/shape closely enough that the
// existing Sent Reports/Jobs table can render either source with the same
// columns. User, 2026-09-10: "reuse that sent reports to sent jobs and have
// a tab for each type" -- this is the patient-message-job-key tab's backend.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
import { canUseReportDispatch } from "@/lib/reportDispatchScope";
import { hasPermission } from "@/lib/uac/policy";

const LOGS_TABLE = "report_dispatch_logs";
const ACTOR_NAME = "patient_message_jobs";

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

function toInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
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
      return NextResponse.json({ jobs: [], count: 0, scoped_lab_ids: [] }, { status: 200 });
    }

    const url = new URL(request.url);
    const selectedDate = String(url.searchParams.get("selected_date") || "").trim();
    const jobKey = String(url.searchParams.get("job_key") || "").trim();
    const limit = Math.min(toInt(url.searchParams.get("limit"), 300), 5000);

    let query = supabase
      .from(LOGS_TABLE)
      .select("id,lab_id,reqno,reqid,phone,report_type,status,result_code,result_message,provider_message_id,created_at", { count: "exact" })
      .eq("actor_name", ACTOR_NAME)
      .order("created_at", { ascending: false })
      .limit(limit);

    query = applyLabScope(query, labIds);

    if (jobKey) {
      query = query.eq("report_type", jobKey);
    }

    if (selectedDate) {
      const range = istDayRange(selectedDate);
      if (range) {
        query = query.gte("created_at", range.startIso).lt("created_at", range.endIso);
      }
    }

    const { data, error, count } = await query;
    if (error) {
      return new Response(error.message || "Failed to load patient message job logs", { status: 500 });
    }

    // Normalized to the same field names the Sent Reports/Jobs table already
    // renders (reqno, phone, report_label, status, sent_at, provider_message_id,
    // last_error) so the frontend needs no per-source branching.
    const jobs = (Array.isArray(data) ? data : []).map((row) => ({
      id: `pmj_${row.id}`,
      reqno: row.reqno,
      reqid: row.reqid,
      phone: row.phone,
      patient_name: null,
      report_label: row.report_type,
      status: row.status === "success" ? "sent" : row.status,
      sent_at: row.status === "success" ? row.created_at : null,
      updated_at: row.created_at,
      provider_message_id: row.provider_message_id || null,
      last_error: row.status !== "success" ? (row.result_message || "patient_message_job send failed") : null,
    }));

    return NextResponse.json({ jobs, count: Number(count || 0), scoped_lab_ids: labIds }, { status: 200 });
  } catch (error) {
    console.error("[patient-message-job-logs][GET] error", error);
    return new Response("Internal server error", { status: 500 });
  }
}
