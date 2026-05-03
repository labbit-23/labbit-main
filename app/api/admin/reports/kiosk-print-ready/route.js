import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { kioskIronOptions } from "@/lib/kioskSession";
import { getReportUrl, getReportsUrl, getRadiologyReportUrl } from "@/lib/neosoft/client";
import { logReportDispatch } from "@/lib/reportDispatchLogs";
import { cookies } from "next/headers";

const ALLOWED_EXEC_TYPES = ["admin", "manager", "director"];
const FETCH_TIMEOUT_MS = 25000;

function getRoleKey(user) {
  if (!user) return "";
  if (user.userType === "executive") return (user.executiveType || "").toLowerCase();
  return (user.userType || "").toLowerCase();
}

function canUseReportDispatch(user) {
  return ALLOWED_EXEC_TYPES.includes(getRoleKey(user));
}

function toHeaderFlag(headerMode) {
  return String(headerMode || "").trim().toLowerCase() === "default" ? "1" : "0";
}

async function fetchPdf(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: "GET", cache: "no-store", signal: controller.signal });
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const bytes = await response.arrayBuffer();
    return { response, contentType, bytes };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request) {
  const startedAt = Date.now();
  try {
    const cookieStore = await cookies();
    const sessionData = await getIronSession(cookieStore, ironOptions);
    const kioskSession = await getIronSession(cookieStore, kioskIronOptions);
    const user = sessionData?.user;
    const kioskUser = kioskSession?.kioskUser;
    const isKioskAuth = Boolean(kioskUser?.authenticated);
    if ((!user || !canUseReportDispatch(user)) && !isKioskAuth) {
      return new Response("Forbidden", { status: 403 });
    }

    const body = await request.json();
    const source = String(body?.source || request.headers.get("x-report-source") || "").trim().toLowerCase();
    if (source !== "kiosk") {
      return NextResponse.json(
        {
          ok: false,
          code: "KIOSK_ONLY_ENDPOINT",
          message: "Kiosk print-ready endpoint is available only for kiosk dispatch flow."
        },
        { status: 403 }
      );
    }

    const reqid = String(body?.reqid || "").trim();
    const reqno = String(body?.reqno || "").trim() || null;
    const headerMode = "plain";
    const labId = String(body?.lab_id || "").trim() || null;
    const phone = String(body?.phone || "").trim() || null;
    const readyLabTestKeys = Array.isArray(body?.ready_lab_test_keys) ? body.ready_lab_test_keys : [];
    const reportScope = String(body?.report_scope || "lab").trim().toLowerCase();

    const actorId = user?.id || null;
    const actorName = user?.name || kioskUser?.username || "Kiosk Dispatcher";
    const actorRole = user ? getRoleKey(user) || null : "kiosk_dispatcher";
    const resolvedLabId =
      labId ||
      kioskUser?.labId ||
      (Array.isArray(user?.labIds) ? String(user.labIds[0] || "").trim() : "") ||
      String(process.env.DEFAULT_LAB_ID || "").trim() ||
      null;

    if (!reqid) {
      return new Response("Missing reqid", { status: 400 });
    }

    const commonFlags = {
      chkrephead: toHeaderFlag(headerMode),
      header_mode: "plain",
      without_header_background: "true"
    };
    const reportUrl =
      reportScope === "radiology"
        ? getRadiologyReportUrl(reqid, commonFlags)
        : reportScope === "all"
          ? getReportUrl(reqid, { reqno, printtype: 1, ...commonFlags })
          : getReportsUrl(reqid, reqno, { printtype: 1, ...commonFlags });
    const reportType = reportScope === "radiology" ? "radiology" : reportScope === "all" ? "combined" : "lab";

    let fetchResult;
    try {
      fetchResult = await fetchPdf(reportUrl);
    } catch (fetchError) {
      await logReportDispatch({
        labId: resolvedLabId,
        actorUserId: actorId,
        actorName,
        actorRole,
        sourcePage: "kiosk",
        action: "print",
        targetMode: "single",
        reqid,
        reqno,
        phone,
        reportType,
        headerMode,
        status: "failed",
        resultCode: "KIOSK_READY_PRINT_FETCH_FAILED",
        resultMessage: fetchError?.message || "Ready print fetch failed",
        requestPayload: {
          mode: "ready_print",
          report_scope: reportScope,
          printtype: 1,
          chkrephead: toHeaderFlag(headerMode),
          header_mode: "plain",
          without_header_background: "true",
          report_url: reportUrl,
          ready_lab_test_keys: readyLabTestKeys
        },
        durationMs: Date.now() - startedAt,
        documentUrl: reportUrl
      });
      throw fetchError;
    }

    const { response: upstream, contentType, bytes } = fetchResult;
    const okPdf = upstream.ok && contentType.includes("application/pdf");
    if (!okPdf) {
      await logReportDispatch({
        labId: resolvedLabId,
        actorUserId: actorId,
        actorName,
        actorRole,
        sourcePage: "kiosk",
        action: "print",
        targetMode: "single",
        reqid,
        reqno,
        phone,
        reportType,
        headerMode,
        status: "failed",
        resultCode: "KIOSK_READY_PRINT_NON_PDF",
        resultMessage: `Upstream returned ${upstream.status} with content-type ${contentType || "unknown"}`,
        requestPayload: {
          mode: "ready_print",
          report_scope: reportScope,
          printtype: 1,
          chkrephead: toHeaderFlag(headerMode),
          header_mode: "plain",
          without_header_background: "true",
          report_url: reportUrl,
          ready_lab_test_keys: readyLabTestKeys
        },
        responsePayload: {
          status: upstream.status,
          content_type: contentType,
          bytes: bytes.byteLength
        },
        durationMs: Date.now() - startedAt,
        documentUrl: reportUrl
      });

      return NextResponse.json(
        {
          ok: false,
          code: "KIOSK_READY_PRINT_NON_PDF",
          message: "Ready print endpoint did not return a printable PDF."
        },
        { status: 502 }
      );
    }

    await logReportDispatch({
      labId: resolvedLabId,
      actorUserId: actorId,
      actorName,
      actorRole,
      sourcePage: "kiosk",
      action: "print",
      targetMode: "single",
      reqid,
      reqno,
      phone,
        reportType,
      headerMode,
      status: "success",
        resultCode: "KIOSK_READY_PRINT_OK",
        resultMessage: `Ready ${reportScope} report printed from kiosk flow`,
        requestPayload: {
          mode: "ready_print",
          report_scope: reportScope,
          printtype: 1,
          chkrephead: toHeaderFlag(headerMode),
          header_mode: "plain",
        without_header_background: "true",
        report_url: reportUrl,
        ready_lab_test_keys: readyLabTestKeys
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
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${reqid}_${reportScope}_dispatch.pdf"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return new Response(error?.message || "Failed kiosk ready print", { status: 500 });
  }
}
