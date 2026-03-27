import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { ironOptions } from "@/lib/session";
import { getDeliveryRequisitionsByDate } from "@/lib/neosoft/client";

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

    const date = String(new URL(request.url).searchParams.get("date") || "").trim();
    if (!date) {
      return new Response("Missing date", { status: 400 });
    }

    const data = await getDeliveryRequisitionsByDate(date);
    const requisitions = Array.isArray(data?.requisitions) ? data.requisitions : [];

    return NextResponse.json(
      {
        ok: true,
        date: String(data?.date || date),
        requisitions: requisitions.map((row) => ({
          reqno: String(row?.reqno || "").trim() || null,
          reqid: String(row?.reqid || "").trim() || null,
          patient_name: String(row?.patient_name || "").trim() || null,
          phoneno: String(row?.phoneno || "").trim() || null,
          mrno: String(row?.mrno || "").trim() || null
        }))
      },
      { status: 200 }
    );
  } catch (error) {
    return new Response(error?.message || "Failed to load requisitions by date", { status: 500 });
  }
}

