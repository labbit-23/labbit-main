import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { kioskIronOptions } from "@/lib/kioskSession";
import { supabase } from "@/lib/supabaseServer";
import { getPendingDispatchReportUrl } from "@/lib/neosoft/client";
import { logReportDispatch } from "@/lib/reportDispatchLogs";
import { cookies } from "next/headers";

const ALLOWED_EXEC_TYPES = ["admin", "manager", "director"];
const FETCH_TIMEOUT_MS = 25000;
const ENABLE_PENDING_PRINT_ONCE = String(process.env.REPORT_PENDING_PRINT_ONCE_ENABLED || "").trim().toLowerCase() === "true";

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

async function wasPendingPrintAlreadyConsumed(reqid, reqno) {
  let query = supabase
    .from("report_dispatch_logs")
    .select("id, action, request_payload, created_at")
    .eq("action", "print")
    .order("created_at", { ascending: false })
    .limit(50);

  if (String(reqid || "").trim()) {
    query = query.eq("reqid", String(reqid).trim());
  } else if (String(reqno || "").trim()) {
    query = query.eq("reqno", String(reqno).trim());
  }

  const { data, error } = await query;
  if (error) throw error;

  const hit = (data || []).find((row) => {
    const payload = row?.request_payload && typeof row.request_payload === "object" ? row.request_payload : {};
    return String(payload?.printtype || "") === "0";
  });

  return Boolean(hit);
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
    if (!ENABLE_PENDING_PRINT_ONCE) {
      return NextResponse.json(
        {
          ok: false,
          code: "PENDING_PRINT_ONCE_DISABLED",
          message: "Pending print once is disabled for this environment."
        },
        { status: 404 }
      );
    }

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
    const source = String(
      body?.source ||
        request.headers.get("x-report-source") ||
        ""
    )
      .trim()
      .toLowerCase();

    if (source !== "kiosk") {
      return NextResponse.json(
        {
          ok: false,
          code: "KIOSK_ONLY_ENDPOINT",
          message: "Pending print once is available only for kiosk dispatch flow."
        },
        { status: 403 }
      );
    }

    const reqid = String(body?.reqid || "").trim();
    const reqno = String(body?.reqno || "").trim() || null;
    const labId = String(body?.lab_id || "").trim() || null;
    const phone = String(body?.phone || "").trim() || null;
    const headerMode = "plain";
    const readyLabTestKeys = Array.isArray(body?.ready_lab_test_keys) ? body.ready_lab_test_keys : [];

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

    const alreadyConsumed = await wasPendingPrintAlreadyConsumed(reqid, reqno);
    if (alreadyConsumed) {
      return NextResponse.json(
        {
          ok: false,
          code: "PENDING_PRINT_ALREADY_CONSUMED",
          message: "Pending print dispatcher already used once for this requisition."
        },
        { status: 409 }
      );
    }

    const pendingPrintUrl = getPendingDispatchReportUrl(reqid, reqno, {
      chkrephead: toHeaderFlag(headerMode),
      header_mode: "plain",
      without_header_background: "true"
    });

    let fetchResult;
    try {
      fetchResult = await fetchPdf(pendingPrintUrl);
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
        reportType: "lab",
        headerMode,
        status: "failed",
        resultCode: "PENDING_PRINT_ONCE_FETCH_FAILED",
        resultMessage: fetchError?.message || "Pending print fetch failed",
        requestPayload: {
          mode: "pending_print_once",
          printtype: 0,
          chkrephead: toHeaderFlag(headerMode),
          header_mode: "plain",
          without_header_background: "true",
          pending_print_url: pendingPrintUrl,
          ready_lab_test_keys: readyLabTestKeys
        },
        durationMs: Date.now() - startedAt,
        documentUrl: pendingPrintUrl
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
        reportType: "lab",
        headerMode,
        status: "failed",
        resultCode: "PENDING_PRINT_ONCE_NON_PDF",
        resultMessage: `Upstream returned ${upstream.status} with content-type ${contentType || "unknown"}`,
        requestPayload: {
          mode: "pending_print_once",
          printtype: 0,
          chkrephead: toHeaderFlag(headerMode),
          header_mode: "plain",
          without_header_background: "true",
          pending_print_url: pendingPrintUrl,
          ready_lab_test_keys: readyLabTestKeys
        },
        responsePayload: {
          status: upstream.status,
          content_type: contentType,
          bytes: bytes.byteLength
        },
        durationMs: Date.now() - startedAt,
        documentUrl: pendingPrintUrl
      });

      return NextResponse.json(
        {
          ok: false,
          code: "PENDING_PRINT_NON_PDF",
          message: "Pending print endpoint did not return a printable PDF."
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
      reportType: "lab",
      headerMode,
      status: "success",
      resultCode: "PENDING_PRINT_ONCE_OK",
      resultMessage: "Pending dispatcher called once successfully",
      requestPayload: {
        mode: "pending_print_once",
        printtype: 0,
        chkrephead: toHeaderFlag(headerMode),
        header_mode: "plain",
        without_header_background: "true",
        pending_print_url: pendingPrintUrl,
        ready_lab_test_keys: readyLabTestKeys
      },
      responsePayload: {
        status: upstream.status,
        content_type: contentType,
        bytes: bytes.byteLength
      },
      durationMs: Date.now() - startedAt,
      documentUrl: pendingPrintUrl
    });

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${reqid}_pending_dispatch.pdf"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return new Response(error?.message || "Failed pending print dispatch", { status: 500 });
  }
}
