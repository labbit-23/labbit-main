import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { ironOptions } from "@/lib/session";
import { lookupReports } from "@/lib/neosoft/client";

const ALLOWED_EXEC_TYPES = ["admin", "manager", "director"];

function getRoleKey(user) {
  if (!user) return "";
  if (user.userType === "executive") return (user.executiveType || "").toLowerCase();
  return (user.userType || "").toLowerCase();
}

function canUseReportDispatch(user) {
  return ALLOWED_EXEC_TYPES.includes(getRoleKey(user));
}

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const sessionData = await getIronSession(cookieStore, ironOptions);
    const user = sessionData?.user;
    if (!user || !canUseReportDispatch(user)) {
      return new Response("Forbidden", { status: 403 });
    }

    const phone = String(new URL(request.url).searchParams.get("phone") || "").trim();
    if (!phone) {
      return new Response("Missing phone", { status: 400 });
    }

    const reports = await lookupReports(phone);
    const latestReports = (Array.isArray(reports) ? reports : []).slice(0, 10).map((row) => ({
      reqid: String(row?.reqid || "").trim() || null,
      reqno: String(row?.reqno || "").trim() || null,
      patient_name: String(row?.patient_name || "").trim() || null,
      mrno: String(row?.mrno || "").trim() || null,
      reqdt: String(row?.reqdt || "").trim() || null
    }));
    return NextResponse.json({ ok: true, phone, latest_reports: latestReports }, { status: 200 });
  } catch (error) {
    return new Response(error?.message || "Failed to lookup reports", { status: 500 });
  }
}
