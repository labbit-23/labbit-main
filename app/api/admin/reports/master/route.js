import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { canAccessReportRow, getReportAdminUser, normalizeReportPayload, normalizeReportType } from "@/lib/reports/master";

export async function GET(request) {
  try {
    const { allowed, roleKey, permissions } = await getReportAdminUser();
    if (!allowed) return new Response("Forbidden", { status: 403 });
    const hasPermission = (perm) =>
      permissions.includes("*") || permissions.includes(String(perm || ""));

    const url = new URL(request.url);
    const onlyActive = ["1", "true", "yes"].includes(String(url.searchParams.get("active") || "").toLowerCase());
    const typeFilter = normalizeReportType(url.searchParams.get("report_type"));

    if (onlyActive) {
      const canRunAny = hasPermission("reports.run.mis") || hasPermission("reports.run.transaction") || hasPermission("reports.setup");
      if (!canRunAny) return new Response("Forbidden", { status: 403 });
    } else if (!hasPermission("reports.setup")) {
      return new Response("Forbidden", { status: 403 });
    }

    let query = supabase
      .from("report_master")
      .select("*")
      .order("report_type", { ascending: true })
      .order("report_name", { ascending: true });

    if (onlyActive) query = query.eq("is_active", true);
    if (typeFilter) query = query.eq("report_type", typeFilter);

    const { data, error } = await query;
    if (error) return new Response(error.message || "Failed to load report master", { status: 500 });
    const rows = Array.isArray(data) ? data : [];
    const filtered = onlyActive
      ? rows.filter((row) => canAccessReportRow(row, { roleKey, permissions }))
      : rows;

    return NextResponse.json({ ok: true, reports: filtered }, { status: 200 });
  } catch (error) {
    return new Response(error?.message || "Failed to load report master", { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { user, allowed, permissions } = await getReportAdminUser();
    if (!allowed) return new Response("Forbidden", { status: 403 });
    if (!permissions.includes("*") && !permissions.includes("reports.setup")) {
      return new Response("Forbidden", { status: 403 });
    }

    const body = await request.json();
    const { payload, errors } = normalizeReportPayload(body);
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    const row = {
      ...payload,
      created_by: user?.id || null,
      updated_by: user?.id || null
    };

    const { data, error } = await supabase
      .from("report_master")
      .insert(row)
      .select("*")
      .single();

    if (error) {
      const msg = String(error?.message || "");
      if (/duplicate key/i.test(msg)) {
        return NextResponse.json({ error: "report_key already exists" }, { status: 409 });
      }
      return new Response(msg || "Failed to create report", { status: 500 });
    }

    return NextResponse.json({ ok: true, report: data }, { status: 201 });
  } catch (error) {
    return new Response(error?.message || "Failed to create report", { status: 500 });
  }
}
