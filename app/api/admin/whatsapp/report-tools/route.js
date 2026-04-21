import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
import { digitsOnly, phoneVariantsIndia, toCanonicalIndiaPhone } from "@/lib/phone";
import {
  getLatestReportUrl,
  getReportStatus,
  getReportStatusByReqid,
  getReportUrl,
  getTrendReportUrl
} from "@/lib/neosoft/client";
import { lookupReportSelection } from "@/lib/neosoft/reportSelection";
import { sendTemplateMessage, sendTextMessage } from "@/lib/whatsapp/sender";
import { extractProviderMessageId, logReportDispatch } from "@/lib/reportDispatchLogs";
import { cookies } from "next/headers";

const ALLOWED_EXEC_TYPES = ["admin", "manager", "director"];

function getRoleKey(user) {
  if (!user) return "";
  if (user.userType === "executive") return (user.executiveType || "").toLowerCase();
  return (user.userType || "").toLowerCase();
}

function canUseWhatsappInbox(user) {
  return ALLOWED_EXEC_TYPES.includes(getRoleKey(user));
}

async function getChatSessionForPhone(phone, labIds = []) {
  let sessionQuery = supabase
    .from("chat_sessions")
    .select("*")
    .in("phone", phoneVariantsIndia(phone))
    .order("created_at", { ascending: false })
    .limit(1);

  if (labIds.length > 0) {
    sessionQuery = sessionQuery.in("lab_id", labIds);
  }

  const { data: sessions, error } = await sessionQuery;
  if (error) throw error;
  return sessions?.[0] || null;
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
  const digits = digitsOnly(phone);
  if (!(digits.length === 10 || digits.length === 12)) {
    return { ok: false, error: "Phone must be 10 digits or 12 digits (with country code)." };
  }
  if (digits.length === 12 && !digits.startsWith("91")) {
    return { ok: false, error: "12-digit phone must start with 91." };
  }
  const canonical = toCanonicalIndiaPhone(digits);
  if (!canonical || canonical.length !== 12) {
    return { ok: false, error: "Invalid phone number format." };
  }
  return { ok: true, canonical };
}

function isWithin24Hours(lastInboundAt) {
  if (!lastInboundAt) return false;
  const parsed = new Date(lastInboundAt);
  if (!parsed || Number.isNaN(parsed.getTime())) return false;
  return Date.now() - parsed.getTime() < 24 * 60 * 60 * 1000;
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

function getPendingLabTestNames(reportStatus) {
  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  return tests
    .filter((row) => {
      const groupId = String(getStatusRowValue(row, "GROUPID", "groupid") || "").trim();
      const approvalFlag = String(getStatusRowValue(row, "APPROVEDFLG", "approvedflg") || "").trim();
      const status = String(getStatusRowValue(row, "REPORT_STATUS", "report_status") || "").trim();
      return groupId === "GDEP0001" && approvalFlag !== "1" && status !== "LAB_READY";
    })
    .map((row) => String(getStatusRowValue(row, "TESTNM", "testnm", "test_name", "TEST_NAME") || "").trim())
    .filter(Boolean);
}

function getReadyLabTestKeys(reportStatus) {
  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  const seen = new Set();
  const keys = [];

  for (const row of tests) {
    const groupId = String(getStatusRowValue(row, "GROUPID", "groupid") || "").trim();
    if (groupId !== "GDEP0001") continue;

    const approvalFlag = String(getStatusRowValue(row, "APPROVEDFLG", "approvedflg") || "").trim();
    const status = String(getStatusRowValue(row, "REPORT_STATUS", "report_status") || "").trim();
    if (!(approvalFlag === "1" || status === "LAB_READY")) continue;

    const key =
      String(getStatusRowValue(row, "TESTID", "testid") || "").trim() ||
      String(getStatusRowValue(row, "TESTNM", "testnm", "TEST_NAME", "test_name") || "").trim();

    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }

  return keys;
}

function extractMrnoFromStatus(reportStatus) {
  const topLevel = String(
    getStatusRowValue(reportStatus, "MRNO", "mrno", "CREGNO", "cregno", "UHID", "uhid") || ""
  ).trim();
  if (topLevel) return topLevel;

  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  for (const row of tests) {
    const mrno = String(
      getStatusRowValue(row, "MRNO", "mrno", "CREGNO", "cregno", "UHID", "uhid") || ""
    ).trim();
    if (mrno) return mrno;
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

function buildReportStatusMessage(reportStatus) {
  if (!reportStatus || typeof reportStatus !== "object") return null;

  const overallStatus = String(reportStatus.overall_status || "").trim();
  const labTotal = Number(reportStatus.lab_total || 0);
  const radiologyTotal = Number(reportStatus.radiology_total || 0);
  const radiologyReady = Number(reportStatus.radiology_ready || 0);
  const pendingLabTests = getPendingLabTestNames(reportStatus);
  const lines = [];

  switch (overallStatus) {
    case "FULL_REPORT":
      lines.push("Lab report status: All lab reports are ready.");
      break;
    case "PARTIAL_REPORT":
      lines.push("Lab report status: Partial lab reports are ready.");
      if (pendingLabTests.length > 0) {
        lines.push("");
        lines.push("Pending lab tests:");
        for (const testName of pendingLabTests) {
          lines.push(`- ${testName}`);
        }
      }
      lines.push("");
      lines.push("This PDF includes only the lab reports that are ready now. Please download again later for the full lab PDF once all pending lab reports are ready.");
      break;
    case "LAB_PENDING":
      lines.push("Lab report status: Some lab reports are still pending.");
      if (pendingLabTests.length > 0) {
        lines.push("");
        lines.push("Pending lab tests:");
        for (const testName of pendingLabTests) {
          lines.push(`- ${testName}`);
        }
      }
      break;
    case "NO_REPORT":
      lines.push("Lab report status: Lab reports are not ready yet.");
      break;
    case "NO_LAB_TESTS":
      if (radiologyTotal > 0) {
        lines.push("Lab report status: No lab reports are available for this requisition.");
      } else if (labTotal === 0) {
        return null;
      }
      break;
    default:
      if (pendingLabTests.length > 0) {
        lines.push("Lab report status: Some lab reports are still pending.");
        lines.push("");
        lines.push("Pending lab tests:");
        for (const testName of pendingLabTests) {
          lines.push(`- ${testName}`);
        }
      } else if (overallStatus) {
        lines.push(`Lab report status: ${overallStatus.replace(/_/g, " ").toLowerCase()}.`);
      } else {
        return null;
      }
  }

  if (radiologyTotal > 0) {
    lines.push("");
    if (radiologyReady >= radiologyTotal) {
      lines.push("Radiology status: Radiology reports are ready.");
    } else if (radiologyReady > 0) {
      lines.push(`Radiology status: ${radiologyReady} of ${radiologyTotal} radiology reports are ready.`);
    } else {
      lines.push("Radiology status: Radiology reports are not ready yet.");
    }
  }

  return lines.join("\n").trim() || null;
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

function buildLatestReportCaption(statusMessage) {
  const fallback = "Please find your latest report attached.";
  const text = String(statusMessage || "").trim();
  if (!text) return fallback;
  // Keep caption safely under typical WhatsApp limits.
  return text.length > 900 ? `${text.slice(0, 897)}...` : text;
}

async function isReachablePdfDocument(url) {
  if (!url) return false;

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store"
    });

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

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const sessionData = await getIronSession(cookieStore, ironOptions);
    const user = sessionData?.user;
    if (!user || !canUseWhatsappInbox(user)) {
      return new Response("Forbidden", { status: 403 });
    }

    const phone = String(new URL(request.url).searchParams.get("phone") || "").trim();
    if (!phone) return new Response("Missing phone", { status: 400 });

    const { recentReports } = await lookupReportSelection(phone);
    return NextResponse.json({ reports: recentReports || [] }, { status: 200 });
  } catch (err) {
    return new Response(err?.message || "Failed to load reports", { status: 500 });
  }
}

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const sessionData = await getIronSession(cookieStore, ironOptions);
    const user = sessionData?.user;
    if (!user || !canUseWhatsappInbox(user)) {
      return new Response("Forbidden", { status: 403 });
    }

    const body = await request.json();
    const action = String(body?.action || "").trim();
    const phone = String(body?.phone || "").trim();
    const reqid = String(body?.reqid || "").trim();
    const reqno = String(body?.reqno || "").trim();

    if (!phone || !["send_report", "send_status", "send_report_and_status", "preview_status", "send_latest_report", "send_latest_trend_report", "send_report_template"].includes(action)) {
      return new Response("Invalid request", { status: 400 });
    }

    if (action === "preview_status") {
      if (!reqno) return new Response("Missing reqno", { status: 400 });
      try {
        const reportStatus = await getReportStatus(reqno);
        const statusMessage = buildReportStatusMessage(reportStatus);
        if (!statusMessage) {
          return new Response(`No status message available for requisition ${reqno}`, { status: 400 });
        }
        return NextResponse.json({ ok: true, statusMessage, reqno }, { status: 200 });
      } catch (error) {
        console.error("[admin-report-tools] preview_status failed", {
          reqno,
          error: error?.message || String(error)
        });
        return new Response(
          `Status lookup failed for requisition ${reqno}: ${error?.message || "Unknown NeoSoft error"}`,
          { status: 400 }
        );
      }
    }

    const labIds = Array.isArray(user.labIds) ? user.labIds.filter(Boolean) : [];
    const phoneCheck = validatePhoneForTemplate(phone);
    if (!phoneCheck.ok) {
      return new Response(phoneCheck.error, { status: 400 });
    }
    let chatSession = await getChatSessionForPhone(phoneCheck.canonical, labIds);

    if (action === "send_report_template") {
      const dryRun = Boolean(body?.dry_run);
      const patientName = String(body?.patient_name || "").trim();
      const reportLabel = String(body?.report_label || "").trim();
      const reportSource = String(body?.report_source || "latest_report").trim().toLowerCase();
      const registeredPhoneRaw = String(body?.registered_phone || "").trim();
      const authorizationConfirmed = Boolean(body?.authorization_confirmed);
      const authorizationType = String(body?.authorization_type || "").trim();
      const authorizationEvidence = String(body?.authorization_evidence || "").trim();
      if (!dryRun) {
        if (!patientName) return new Response("Patient name is required", { status: 400 });
        if (!reportLabel) return new Response("Report/tests label is required", { status: 400 });
        if (!authorizationConfirmed) {
          return new Response("Recipient authorization confirmation is required.", { status: 400 });
        }
        if (!authorizationType) {
          return new Response("Confirmation type is required.", { status: 400 });
        }
        if (!authorizationEvidence) {
          return new Response("Confirmation evidence is required.", { status: 400 });
        }
      }

      const within24 = isWithin24Hours(chatSession?.last_user_message_at);
      if (!dryRun && within24) {
        return new Response(
          "This patient is already in 24-hour window. Send free text in the existing chat instead of template.",
          { status: 409 }
        );
      }

      const targetLabId = String(chatSession?.lab_id || labIds[0] || user?.lab_id || user?.labId || "").trim();
      if (!targetLabId) {
        return new Response("Lab scope not found for this user", { status: 400 });
      }

      let templateName = "";
      let languageCode = "en";
      if (!dryRun) {
        const { data: waApiConfig, error: waApiError } = await supabase
          .from("labs_apis")
          .select("templates")
          .eq("lab_id", targetLabId)
          .eq("api_name", "whatsapp_outbound")
          .maybeSingle();
        if (waApiError) {
          return new Response(waApiError?.message || "Failed to load WhatsApp template config", { status: 500 });
        }
        const templates = parseMaybeJson(waApiConfig?.templates);
        templateName = String(templates?.chat_console_settings?.report_send_template_name || "").trim();
        languageCode = String(templates?.chat_console_settings?.report_send_template_language || "en").trim() || "en";
        if (!templateName) {
          return new Response(
            "Missing templates.chat_console_settings.report_send_template_name in labs_apis config",
            { status: 400 }
          );
        }
      }

      let documentUrl = null;
      let filename = "SDRC_Report.pdf";
      let resolvedReqid = null;
      let resolvedReqno = null;
      let resolvedMrno = null;
      let resolvedPatientName = patientName;

      if (reportSource === "latest_report") {
        const registeredCheck = validatePhoneForTemplate(registeredPhoneRaw || phoneCheck.canonical);
        if (!registeredCheck.ok) {
          return new Response("Registered phone must be 10 digits or 12 digits.", { status: 400 });
        }
        documentUrl = getLatestReportUrl(registeredCheck.canonical);
        const latestPdfAvailable = await isReachablePdfDocument(documentUrl);
        if (!latestPdfAvailable) {
          return new Response("Latest report PDF was not found for this registered phone.", { status: 400 });
        }

        try {
          const { recentReports } = await lookupReportSelection(registeredCheck.canonical);
          resolvedReqid = String(recentReports?.[0]?.reqid || "").trim() || null;
          resolvedReqno = String(recentReports?.[0]?.reqno || "").trim() || null;
          resolvedPatientName = String(recentReports?.[0]?.patient_name || resolvedPatientName).trim() || resolvedPatientName;
        } catch (statusError) {
          console.warn("[admin-report-tools] report template lookup skipped", {
            phone: registeredCheck.canonical,
            error: statusError?.message || String(statusError)
          });
        }
      } else if (reportSource === "requisition_report") {
        const rawReqno = String(body?.reqno || "").trim();
        if (!rawReqno) return new Response("Requisition No is required.", { status: 400 });
        let statusByReqno;
        try {
          statusByReqno = await getReportStatus(rawReqno);
        } catch (statusErr) {
          return new Response(`Status lookup failed for requisition ${rawReqno}: ${statusErr?.message || "Unknown NeoSoft error"}`, { status: 400 });
        }
        const reqid = extractReqidFromStatus(statusByReqno);
        if (!reqid) {
          return new Response(`Could not find report mapping for requisition no ${rawReqno}.`, { status: 400 });
        }
        documentUrl = getReportUrl(reqid, { reqno: rawReqno });
        const requisitionPdfAvailable = await isReachablePdfDocument(documentUrl);
        if (!requisitionPdfAvailable) {
          return new Response(`Report PDF was not found for requisition ${rawReqno}.`, { status: 400 });
        }
        resolvedReqid = reqid;
        resolvedReqno = rawReqno;
      } else if (reportSource === "trend_report") {
        const rawMrno = String(body?.mrno || "").trim();
        if (!rawMrno) return new Response("MRNO is required for trend report.", { status: 400 });
        documentUrl = getTrendReportUrl(rawMrno);
        const trendPdfAvailable = await isReachablePdfDocument(documentUrl);
        if (!trendPdfAvailable) {
          return new Response(`Trend report PDF was not found for MRNO ${rawMrno}.`, { status: 400 });
        }
        resolvedMrno = rawMrno;
      } else {
        return new Response("Invalid report source selected.", { status: 400 });
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
        return NextResponse.json(
          {
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
          },
          { status: 200 }
        );
      }

      const sender = {
        id: user.id || null,
        name: user.name || "Agent",
        role: getRoleKey(user) || null,
        userType: user.userType || null
      };
      const templateDispatchStartedAt = Date.now();
      let templateSendResult = null;
      const privacyPayload = {
        manual_privacy_send: true,
        confirmed: true,
        type: authorizationType,
        evidence: authorizationEvidence
      };
      const reportTypeForLog =
        reportSource === "trend_report"
          ? "trend"
          : "combined";

      try {
        templateSendResult = await sendTemplateMessage({
          labId: targetLabId,
          phone: phoneCheck.canonical,
          templateName,
          languageCode,
          templateParams: [patientName, reportLabel],
          sender,
          headerDocumentUrl: documentUrl,
          headerDocumentFilename: filename,
          logPayloadExtra: {
            privacy_authorization: privacyPayload
          }
        });

        await logReportDispatch({
          labId: targetLabId,
          actorUserId: user.id || null,
          actorName: user.name || "Agent",
          actorRole: getRoleKey(user) || null,
          sourcePage: "report_dispatch",
          action: "send_whatsapp",
          targetMode: "single",
          reqid: resolvedReqid,
          reqno: resolvedReqno,
          phone: phoneCheck.canonical,
          reportType: reportTypeForLog,
          headerMode: "default",
          status: "success",
          resultCode: "AGENT_PRIVACY_SEND_OK",
          resultMessage: "Manual report template sent with document header and authorization confirmation",
          providerMessageId: extractProviderMessageId(templateSendResult),
          requestPayload: {
            action: "send_report_template",
            report_source: reportSource,
            document_url: documentUrl,
            registered_phone: registeredPhoneRaw || null,
            mrno: resolvedMrno,
            template_name: templateName,
            template_language: languageCode,
            authorization: privacyPayload
          },
          responsePayload: {
            template_send: templateSendResult
          },
          durationMs: Date.now() - templateDispatchStartedAt,
          documentUrl
        });
      } catch (sendError) {
        await logReportDispatch({
          labId: targetLabId,
          actorUserId: user.id || null,
          actorName: user.name || "Agent",
          actorRole: getRoleKey(user) || null,
          sourcePage: "report_dispatch",
          action: "send_whatsapp",
          targetMode: "single",
          reqid: resolvedReqid,
          reqno: resolvedReqno,
          phone: phoneCheck.canonical,
          reportType: reportTypeForLog,
          headerMode: "default",
          status: "failed",
          resultCode: "AGENT_PRIVACY_SEND_FAILED",
          resultMessage: sendError?.message || "Unknown manual privacy send error",
          requestPayload: {
            action: "send_report_template",
            report_source: reportSource,
            document_url: documentUrl,
            registered_phone: registeredPhoneRaw || null,
            mrno: resolvedMrno,
            template_name: templateName,
            template_language: languageCode,
            authorization: privacyPayload
          },
          responsePayload: {
            template_send: templateSendResult
          },
          durationMs: Date.now() - templateDispatchStartedAt,
          documentUrl
        });
        throw sendError;
      }

      if (chatSession?.id) {
        const nextContext = {
          ...(chatSession.context || {}),
          ever_agent_intervened: true,
          last_handled_by: "agent",
          last_handled_at: new Date().toISOString(),
          suppress_feedback_once: false
        };
        await supabase
          .from("chat_sessions")
          .update({ context: nextContext, last_message_at: new Date(), updated_at: new Date() })
          .eq("id", chatSession.id);
      } else {
        const { data: createdSession, error: createError } = await supabase
          .from("chat_sessions")
          .insert({
            lab_id: targetLabId,
            phone: phoneCheck.canonical,
            patient_name: patientName,
            status: "active",
            current_state: "HUMAN_HANDOVER",
            unread_count: 0,
            context: {
              ever_agent_intervened: true,
              last_handled_by: "agent",
              last_handled_at: new Date().toISOString(),
              suppress_feedback_once: false
            },
            last_message_at: new Date(),
            created_at: new Date(),
            updated_at: new Date()
          })
          .select("*")
          .single();
        if (createError) {
          return new Response(createError?.message || "Failed to create chat session", { status: 500 });
        }
        chatSession = createdSession;
      }

      return NextResponse.json({ ok: true, phone: phoneCheck.canonical }, { status: 200 });
    }

    if (!chatSession) return new Response("Session not found", { status: 404 });
    const agentContext = {
      ...(chatSession.context || {}),
      ever_agent_intervened: true,
      last_handled_by: "agent",
      last_handled_at: new Date().toISOString(),
      suppress_feedback_once: false
    };

    if (action === "send_latest_report") {
      const latestReportUrl = getLatestReportUrl(phone);
      const latestPdfAvailable = await isReachablePdfDocument(latestReportUrl);
      if (!latestPdfAvailable) {
        return new Response("Latest report PDF was not found for this patient.", { status: 400 });
      }

      let latestStatusMessage = null;
      let latestReqid = null;
      let latestReqno = null;
      let latestPatientName = "";
      let latestReadyLabTestKeys = [];
      try {
        const { recentReports } = await lookupReportSelection(phone);
        latestReqid = String(recentReports?.[0]?.reqid || "").trim() || null;
        latestReqno = String(recentReports?.[0]?.reqno || "").trim() || null;
        latestPatientName = String(recentReports?.[0]?.patient_name || "").trim();
        if (latestReqno) {
          const reportStatus = await getReportStatus(latestReqno);
          latestStatusMessage = buildReportStatusMessage(reportStatus);
          latestReadyLabTestKeys = getReadyLabTestKeys(reportStatus);
        }
      } catch (statusError) {
        // Non-blocking: latest report send should still proceed.
        console.warn("[admin-report-tools] latest status lookup skipped", {
          phone,
          error: statusError?.message || String(statusError)
        });
      }

      const latestDispatchStartedAt = Date.now();
      try {
        const sendResult = await sendDocumentMessage({
          labId: chatSession.lab_id,
          phone: chatSession.phone,
          documentUrl: latestReportUrl,
          filename: buildReportFilename({
            reqid: latestReqid || null,
            reqno: latestReqno || null,
            patient_name: latestPatientName || ""
          }),
          caption: buildLatestReportCaption(latestStatusMessage),
          sender: {
            id: user.id || null,
            name: user.name || "Agent",
            role: getRoleKey(user) || null,
            userType: user.userType || null
          }
        });
        await logReportDispatch({
          labId: chatSession.lab_id,
          actorUserId: user.id || null,
          actorName: user.name || "Agent",
          actorRole: getRoleKey(user) || null,
          sourcePage: "report_dispatch",
          action: "send_whatsapp",
          targetMode: "single",
          reqid: latestReqid,
          reqno: latestReqno,
          phone: chatSession.phone,
          reportType: "combined",
          headerMode: "default",
          status: "success",
          resultCode: "AGENT_SEND_OK",
          resultMessage: "Latest report sent from inbox tools",
          providerMessageId: extractProviderMessageId(sendResult),
          requestPayload: {
            action,
            document_url: latestReportUrl,
            ready_lab_test_keys: latestReadyLabTestKeys
          },
          responsePayload: sendResult,
          durationMs: Date.now() - latestDispatchStartedAt,
          documentUrl: latestReportUrl
        });
      } catch (sendError) {
        await logReportDispatch({
          labId: chatSession.lab_id,
          actorUserId: user.id || null,
          actorName: user.name || "Agent",
          actorRole: getRoleKey(user) || null,
          sourcePage: "report_dispatch",
          action: "send_whatsapp",
          targetMode: "single",
          reqid: latestReqid,
          reqno: latestReqno,
          phone: chatSession.phone,
          reportType: "combined",
          headerMode: "default",
          status: "failed",
          resultCode: "AGENT_SEND_FAILED",
          resultMessage: sendError?.message || "Unknown send error",
          requestPayload: {
            action,
            document_url: latestReportUrl,
            ready_lab_test_keys: latestReadyLabTestKeys
          },
          durationMs: Date.now() - latestDispatchStartedAt,
          documentUrl: latestReportUrl
        });
        throw sendError;
      }

      await supabase
        .from("chat_sessions")
        .update({ context: agentContext, last_message_at: new Date(), updated_at: new Date() })
        .eq("id", chatSession.id);

      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (action === "send_latest_trend_report") {
      let latestReqid = null;
      let latestReqno = null;
      let mrno = null;

      try {
        const { recentReports } = await lookupReportSelection(phone);
        latestReqid = String(recentReports?.[0]?.reqid || "").trim() || null;
        latestReqno = String(recentReports?.[0]?.reqno || "").trim() || null;
        mrno = String(recentReports?.[0]?.mrno || "").trim() || null;
        if (!latestReqno) {
          return new Response("No requisition found for latest trend report.", { status: 400 });
        }
        if (!mrno) {
          const reportStatus = await getReportStatus(latestReqno);
          mrno = extractMrnoFromStatus(reportStatus);
        }
        if (!mrno && latestReqid) {
          const reportStatusByReqid = await getReportStatusByReqid(latestReqid);
          mrno = extractMrnoFromStatus(reportStatusByReqid);
        }
      } catch (statusError) {
        return new Response(
          `Trend report lookup failed: ${statusError?.message || "Unknown NeoSoft error"}`,
          { status: 400 }
        );
      }

      if (!mrno) {
        return new Response("No MRNO found to generate trend report.", { status: 400 });
      }

      const trendUrl = getTrendReportUrl(mrno);
      const trendPdfAvailable = await isReachablePdfDocument(trendUrl);
      if (!trendPdfAvailable) {
        return new Response("Trend report PDF was not found for this patient.", { status: 400 });
      }

      const trendDispatchStartedAt = Date.now();
      try {
        const sendResult = await sendDocumentMessage({
          labId: chatSession.lab_id,
          phone: chatSession.phone,
          documentUrl: trendUrl,
          filename: `SDRC_Trend_Report_${mrno}.pdf`,
          caption: "Please find your trend report attached.",
          sender: {
            id: user.id || null,
            name: user.name || "Agent",
            role: getRoleKey(user) || null,
            userType: user.userType || null
          }
        });
        await logReportDispatch({
          labId: chatSession.lab_id,
          actorUserId: user.id || null,
          actorName: user.name || "Agent",
          actorRole: getRoleKey(user) || null,
          sourcePage: "report_dispatch",
          action: "send_whatsapp",
          targetMode: "single",
          reqid: latestReqid,
          reqno: latestReqno,
          phone: chatSession.phone,
          reportType: "trend",
          headerMode: "default",
          status: "success",
          resultCode: "AGENT_TREND_SEND_OK",
          resultMessage: "Latest trend report sent from inbox tools",
          providerMessageId: extractProviderMessageId(sendResult),
          requestPayload: {
            action,
            mrno,
            document_url: trendUrl
          },
          responsePayload: sendResult,
          durationMs: Date.now() - trendDispatchStartedAt,
          documentUrl: trendUrl
        });
      } catch (sendError) {
        await logReportDispatch({
          labId: chatSession.lab_id,
          actorUserId: user.id || null,
          actorName: user.name || "Agent",
          actorRole: getRoleKey(user) || null,
          sourcePage: "report_dispatch",
          action: "send_whatsapp",
          targetMode: "single",
          reqid: latestReqid,
          reqno: latestReqno,
          phone: chatSession.phone,
          reportType: "trend",
          headerMode: "default",
          status: "failed",
          resultCode: "AGENT_TREND_SEND_FAILED",
          resultMessage: sendError?.message || "Unknown trend send error",
          requestPayload: {
            action,
            mrno,
            document_url: trendUrl
          },
          durationMs: Date.now() - trendDispatchStartedAt,
          documentUrl: trendUrl
        });
        throw sendError;
      }

      await supabase
        .from("chat_sessions")
        .update({ context: agentContext, last_message_at: new Date(), updated_at: new Date() })
        .eq("id", chatSession.id);

      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (action === "send_report" || action === "send_report_and_status") {
      if (!reqid) return new Response("Missing reqid", { status: 400 });
      const reportUrl = getReportUrl(reqid);
      const reportPdfAvailable = await isReachablePdfDocument(reportUrl);
      if (!reportPdfAvailable) {
        return new Response(`Report PDF was not found for requisition ${reqid}.`, { status: 400 });
      }

      const reportDispatchStartedAt = Date.now();
      let readyLabTestKeys = [];
      if (reqno) {
        try {
          const reportStatus = await getReportStatus(reqno);
          readyLabTestKeys = getReadyLabTestKeys(reportStatus);
        } catch (statusErr) {
          console.warn("[admin-report-tools] send_report test breakup lookup skipped", {
            reqno,
            error: statusErr?.message || String(statusErr)
          });
        }
      }
      try {
        const sendResult = await sendDocumentMessage({
          labId: chatSession.lab_id,
          phone: chatSession.phone,
          documentUrl: reportUrl,
          filename: buildReportFilename({ reqid, reqno, patient_name: body?.patient_name || "" }),
          caption: "Please find your report attached.",
          sender: {
            id: user.id || null,
            name: user.name || "Agent",
            role: getRoleKey(user) || null,
            userType: user.userType || null
          }
        });
        await logReportDispatch({
          labId: chatSession.lab_id,
          actorUserId: user.id || null,
          actorName: user.name || "Agent",
          actorRole: getRoleKey(user) || null,
          sourcePage: "report_dispatch",
          action: "send_whatsapp",
          targetMode: "single",
          reqid,
          reqno: reqno || null,
          phone: chatSession.phone,
          reportType: "combined",
          headerMode: "default",
          status: "success",
          resultCode: "AGENT_SEND_OK",
          resultMessage: "Report sent from inbox tools",
          providerMessageId: extractProviderMessageId(sendResult),
          requestPayload: {
            action,
            document_url: reportUrl,
            ready_lab_test_keys: readyLabTestKeys
          },
          responsePayload: sendResult,
          durationMs: Date.now() - reportDispatchStartedAt,
          documentUrl: reportUrl
        });
      } catch (sendError) {
        await logReportDispatch({
          labId: chatSession.lab_id,
          actorUserId: user.id || null,
          actorName: user.name || "Agent",
          actorRole: getRoleKey(user) || null,
          sourcePage: "report_dispatch",
          action: "send_whatsapp",
          targetMode: "single",
          reqid,
          reqno: reqno || null,
          phone: chatSession.phone,
          reportType: "combined",
          headerMode: "default",
          status: "failed",
          resultCode: "AGENT_SEND_FAILED",
          resultMessage: sendError?.message || "Unknown send error",
          requestPayload: {
            action,
            document_url: reportUrl,
            ready_lab_test_keys: readyLabTestKeys
          },
          durationMs: Date.now() - reportDispatchStartedAt,
          documentUrl: reportUrl
        });
        throw sendError;
      }
    }

    if (action === "send_status" || action === "send_report_and_status") {
      if (!reqno) return new Response("Missing reqno", { status: 400 });
      let statusMessage = null;
      try {
        const reportStatus = await getReportStatus(reqno);
        statusMessage = buildReportStatusMessage(reportStatus);
      } catch (error) {
        console.error("[admin-report-tools] send_status failed", {
          reqno,
          error: error?.message || String(error)
        });
        return new Response(
          `Status lookup failed for requisition ${reqno}: ${error?.message || "Unknown NeoSoft error"}`,
          { status: 400 }
        );
      }
      if (!statusMessage) {
        return new Response(`No status message available for requisition ${reqno}`, { status: 400 });
      }
      await sendTextMessage({
        labId: chatSession.lab_id,
        phone: chatSession.phone,
        text: statusMessage,
        sender: {
          id: user.id || null,
          name: user.name || "Agent",
          role: getRoleKey(user) || null,
          userType: user.userType || null
        }
      });
    }

    await supabase
      .from("chat_sessions")
      .update({ context: agentContext, last_message_at: new Date(), updated_at: new Date() })
      .eq("id", chatSession.id);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return new Response(err?.message || "Failed to send report tool action", { status: 500 });
  }
}
