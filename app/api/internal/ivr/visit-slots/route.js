// Thin wrapper over fetchVisitTimeSlots() (webhook/route.js), the other
// direct-Supabase read the bot makes inline -- same reasoning and auth
// pattern as ./patient-lookup/route.js.
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";

function getAuthToken(request) {
  return (
    request.headers.get("x-internal-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  ).trim();
}

function requireAuth(request) {
  const expectedToken = process.env.WHATSAPP_INTERNAL_SEND_TOKEN || "";
  const providedToken = getAuthToken(request);
  return Boolean(expectedToken) && providedToken === expectedToken;
}

export async function GET(request) {
  if (!requireAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data, error } = await supabase
      .from("visit_time_slots")
      .select("id, slot_name, start_time, end_time")
      .order("start_time", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message || "Failed to load time slots" }, { status: 500 });
    }

    const slots = (data || []).map((slot) => ({
      id: slot.id,
      title: slot.slot_name || `${slot.start_time || ""} - ${slot.end_time || ""}`.trim(),
      description: slot.start_time && slot.end_time ? `${slot.start_time} - ${slot.end_time}` : "",
      start_time: slot.start_time || null
    }));

    return NextResponse.json({ slots }, { status: 200 });
  } catch (error) {
    console.error("[ivr/visit-slots] error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
