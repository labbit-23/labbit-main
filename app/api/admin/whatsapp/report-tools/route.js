import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";
import { phoneVariantsIndia } from "@/lib/phone";
import { getLatestReportUrl, getReportStatus, getReportUrl } from "@/lib/neosoft/client";
import { lookupReportSelection } from "@/lib/neosoft/reportSelection";
import { sendDocumentMessage, sendTextMessage } from "@/lib/whatsapp/sender";

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
    lines.push("This bot sends lab reports only. Radiology reports are usually shared by the lab separately on request.");
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
  const response = NextResponse.next();
  try {
    const sessionData = await getIronSession(request, response, ironOptions);
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
  const response = NextResponse.next();
  try {
    const sessionData = await getIronSession(request, response, ironOptions);
    const user = sessionData?.user;
    if (!user || !canUseWhatsappInbox(user)) {
      return new Response("Forbidden", { status: 403 });
    }

    const body = await request.json();
    const action = String(body?.action || "").trim();
    const phone = String(body?.phone || "").trim();
    const reqid = String(body?.reqid || "").trim();
    const reqno = String(body?.reqno || "").trim();

    if (!phone || !["send_report", "send_status", "send_report_and_status", "preview_status", "send_latest_report"].includes(action)) {
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
    const chatSession = await getChatSessionForPhone(phone, labIds);
    if (!chatSession) return new Response("Session not found", { status: 404 });

    if (action === "send_latest_report") {
      const latestReportUrl = getLatestReportUrl(phone);
      const latestPdfAvailable = await isReachablePdfDocument(latestReportUrl);
      if (!latestPdfAvailable) {
        return new Response("Latest report PDF was not found for this patient.", { status: 400 });
      }

      await sendDocumentMessage({
        labId: chatSession.lab_id,
        phone: chatSession.phone,
        documentUrl: latestReportUrl,
        filename: `SDRC_Latest_Report_${String(phone || "").replace(/\D/g, "").slice(-10) || "Patient"}.pdf`,
        caption: "Please find your latest report attached.",
        sender: {
          id: user.id || null,
          name: user.name || "Agent",
          role: getRoleKey(user) || null,
          userType: user.userType || null
        }
      });

      await supabase
        .from("chat_sessions")
        .update({ unread_count: 0, last_message_at: new Date(), updated_at: new Date() })
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

      await sendDocumentMessage({
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
      .update({ unread_count: 0, last_message_at: new Date(), updated_at: new Date() })
      .eq("id", chatSession.id);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return new Response(err?.message || "Failed to send report tool action", { status: 500 });
  }
}
