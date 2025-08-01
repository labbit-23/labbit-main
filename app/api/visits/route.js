//app/api/visits/route.js

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase with your environment variables
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GET /api/visits?patient_id=<uuid>
 * Returns all visits for the specified patient_id.
 */
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const patientId = url.searchParams.get('patient_id');

    if (!patientId) {
      return NextResponse.json({ error: "Missing patient_id query parameter" }, { status: 400 });
    }

    // Fetch visits matching patient_id, include related time_slot info via supabase relationships or foreign keys
    const { data, error } = await supabase
      .from("visits")
      .select(`
        id,
        patient_id,
        executive_id,
        lab_id,
        visit_date,
        time_slot,
        address,
        status,
        time_slot:time_slot (
          id,
          slot_name,
          start_time,
          end_time
        )
      `)
      .eq("patient_id", patientId)
      .order("visit_date", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const visitData = await request.json();

    // Log incoming payload for diagnostics
    console.log("[API] Received visit data:", visitData);

    // Insert visit record into Supabase
    const { data, error } = await supabase
      .from("visits")
      .insert([visitData])
      .select()
      .single();

    if (error) {
      // Log error message and payload for debugging
      console.error("[API] Error inserting visit:", error);
      console.error("[API] Payload causing error:", visitData);

      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(data),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    // Log unexpected exceptions as well
    console.error("[API] Unexpected error in POST /api/visits:", err);

    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
