import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { getReportAdminUser } from "@/lib/reports/master";

export async function GET(request) {
  try {
    const { allowed, permissions } = await getReportAdminUser();
    if (!allowed) return new Response("Forbidden", { status: 403 });
    const canViewLogs = permissions.includes("*") || permissions.includes("reports.logs.view") || permissions.includes("reports.setup");
    if (!canViewLogs) return new Response("Forbidden", { status: 403 });

    const url = new URL(request.url);
    const reportId = Number(url.searchParams.get("report_id"));
    const limitRaw = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, Math.floor(limitRaw)) : 25;

    let query = supabase
      .from("report_run_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (Number.isFinite(reportId) && reportId > 0) query = query.eq("report_id", reportId);

    const { data, error } = await query;
    if (error) return new Response(error.message || "Failed to load report run logs", { status: 500 });
    return NextResponse.json({ ok: true, logs: data || [] }, { status: 200 });
  } catch (error) {
    return new Response(error?.message || "Failed to load report run logs", { status: 500 });
  }
}
