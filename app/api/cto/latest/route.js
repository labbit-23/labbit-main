import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

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

    let query = supabase
      .from("cto_service_latest")
      .select("*")
      .order("category", { ascending: true })
      .order("service_key", { ascending: true });

    if (labId) {
      query = query.eq("lab_id", labId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[cto/latest] fetch error", error);
      return NextResponse.json({ error: "Failed to load latest service status" }, { status: 500 });
    }

    const rows = data || [];
    const summary = rows.reduce(
      (acc, row) => {
        acc.total += 1;
        acc[row.status] = (acc[row.status] || 0) + 1;
        return acc;
      },
      { total: 0, healthy: 0, degraded: 0, down: 0, unknown: 0 }
    );

    return NextResponse.json(
      {
        lab_id: labId,
        summary,
        services: rows,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("[cto/latest] unexpected error", error);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
