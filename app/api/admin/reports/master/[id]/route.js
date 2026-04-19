import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { getReportAdminUser, normalizeReportPayload } from "@/lib/reports/master";

export async function GET(_request, context) {
  try {
    const { allowed, permissions } = await getReportAdminUser();
    if (!allowed) return new Response("Forbidden", { status: 403 });
    if (!permissions.includes("*") && !permissions.includes("reports.setup")) {
      return new Response("Forbidden", { status: 403 });
    }

    const id = Number((await context.params)?.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid report id" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("report_master")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return new Response(error.message || "Failed to load report", { status: 500 });
    if (!data) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    return NextResponse.json({ ok: true, report: data }, { status: 200 });
  } catch (error) {
    return new Response(error?.message || "Failed to load report", { status: 500 });
  }
}

export async function PUT(request, context) {
  try {
    const { user, allowed, permissions } = await getReportAdminUser();
    if (!allowed) return new Response("Forbidden", { status: 403 });
    if (!permissions.includes("*") && !permissions.includes("reports.setup")) {
      return new Response("Forbidden", { status: 403 });
    }

    const id = Number((await context.params)?.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid report id" }, { status: 400 });
    }

    const { data: beforeRow, error: beforeErr } = await supabase
      .from("report_master")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (beforeErr) return new Response(beforeErr.message || "Failed to load existing report", { status: 500 });
    if (!beforeRow) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    const body = await request.json();
    const nextVersion = Number(beforeRow.version || 1) + 1;
    const { payload, errors } = normalizeReportPayload(body, { existingVersion: nextVersion });
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("report_master")
      .update({
        ...payload,
        updated_by: user?.id || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      const msg = String(error?.message || "");
      if (/duplicate key/i.test(msg)) {
        return NextResponse.json({ error: "report_key already exists" }, { status: 409 });
      }
      return new Response(msg || "Failed to update report", { status: 500 });
    }

    return NextResponse.json({ ok: true, report: data }, { status: 200 });
  } catch (error) {
    return new Response(error?.message || "Failed to update report", { status: 500 });
  }
}
