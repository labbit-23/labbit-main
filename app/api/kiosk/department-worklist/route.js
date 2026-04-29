import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { ironOptions } from "@/lib/session";
import { kioskIronOptions } from "@/lib/kioskSession";
import { getDepartmentWorklist } from "@/lib/neosoft/client";

const ALLOWED_EXEC_TYPES = ["admin", "manager", "director", "b2b", "logistics"];

function getRoleKey(user) {
  if (!user) return "";
  if (user.userType === "executive") return (user.executiveType || "").toLowerCase();
  return (user.userType || "").toLowerCase();
}

function canUseKioskQueue(user) {
  return ALLOWED_EXEC_TYPES.includes(getRoleKey(user));
}

function toIsoDate(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const sessionData = await getIronSession(cookieStore, ironOptions);
    const kioskSession = await getIronSession(cookieStore, kioskIronOptions);
    const user = sessionData?.user;
    const kioskUser = kioskSession?.kioskUser;
    const isKioskAuth = Boolean(kioskUser?.authenticated);

    if ((!user || !canUseKioskQueue(user)) && !isKioskAuth) {
      return new Response("Forbidden", { status: 403 });
    }

    const url = new URL(request.url);
    const fromreqdate = toIsoDate(url.searchParams.get("fromreqdate") || url.searchParams.get("date"));
    const toreqdate = toIsoDate(url.searchParams.get("toreqdate") || fromreqdate);
    const department = String(
      url.searchParams.get("department") ||
      process.env.REPORT_KIOSK_DEFAULT_DEPARTMENT ||
      "radiology"
    ).trim();

    const data = await getDepartmentWorklist({
      fromreqdate,
      toreqdate,
      department
    });

    return NextResponse.json(
      {
        ok: true,
        fromreqdate,
        toreqdate,
        department,
        count: Number(data?.count || 0),
        items: Array.isArray(data?.items) ? data.items : [],
        upstream: data || null
      },
      { status: 200 }
    );
  } catch (error) {
    return new Response(error?.message || "Failed to load kiosk department worklist", { status: 500 });
  }
}
