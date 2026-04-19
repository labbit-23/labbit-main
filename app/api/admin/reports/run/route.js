import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import {
  buildNormalizedParams,
  canAccessReportRow,
  getReportAdminUser,
  isFormatAllowed,
  normalizeRunPayload,
} from "@/lib/reports/master";

const JASPER_RUN_ENDPOINT = String(process.env.JASPER_RUN_ENDPOINT || "").trim();
const JASPER_RUN_TOKEN = String(process.env.JASPER_RUN_TOKEN || "").trim();

async function executeJasperRun({ report, format, params, actor }) {
  if (!JASPER_RUN_ENDPOINT) {
    return {
      mode: "stub",
      status: "success",
      output: {
        stub: true,
        message: "No JASPER_RUN_ENDPOINT configured. Logged as framework run only."
      }
    };
  }

  const response = await fetch(JASPER_RUN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(JASPER_RUN_TOKEN ? { Authorization: `Bearer ${JASPER_RUN_TOKEN}` } : {})
    },
    body: JSON.stringify({
      report_key: report.report_key,
      report_type: report.report_type,
      jasper_report_name: report.jasper_report_name,
      jasper_file_name: report.jasper_file_name,
      jasper_path: report.jasper_path,
      format,
      params,
      actor: {
        id: actor?.id || null,
        role: actor?.role || null
      }
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Jasper run failed (${response.status})${text ? `: ${text.slice(0, 300)}` : ""}`);
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    const body = await response.json();
    return { mode: "remote", status: "success", output: body };
  }

  return {
    mode: "remote",
    status: "success",
    output: {
      content_type: contentType || "application/octet-stream",
      message: "Remote endpoint returned binary stream. Store-to-disk flow is not configured in this API yet."
    }
  };
}

export async function POST(request) {
  const startedAt = Date.now();
  let runLogId = null;

  try {
    const { user, roleKey, allowed, permissions } = await getReportAdminUser();
    if (!allowed) return new Response("Forbidden", { status: 403 });

    const body = await request.json();
    const runRequest = normalizeRunPayload(body);
    if (!runRequest.reportId && !runRequest.reportKey) {
      return NextResponse.json({ error: "report_id or report_key is required" }, { status: 400 });
    }

    let reportQuery = supabase.from("report_master").select("*").eq("is_active", true).limit(1);
    if (runRequest.reportId) reportQuery = reportQuery.eq("id", runRequest.reportId);
    else reportQuery = reportQuery.eq("report_key", runRequest.reportKey);

    const { data: report, error: reportErr } = await reportQuery.maybeSingle();
    if (reportErr) return new Response(reportErr.message || "Failed to load report", { status: 500 });
    if (!report) return NextResponse.json({ error: "Report not found or inactive" }, { status: 404 });
    if (!canAccessReportRow(report, { roleKey, permissions })) {
      return new Response("Forbidden", { status: 403 });
    }

    if (!isFormatAllowed(report, runRequest.requestedFormat)) {
      return NextResponse.json(
        { error: `${runRequest.requestedFormat} export is disabled for this report` },
        { status: 400 }
      );
    }

    const normalized = buildNormalizedParams(report.param_schema, runRequest.requestParams);
    if (normalized.missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required params: ${normalized.missing.join(", ")}` },
        { status: 400 }
      );
    }

    const { data: runInserted, error: runInsertErr } = await supabase
      .from("report_run_log")
      .insert({
        report_id: report.id,
        report_key: report.report_key,
        report_type: report.report_type,
        requested_format: runRequest.requestedFormat,
        run_mode: runRequest.runMode,
        status: "running",
        actor_user_id: user?.id || null,
        actor_role: roleKey || null,
        source_page: runRequest.sourcePage,
        request_params: runRequest.requestParams,
        normalized_params: normalized.normalized,
        output_meta: {},
        started_at: new Date().toISOString()
      })
      .select("id")
      .single();

    if (runInsertErr) return new Response(runInsertErr.message || "Failed to create run log", { status: 500 });
    runLogId = runInserted?.id || null;

    const execution = await executeJasperRun({
      report,
      format: runRequest.requestedFormat,
      params: normalized.normalized,
      actor: { id: user?.id || null, role: roleKey || null }
    });

    const durationMs = Date.now() - startedAt;
    await supabase
      .from("report_run_log")
      .update({
        status: "success",
        output_meta: execution.output || {},
        finished_at: new Date().toISOString(),
        duration_ms: durationMs
      })
      .eq("id", runLogId);

    return NextResponse.json(
      {
        ok: true,
        run_id: runLogId,
        mode: execution.mode,
        report: {
          id: report.id,
          report_key: report.report_key,
          report_name: report.report_name,
          report_type: report.report_type
        },
        output: execution.output
      },
      { status: 200 }
    );
  } catch (error) {
    if (runLogId) {
      await supabase
        .from("report_run_log")
        .update({
          status: "failed",
          error_message: String(error?.message || "Run failed").slice(0, 2000),
          finished_at: new Date().toISOString(),
          duration_ms: Date.now() - startedAt
        })
        .eq("id", runLogId);
    }
    return new Response(error?.message || "Report run failed", { status: 500 });
  }
}
