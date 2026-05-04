import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { digitsOnly, toCanonicalIndiaPhone } from "@/lib/phone";
import {
  getLatestReportUrl,
  getReportStatus,
  getReportUrl,
  getTrendReportUrl
} from "@/lib/neosoft/client";
import { lookupReportSelection } from "@/lib/neosoft/reportSelection";
import { sendTemplateMessage } from "@/lib/whatsapp/sender";
import { extractProviderMessageId, logReportDispatch } from "@/lib/reportDispatchLogs";

function getAuthToken(request) {
  return (
    request.headers.get("x-ingest-token") ||
    request.headers.get("x-internal-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  ).trim();
}

function parseMaybeJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return {};
}

function validatePhoneForTemplate(phone) {
  const clean = digitsOnly(phone);
  if (!(clean.length === 10 || clean.length === 12)) {
    return { ok: false, error: "Phone must be 10 digits or 12 digits (with country code)." };
  }
  if (clean.length === 12 && !clean.startsWith("91")) {
    return { ok: false, error: "12-digit phone must start with 91." };
  }
  const canonical = toCanonicalIndiaPhone(clean);
  if (!canonical || canonical.length !== 12) {
    return { ok: false, error: "Invalid phone number format." };
  }
  return { ok: true, canonical };
}

function getStatusRowValue(row, ...keys) {
  if (!row || typeof row !== "object") return null;
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
    const lowerKey = String(key).toLowerCase();
    const match = Object.keys(row).find((candidate) => String(candidate).toLowerCase() === lowerKey);
    if (match && row[match] !== undefined && row[match] !== null) return row[match];
  }
  return null;
}

function extractReqidFromStatus(reportStatus) {
  const topLevel = String(
    getStatusRowValue(reportStatus, "REQID", "reqid", "REQ_ID", "req_id", "REQUISITIONID", "requisitionid") || ""
  ).trim();
  if (topLevel) return topLevel;

  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  for (const row of tests) {
    const reqid = String(
      getStatusRowValue(row, "REQID", "reqid", "REQ_ID", "req_id", "REQUISITIONID", "requisitionid") || ""
    ).trim();
    if (reqid) return reqid;
  }
  return null;
}

function buildReportFilename(report) {
  const reqid = String(report?.reqid || "").trim();
  const reqno = String(report?.reqno || reqid).trim();
  const firstName = String(report?.patient_name || "Patient")
    .replace(/^(DR\.?|MR\.?|MRS\.?|MS\.?|CAPT\.?|COL\.?|LT\.?|MAJ\.?|PROF\.?)\s+/i, "")
    .split(/\s+/)[0]
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase() || "PATIENT";
  return `SDRC_Report_${reqno}_${firstName}.pdf`;
}

async function isReachablePdfDocument(url) {
  if (!url) return false;
  try {
    const response = await fetch(url, { method: "GET", redirect: "follow", cache: "no-store" });
    if (!response.ok) return false;
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/pdf")) return true;
    const contentDisposition = String(response.headers.get("content-disposition") || "").toLowerCase();
    if (contentDisposition.includes(".pdf")) return true;
    return false;
  } catch {
    return false;
  }
}

export async function POST(request) {
  try {
    const expectedToken =
      process.env.WHATSAPP_INTERNAL_SEND_TOKEN ||
      process.env.WHATSAPP_EXTERNAL_INGEST_TOKEN ||
      "";
    const providedToken = getAuthToken(request);
    if (!expectedToken || providedToken !== expectedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const dryRun = Boolean(body?.dry_run);
    const labId = String(body?.lab_id || process.env.DEFAULT_LAB_ID || "").trim();
    const phone = String(body?.phone || "").trim();
    const patientName = String(body?.patient_name || "").trim();
    const reportLabel = String(body?.report_label || "").trim();
    const reportSource = String(body?.report_source || "latest_report").trim().toLowerCase();
    const registeredPhoneRaw = String(body?.registered_phone || "").trim();
    const authorizationConfirmed = Boolean(body?.authorization_confirmed);
    const authorizationType = String(body?.authorization_type || "").trim();
    const authorizationEvidence = String(body?.authorization_evidence || "").trim();

    if (!labId || !phone) return new Response("Missing lab_id or phone", { status: 400 });
    if (!dryRun) {
      if (!patientName) return new Response("Patient name is required", { status: 400 });
      if (!reportLabel) return new Response("Report/tests label is required", { status: 400 });
    }

    const phoneCheck = validatePhoneForTemplate(phone);
    if (!phoneCheck.ok) return new Response(phoneCheck.error, { status: 400 });

    const { data: waApiConfig, error: waApiError } = await supabase
      .from("labs_apis")
      .select("templates")
      .eq("lab_id", labId)
      .eq("api_name", "whatsapp_outbound")
      .maybeSingle();
    if (waApiError) {
      return new Response(waApiError?.message || "Failed to load WhatsApp template config", { status: 500 });
    }

    const templates = parseMaybeJson(waApiConfig?.templates);
    const templateName = String(templates?.chat_console_settings?.report_send_template_name || "").trim();
    const languageCode = String(templates?.chat_console_settings?.report_send_template_language || "en").trim() || "en";
    if (!templateName) {
      return new Response("Missing templates.chat_console_settings.report_send_template_name in labs_apis config", { status: 400 });
    }

    let documentUrl = null;
    let filename = "SDRC_Report.pdf";
    let resolvedReqid = null;
    let resolvedReqno = null;
    let resolvedMrno = null;
    let resolvedPatientName = patientName;
    let authorizationRequired = false;

    if (reportSource === "latest_report") {
      const registeredCheck = validatePhoneForTemplate(registeredPhoneRaw || phoneCheck.canonical);
      if (!registeredCheck.ok) return new Response("Registered phone must be 10 digits or 12 digits.", { status: 400 });
      authorizationRequired = phoneCheck.canonical !== registeredCheck.canonical;
      documentUrl = getLatestReportUrl(registeredCheck.canonical);
      if (!(await isReachablePdfDocument(documentUrl))) {
        return new Response("Latest report PDF was not found for this registered phone.", { status: 400 });
      }
      try {
        const { recentReports } = await lookupReportSelection(registeredCheck.canonical);
        resolvedReqid = String(recentReports?.[0]?.reqid || "").trim() || null;
        resolvedReqno = String(recentReports?.[0]?.reqno || "").trim() || null;
        resolvedPatientName = String(recentReports?.[0]?.patient_name || resolvedPatientName).trim() || resolvedPatientName;
      } catch {
        // non-blocking
      }
    } else if (reportSource === "requisition_report") {
      const rawReqno = String(body?.reqno || "").trim();
      if (!rawReqno) return new Response("Requisition No is required.", { status: 400 });
      const statusByReqno = await getReportStatus(rawReqno);
      const reqid = extractReqidFromStatus(statusByReqno);
      if (!reqid) return new Response(`Could not find report mapping for requisition no ${rawReqno}.`, { status: 400 });
      documentUrl = getReportUrl(reqid, { reqno: rawReqno });
      if (!(await isReachablePdfDocument(documentUrl))) {
        return new Response(`Report PDF was not found for requisition ${rawReqno}.`, { status: 400 });
      }
      resolvedReqid = reqid;
      resolvedReqno = rawReqno;
    } else if (reportSource === "trend_report") {
      const rawMrno = String(body?.mrno || "").trim();
      if (!rawMrno) return new Response("MRNO is required for trend report.", { status: 400 });
      documentUrl = getTrendReportUrl(rawMrno);
      if (!(await isReachablePdfDocument(documentUrl))) {
        return new Response(`Trend report PDF was not found for MRNO ${rawMrno}.`, { status: 400 });
      }
      resolvedMrno = rawMrno;
    } else {
      return new Response("Invalid report source selected.", { status: 400 });
    }

    if (!dryRun && authorizationRequired) {
      if (!authorizationConfirmed) return new Response("Recipient authorization confirmation is required.", { status: 400 });
      if (!authorizationType) return new Response("Confirmation type is required.", { status: 400 });
      if (!authorizationEvidence) return new Response("Confirmation evidence is required.", { status: 400 });
    }

    if (reportSource === "trend_report") {
      filename = `SDRC_Trend_Report_${resolvedMrno || "Patient"}.pdf`;
    } else {
      filename = buildReportFilename({
        reqid: resolvedReqid || null,
        reqno: resolvedReqno || null,
        patient_name: resolvedPatientName || patientName || ""
      });
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        source: reportSource,
        resolved: {
          reqid: resolvedReqid,
          reqno: resolvedReqno,
          mrno: resolvedMrno,
          patient_name: resolvedPatientName || null,
          filename,
          phone: phoneCheck.canonical
        }
      }, { status: 200 });
    }

    const templateSendResult = await sendTemplateMessage({
      labId,
      phone: phoneCheck.canonical,
      templateName,
      languageCode,
      templateParams: [patientName, reportLabel],
      sender: {
        id: null,
        name: "Internal Worker",
        role: "system",
        userType: "service",
        source_service: String(body?.source_service || "report_sender_worker")
      },
      headerDocumentUrl: documentUrl,
      headerDocumentFilename: filename,
      logPayloadExtra: {
        privacy_authorization: {
          manual_privacy_send: true,
          required: authorizationRequired,
          confirmed: authorizationRequired ? true : false,
          type: authorizationRequired ? authorizationType : "",
          evidence: authorizationRequired ? authorizationEvidence : ""
        }
      }
    });

    await logReportDispatch({
      labId,
      actorName: String(body?.source_service || "report_sender_worker"),
      actorRole: "system",
      sourcePage: "report_dispatch",
      action: "send_whatsapp",
      targetMode: "single",
      reqid: resolvedReqid,
      reqno: resolvedReqno,
      phone: phoneCheck.canonical,
      reportType: reportSource === "trend_report" ? "trend" : "combined",
      headerMode: "default",
      status: "success",
      resultCode: "INTERNAL_PRIVACY_SEND_OK",
      resultMessage: "Internal report template sent with document header",
      providerMessageId: extractProviderMessageId(templateSendResult),
      requestPayload: {
        action: "send_report_template",
        report_source: reportSource,
        document_url: documentUrl,
        registered_phone: registeredPhoneRaw || null,
        mrno: resolvedMrno,
        template_name: templateName,
        template_language: languageCode
      },
      responsePayload: { template_send: templateSendResult },
      durationMs: null,
      documentUrl
    });

    return NextResponse.json(
      {
        ok: true,
        phone: phoneCheck.canonical,
        provider_message_id: extractProviderMessageId(templateSendResult),
        provider_response: templateSendResult
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[internal/whatsapp/report-template-send] error", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
