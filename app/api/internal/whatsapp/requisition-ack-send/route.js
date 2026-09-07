import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { digitsOnly, toCanonicalIndiaPhone } from "@/lib/phone";
import { getReportStatus } from "@/lib/neosoft/client";
import { sendTemplateMessage } from "@/lib/whatsapp/sender";
import { extractProviderMessageId, logReportDispatch } from "@/lib/reportDispatchLogs";

// Patient "your requisition has been registered" acknowledgement, sent once
// per requisition by report_sender's enqueue-watch loop (see
// enqueue_requisitions_worker._send_requisition_acks). NOT a report — no PDF,
// its own Meta template. Dedup + send + audit all live here so the worker is
// a thin driver.
//
// Template config comes from labs_apis.templates.templates.requisition_ack
// ({ template_name, params_order, language_code }), same shape as
// lib/visitWhatsapp.js's booking templates. params_order names map to:
//   name  -> patient name
//   reqno -> requisition number
//   mrno  -> MRN
//   tests -> a short test summary (lazily fetched from report status only if
//            the template actually asks for it)
//   org_name / date -> passthrough from the request

const REQ_ACK_REPORT_TYPE = "requisition_ack";

function getAuthToken(request) {
  return (
    request.headers.get("x-internal-token") ||
    request.headers.get("x-ingest-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  ).trim();
}

function parseTemplates(templates) {
  if (!templates) return {};
  if (typeof templates === "string") {
    try {
      return JSON.parse(templates);
    } catch {
      return {};
    }
  }
  return typeof templates === "object" ? templates : {};
}

function buildTestSummary(reportStatus) {
  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  const names = tests
    .map((t) => String(t?.TEST_NAME || t?.test_name || "").trim())
    .filter(Boolean);
  if (names.length === 0) {
    const total =
      Number(reportStatus?.lab_total || 0) + Number(reportStatus?.radiology_total || 0);
    return total > 0 ? `${total} test${total === 1 ? "" : "s"}` : "your tests";
  }
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} + ${names.length - 2} more`;
}

export async function POST(request) {
  try {
    const expectedToken =
      process.env.WHATSAPP_INTERNAL_SEND_TOKEN ||
      process.env.WHATSAPP_EXTERNAL_INGEST_TOKEN ||
      "";
    if (!expectedToken || getAuthToken(request) !== expectedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const labId = String(body?.lab_id || process.env.DEFAULT_LAB_ID || "").trim();
    const reqno = String(body?.reqno || "").trim();
    const reqid = String(body?.reqid || "").trim();
    const patientName = String(body?.patient_name || "").trim();
    const phoneRaw = String(body?.phone || "").trim();

    if (!labId || !reqid || !phoneRaw) {
      return NextResponse.json({ error: "Missing lab_id, reqid or phone" }, { status: 400 });
    }
    const digits = digitsOnly(phoneRaw);
    if (!(digits.length === 10 || (digits.length === 12 && digits.startsWith("91")))) {
      return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
    }
    const canonical = toCanonicalIndiaPhone(digits);

    // Dedup — one ack per requisition, ever. reqid has a dedicated index on
    // report_dispatch_logs.
    const { data: prior } = await supabase
      .from("report_dispatch_logs")
      .select("id")
      .eq("reqid", reqid)
      .eq("report_type", REQ_ACK_REPORT_TYPE)
      .eq("status", "success")
      .limit(1)
      .maybeSingle();
    if (prior) {
      return NextResponse.json({ ok: true, skipped: true, reason: "already_acked" }, { status: 200 });
    }

    // Template config
    const { data: waCfg, error: waErr } = await supabase
      .from("labs_apis")
      .select("templates")
      .eq("lab_id", labId)
      .eq("api_name", "whatsapp_outbound")
      .maybeSingle();
    if (waErr) {
      return NextResponse.json({ error: waErr.message }, { status: 500 });
    }
    const templates = parseTemplates(waCfg?.templates);
    const tplCfg =
      templates?.templates?.requisition_ack || templates?.requisition_ack || null;
    const templateName = String(tplCfg?.template_name || tplCfg?.campaign || "").trim();
    if (!tplCfg || !templateName) {
      return NextResponse.json(
        { error: "labs_apis.templates.templates.requisition_ack not configured" },
        { status: 400 }
      );
    }
    const paramsOrder = Array.isArray(tplCfg.params_order) ? tplCfg.params_order : ["name", "reqno"];
    const languageCode = String(tplCfg.language_code || "en").trim() || "en";

    // Only reach for a report-status fetch if the template actually wants tests.
    let testSummary = "";
    if (paramsOrder.includes("tests") && reqno) {
      try {
        testSummary = buildTestSummary(await getReportStatus(reqno));
      } catch {
        testSummary = "your tests";
      }
    }

    const paramMap = {
      name: patientName || "Patient",
      reqno: reqno || reqid,
      mrno: String(body?.mrno || "").trim(),
      tests: testSummary,
      org_name: String(body?.org_name || "").trim(),
      date: String(body?.date || "").trim()
    };
    const orderedParams = paramsOrder.map((k) => paramMap[k] ?? "");

    const dispatchStartedAt = Date.now();
    try {
      const sendResult = await sendTemplateMessage({
        labId,
        phone: canonical,
        templateName,
        languageCode,
        templateParams: orderedParams,
        sender: { name: "Requisition Ack", role: "system", userType: "service" }
      });
      await logReportDispatch({
        labId,
        actorName: "requisition_ack_worker",
        actorRole: "system",
        sourcePage: "requisition_ack",
        action: "send_whatsapp",
        targetMode: "single",
        reqid,
        reqno: reqno || null,
        phone: canonical,
        reportType: REQ_ACK_REPORT_TYPE,
        headerMode: "default",
        status: "success",
        resultCode: "REQ_ACK_SENT",
        resultMessage: "Requisition registration acknowledgement sent",
        providerMessageId: extractProviderMessageId(sendResult),
        requestPayload: { template_name: templateName, params: orderedParams },
        responsePayload: sendResult,
        durationMs: Date.now() - dispatchStartedAt
      });
      return NextResponse.json(
        { ok: true, sent: true, provider_message_id: extractProviderMessageId(sendResult) || null },
        { status: 200 }
      );
    } catch (sendErr) {
      await logReportDispatch({
        labId,
        actorName: "requisition_ack_worker",
        actorRole: "system",
        sourcePage: "requisition_ack",
        action: "send_whatsapp",
        targetMode: "single",
        reqid,
        reqno: reqno || null,
        phone: canonical,
        reportType: REQ_ACK_REPORT_TYPE,
        headerMode: "default",
        status: "failed",
        resultCode: "REQ_ACK_FAILED",
        resultMessage: sendErr?.message || "send failed",
        requestPayload: { template_name: templateName, params: orderedParams },
        durationMs: Date.now() - dispatchStartedAt
      });
      return NextResponse.json({ ok: false, error: sendErr?.message || "send failed" }, { status: 502 });
    }
  } catch (err) {
    return NextResponse.json({ error: err?.message || "Internal error" }, { status: 500 });
  }
}
