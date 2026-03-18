import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";

function canAccessCto(user) {
  return user?.userType === "executive" && (user?.executiveType || "").toLowerCase() === "director";
}

export async function GET(request) {
  const response = NextResponse.next();

  try {
    const session = await getIronSession(request, response, ironOptions);
    const user = session?.user;

    if (!canAccessCto(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!supabase) {
      return NextResponse.json({ error: "Supabase server client unavailable" }, { status: 500 });
    }

    const url = new URL(request.url);
    const labId = url.searchParams.get("lab_id") || user?.labIds?.[0] || null;
    const serviceKey = url.searchParams.get("service_key") || null;
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 500);

    let query = supabase
      .from("cto_service_logs")
      .select("*")
      .order("checked_at", { ascending: false })
      .limit(limit);

    if (labId) {
      query = query.eq("lab_id", labId);
    }

    if (serviceKey) {
      query = query.eq("service_key", serviceKey);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[cto/history] fetch error", error);
      return NextResponse.json({ error: "Failed to load service history" }, { status: 500 });
    }

    return NextResponse.json({
      lab_id: labId,
      service_key: serviceKey,
      rows: data || [],
    });
  } catch (error) {
    console.error("[cto/history] unexpected error", error);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
