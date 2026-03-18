import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

import { supabase } from "@/lib/supabaseServer";
import { ironOptions } from "@/lib/session";

const ALLOWED_ROLES = new Set(["admin", "manager", "director"]);

export async function GET(_request, context) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ error: "Missing visit ID" }, { status: 400 });
  }

  const session = await getIronSession(cookies(), ironOptions);
  const user = session?.user || null;
  const role = String(user?.executiveType || user?.userType || "").toLowerCase();

  if (!ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("visit_activity_log")
    .select("*")
    .eq("visit_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message || "Failed to load visit activity" }, { status: 500 });
  }

  return NextResponse.json({ activity: data || [] }, { status: 200 });
}
