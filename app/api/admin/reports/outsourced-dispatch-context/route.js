import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { cookies } from "next/headers";
import { getOutsourcedReportMeta, getOutsourcedReportUrl, getReportStatus } from "@/lib/neosoft/client";
import {
  canUseReportDispatch,
  getAllowedDispatchOrgIds,
  isScopedDispatchRole,
  reportStatusMatchesOrgScope
} from "@/lib/reportDispatchScope";

function rowValue(row, ...keys) {
  if (!row || typeof row !== "object") return null;
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
    const lowered = String(key).toLowerCase();
    const found = Object.keys(row).find((candidate) => String(candidate).toLowerCase() === lowered);
    if (found && row[found] !== undefined && row[found] !== null) return row[found];
  }
  return null;
}

function normalizeTestRows(reportStatus) {
  const tests = Array.isArray(reportStatus?.tests) ? reportStatus.tests : [];
  return tests
    .map((row) => {
      const reqid = String(rowValue(row, "REQID", "reqid") || "").trim();
      const testid = String(rowValue(row, "TESTID", "testid") || "").trim();
      const testName = String(rowValue(row, "TESTNM", "testnm", "TEST_NAME", "test_name") || "").trim();
      const reportStatusValue = String(rowValue(row, "REPORT_STATUS", "report_status") || "").trim().toUpperCase();
      const approvedFlg = String(rowValue(row, "APPROVEDFLG", "approvedflg") || "").trim();
      return {
        reqid,
        testid,
        test_name: testName || testid || "-",
        report_status: reportStatusValue,
        approved_flg: approvedFlg
      };
    })
    .filter((row) => row.reqid && row.testid && row.report_status === "OUTSOURCED" && row.approved_flg === "1");
}

function routeHintForMode(mode) {
  const normalized = String(mode || "").trim().toLowerCase();
  if (normalized === "transcribed") return "Included in /report (do not send separately)";
  if (normalized === "attached_base" || normalized === "attached_qr") return "Send separately via /outsourced-report";
  return "-";
}

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const sessionData = await getIronSession(cookieStore, ironOptions);
    const user = sessionData?.user;
    if (!user || !canUseReportDispatch(user)) {
      return new Response("Forbidden", { status: 403 });
    }

    const reqno = String(new URL(request.url).searchParams.get("reqno") || "").trim();
    if (!reqno) return new Response("Missing reqno", { status: 400 });

    const reportStatus = await getReportStatus(reqno);
    const roleKey = user.userType === "executive" ? user.executiveType : user.userType;
    const scopedMode = isScopedDispatchRole(roleKey);
    if (scopedMode) {
      const allowedOrgIds = await getAllowedDispatchOrgIds({
        userId: user.id || user.userId || null,
        roleKey
      });
      if (!reportStatusMatchesOrgScope(reportStatus, allowedOrgIds)) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    const outsourcedRows = normalizeTestRows(reportStatus);
    const resolvedRows = await Promise.all(
      outsourcedRows.map(async (row) => {
        try {
          const meta = await getOutsourcedReportMeta(row.reqid, row.testid);
          const mode = String(meta?.outsourced_mode || meta?.mode || "unavailable").trim().toLowerCase();
          return {
            ...row,
            outsourced_mode: mode || "unavailable",
            download_url: getOutsourcedReportUrl(row.reqid, row.testid),
            resolver_status: "ok",
            resolver_error: null,
            denied: false,
            route_hint: routeHintForMode(mode)
          };
        } catch (error) {
          const status = Number(error?.status || 0);
          const message = String(error?.message || "").trim();
          const denied = status === 403 && message.includes("SOURCE_CONFIDENTIAL_DO_NOT_SEND");
          return {
            ...row,
            outsourced_mode: "unavailable",
            download_url: getOutsourcedReportUrl(row.reqid, row.testid),
            resolver_status: denied ? "denied" : "error",
            resolver_error: message || `Meta lookup failed (${status || "unknown"})`,
            denied,
            route_hint: denied ? "SOURCE_CONFIDENTIAL_DO_NOT_SEND" : "-"
          };
        }
      })
    );

    return NextResponse.json(
      {
        ok: true,
        reqno,
        rows: resolvedRows
      },
      { status: 200 }
    );
  } catch (error) {
    return new Response(error?.message || "Failed to resolve outsourced dispatch context", { status: 500 });
  }
}
