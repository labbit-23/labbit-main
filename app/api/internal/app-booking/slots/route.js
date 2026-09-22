import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { appHubAuthorized } from "@/lib/appHubAuth";

// GET /api/internal/app-booking/slots -- the same visit_time_slots master
// staff booking already uses (app/api/visits/time_slots). No date parameter:
// slots are a fixed daily schedule (slot_name/start_time/end_time), not
// per-day rows -- the app applies "no past slots today" itself against the
// date the patient picks, same rule assertVisitScheduleAllowed enforces
// server-side when the visit is actually created.
export async function GET(request) {
  if (!appHubAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase
    .from("visit_time_slots")
    .select("id, slot_name, start_time, end_time")
    .order("start_time", { ascending: true });
  if (error) return NextResponse.json({ error: "Failed to load slots" }, { status: 500 });
  return NextResponse.json({ slots: data || [] });
}
