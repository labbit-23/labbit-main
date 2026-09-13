// "Set Half Days" -- Report Dispatch workspace lets staff seed calendar
// dates ahead of time where the lab shuts early, so py_utils' report-sender
// worker can run the same-day partial-report cutoff earlier on those dates
// (report_sender_worker.py's worker.partial_send_cutoff_overrides.half_day,
// same mechanism as the existing Sunday-earlier-cutoff override -- see
// db/migrations/20260913_report_half_days.sql for the table this reads/writes).
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
import { canUseReportDispatch } from "@/lib/reportDispatchScope";
import { hasPermission } from "@/lib/uac/policy";

async function getUser() {
  const cookieStore = await cookies();
  const session = await getIronSession(cookieStore, ironOptions);
  return session?.user || null;
}

function normalizeLabIds(user) {
  const ids = Array.isArray(user?.labIds) ? user.labIds : [];
  return ids.map((v) => String(v || "").trim()).filter(Boolean);
}

async function canManage(user) {
  return hasPermission(user, "reports.dispatch", { labId: normalizeLabIds(user)[0] || null });
}

export async function GET(request) {
  try {
    const user = await getUser();
    if (!user || !canUseReportDispatch(user)) {
      return new Response("Forbidden", { status: 403 });
    }
    const url = new URL(request.url);
    const from = String(url.searchParams.get("from") || "").trim();

    let query = supabase
      .from("report_half_days")
      .select("id,half_date,note,created_by_name,created_at")
      .order("half_date", { ascending: true });
    if (from) query = query.gte("half_date", from);

    const { data, error } = await query;
    if (error) {
      return new Response(error.message || "Failed to load half days", { status: 500 });
    }
    return NextResponse.json({ half_days: data || [] }, { status: 200 });
  } catch (error) {
    console.error("[half-days][GET] error", error);
    return new Response("Internal server error", { status: 500 });
  }
}

export async function POST(request) {
  try {
    const user = await getUser();
    if (!user || !canUseReportDispatch(user) || !(await canManage(user))) {
      return new Response("Forbidden", { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    const dates = Array.isArray(body?.dates)
      ? body.dates
      : body?.half_date
      ? [body.half_date]
      : [];
    const cleanDates = dates
      .map((d) => String(d || "").trim())
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    if (!cleanDates.length) {
      return NextResponse.json({ error: "At least one valid date (YYYY-MM-DD) is required" }, { status: 400 });
    }
    const note = body?.note ? String(body.note).trim().slice(0, 500) : null;

    const rows = cleanDates.map((half_date) => ({
      half_date,
      note,
      created_by: user.id || null,
      created_by_name: user.name || user.username || null,
    }));

    const { data, error } = await supabase
      .from("report_half_days")
      .upsert(rows, { onConflict: "half_date" })
      .select("id,half_date,note,created_by_name,created_at");

    if (error) {
      return new Response(error.message || "Failed to save half days", { status: 500 });
    }
    return NextResponse.json({ half_days: data || [] }, { status: 200 });
  } catch (error) {
    console.error("[half-days][POST] error", error);
    return new Response("Internal server error", { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const user = await getUser();
    if (!user || !canUseReportDispatch(user) || !(await canManage(user))) {
      return new Response("Forbidden", { status: 403 });
    }
    const url = new URL(request.url);
    const id = String(url.searchParams.get("id") || "").trim();
    const halfDate = String(url.searchParams.get("half_date") || "").trim();
    if (!id && !halfDate) {
      return NextResponse.json({ error: "id or half_date is required" }, { status: 400 });
    }

    let query = supabase.from("report_half_days").delete();
    query = id ? query.eq("id", id) : query.eq("half_date", halfDate);
    const { error } = await query;
    if (error) {
      return new Response(error.message || "Failed to remove half day", { status: 500 });
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("[half-days][DELETE] error", error);
    return new Response("Internal server error", { status: 500 });
  }
}
