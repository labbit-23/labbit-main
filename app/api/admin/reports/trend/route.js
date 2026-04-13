import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { ironOptions } from "@/lib/session";
import { getTrendReportUrl, getReportStatus, getReportStatusByReqid } from "@/lib/neosoft/client";
import { logReportDispatch } from "@/lib/reportDispatchLogs";
import {
  canUseReportDispatch,
  isScopedDispatchRole,
  getAllowedDispatchOrgIds,
  reportStatusMatchesOrgScope,
  getRoleKey,
} from "@/lib/reportDispatchScope";

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
    const mrno = String(url.searchParams.get("mrno") || "").trim();
    const reqid = String(url.searchParams.get("reqid") || "").trim() || null;
    const reqno = String(url.searchParams.get("reqno") || "").trim() || null;
    const mode = String(url.searchParams.get("mode") || "preview").trim().toLowerCase();

    if (!mrno) {
      return new Response("Missing mrno", { status: 400 });
    }

    if (isScopedDispatchRole(user)) {
      if (!reqno && !reqid) {
        return new Response("Scoped dispatch requires reqno or reqid", { status: 400 });
      }
      const allowedOrgIds = await getAllowedDispatchOrgIds(user);
      const statusForScope = reqno
        ? await getReportStatus(reqno)
        : await getReportStatusByReqid(reqid);
      if (!reportStatusMatchesOrgScope(statusForScope, allowedOrgIds)) {
        return new Response("Forbidden for this organization scope", { status: 403 });
      }
    }

    const trendUrl = getTrendReportUrl(mrno);
    const resolvedLabId =
      (Array.isArray(user?.labIds) ? String(user.labIds[0] || "").trim() : "") ||
      String(process.env.DEFAULT_LAB_ID || "").trim() ||
      null;
    const actorRole = getRoleKey(user) || null;
    const action = mode === "download" ? "download" : "print";
    const upstream = await fetch(trendUrl, { method: "GET", cache: "no-store" });
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
        reportType: "trend",
        headerMode: "default",
        status: "failed",
        resultCode: "ADMIN_TREND_FETCH_FAILED",
        resultMessage: `Upstream returned ${upstream.status}`,
        requestPayload: {
          mode,
          mrno,
          trend_url: trendUrl
        },
        responsePayload: {
          status: upstream.status,
          content_type: contentType,
          bytes: bytes.byteLength
        },
        durationMs: Date.now() - startedAt,
        documentUrl: trendUrl
      });
      return new Response(bytes, {
        status: upstream.status,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-store"
        }
      });
    }

    const disposition =
      mode === "download"
        ? `attachment; filename="${mrno}_trend_report.pdf"`
        : `inline; filename="${mrno}_trend_report.pdf"`;

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
      reportType: "trend",
      headerMode: "default",
      status: "success",
      resultCode: mode === "download" ? "ADMIN_TREND_DOWNLOAD_OK" : "ADMIN_TREND_PREVIEW_OK",
      resultMessage: mode === "download" ? "Trend report downloaded from dispatcher" : "Trend report preview opened from dispatcher",
      requestPayload: {
        mode,
        mrno,
        trend_url: trendUrl
      },
      responsePayload: {
        status: upstream.status,
        content_type: contentType,
        bytes: bytes.byteLength
      },
      durationMs: Date.now() - startedAt,
      documentUrl: trendUrl
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
    return new Response(error?.message || "Failed to fetch trend report", { status: 500 });
  }
}
