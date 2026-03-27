import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { ironOptions } from "@/lib/session";
import { getRadiologyReportUrl, getReportStatus, getReportUrl, getReportsUrl } from "@/lib/neosoft/client";
import { logReportDispatch } from "@/lib/reportDispatchLogs";

const ALLOWED_EXEC_TYPES = ["admin", "manager", "director"];

function getRoleKey(user) {
  if (!user) return "";
  if (user.userType === "executive") return (user.executiveType || "").toLowerCase();
  return (user.userType || "").toLowerCase();
}

function canUseReportDispatch(user) {
  return ALLOWED_EXEC_TYPES.includes(getRoleKey(user));
}

function extractReqidFromStatus(reportStatus) {
  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  for (const row of tests) {
    const reqid = String(row?.REQID || row?.reqid || "").trim();
    if (reqid) return reqid;
  }
  return null;
}

function safeFilenamePart(value, fallback = "REPORT") {
  const cleaned = String(value || "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

export async function GET(request) {
  const startedAt = Date.now();
  try {
    const cookieStore = await cookies();
    const sessionData = await getIronSession(cookieStore, ironOptions);
    const user = sessionData?.user;
    if (!user || !canUseReportDispatch(user)) {
      return new Response("Forbidden", { status: 403 });
    }

    const url = new URL(request.url);
    let reqid = String(url.searchParams.get("reqid") || "").trim();
    const reqno = String(url.searchParams.get("reqno") || "").trim() || null;
    const patientName = String(url.searchParams.get("patient_name") || "").trim() || null;
    const mode = String(url.searchParams.get("mode") || "preview").trim().toLowerCase();
    const reportScope = String(url.searchParams.get("report_scope") || "all").trim().toLowerCase();
    const headerMode = String(url.searchParams.get("header_mode") || "plain").trim().toLowerCase() === "default"
      ? "default"
      : "plain";
    const printtype = String(url.searchParams.get("printtype") || "1").trim() === "0" ? 0 : 1;

    if (!reqid && reqno) {
      try {
        const statusByReqno = await getReportStatus(reqno);
        reqid = extractReqidFromStatus(statusByReqno) || reqid;
      } catch {
        // best effort
      }
    }

    if (!reqid) {
      return new Response("Missing reqid or resolvable reqno", { status: 400 });
    }

    const isPlain = headerMode === "plain";
    const resolvedLabId =
      (Array.isArray(user?.labIds) ? String(user.labIds[0] || "").trim() : "") ||
      String(process.env.DEFAULT_LAB_ID || "").trim() ||
      null;
    const actorRole = getRoleKey(user) || null;
    const action = mode === "download" ? "download" : "print";
    const commonFlags = {
      chkrephead: isPlain ? "0" : "1",
      header_mode: isPlain ? "plain" : "default",
      without_header_background: isPlain ? "true" : "false"
    };
    const reportUrl = reportScope === "lab"
      ? getReportUrl(reqid, {
          reqno,
          printtype,
          ...commonFlags
        })
      : reportScope === "radiology"
        ? getRadiologyReportUrl(reqid, commonFlags)
        : getReportsUrl(reqid, reqno, {
            printtype,
            ...commonFlags
          });
    const reportType = reportScope === "lab" ? "lab" : reportScope === "radiology" ? "radiology" : "combined";

    const upstream = await fetch(reportUrl, { method: "GET", cache: "no-store" });
    const bytes = await upstream.arrayBuffer();
    const contentType = String(upstream.headers.get("content-type") || "application/pdf");

    if (!upstream.ok) {
      await logReportDispatch({
        labId: resolvedLabId,
        actorUserId: user?.id || null,
        actorName: user?.name || "Admin",
        actorRole,
        sourcePage: "report_dispatch",
        action,
        targetMode: "single",
        reqid,
        reqno,
        reportType,
        headerMode,
        status: "failed",
        resultCode: "ADMIN_DOCUMENT_FETCH_FAILED",
        resultMessage: `Upstream returned ${upstream.status}`,
        requestPayload: {
          mode,
          report_scope: reportScope,
          printtype,
          report_url: reportUrl
        },
        responsePayload: {
          status: upstream.status,
          content_type: contentType,
          bytes: bytes.byteLength
        },
        durationMs: Date.now() - startedAt,
        documentUrl: reportUrl
      });
      return new Response(bytes, {
        status: upstream.status,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-store"
        }
      });
    }

    const fileReq = safeFilenamePart(reqno || reqid || "REPORT", "REPORT");
    const filePatient = safeFilenamePart(patientName || "PATIENT", "PATIENT");
    const scopePart = safeFilenamePart(reportScope.toUpperCase(), "ALL");
    const fileName = `${fileReq} ${filePatient} ${scopePart}.pdf`;
    const disposition =
      mode === "download"
        ? `attachment; filename="${fileName}"`
        : `inline; filename="${fileName}"`;

    await logReportDispatch({
      labId: resolvedLabId,
      actorUserId: user?.id || null,
      actorName: user?.name || "Admin",
      actorRole,
      sourcePage: "report_dispatch",
      action,
      targetMode: "single",
      reqid,
      reqno,
      reportType,
      headerMode,
      status: "success",
      resultCode: mode === "download" ? "ADMIN_DOWNLOAD_OK" : "ADMIN_PREVIEW_OK",
      resultMessage: mode === "download" ? "Report downloaded from dispatcher" : "Report preview opened from dispatcher",
      requestPayload: {
        mode,
        report_scope: reportScope,
        printtype,
        report_url: reportUrl
      },
      responsePayload: {
        status: upstream.status,
        content_type: contentType,
        bytes: bytes.byteLength
      },
      durationMs: Date.now() - startedAt,
      documentUrl: reportUrl
    });

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return new Response(error?.message || "Failed to fetch report document", { status: 500 });
  }
}
