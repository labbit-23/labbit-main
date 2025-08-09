// File: /app/api/visits/route.js

import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabaseServer";
import {
  sendPatientVisitSms,
  sendPhleboVisitSms,
} from "@/lib/visitSms"; // adjust path as needed

/**
 * GET /api/visits?patient_id=<uuid>
 */
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const patientId = url.searchParams.get("patient_id");

    if (!patientId) {
      return NextResponse.json(
        { error: "Missing patient_id query parameter" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("visits")
      .select(`
        id,
        patient_id,
        executive_id,
        executive:executive_id (
          id,
          name,
          phone
        ),
        lab_id,
        visit_date,
        time_slot,
        address,
        status,
        address_id,
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
    return NextResponse.json({
      error: "Internal server error",
    }, { status: 500 });
  }
}

/**
 * POST /api/visits
 * Create a new visit (sends patient SMS and phlebo SMS if assigned)
 */
export async function POST(request) {
  try {
    const visitData = await request.json();
    if ("id" in visitData) delete visitData.id;

    const { data, error } = await supabase
      .from("visits")
      .insert([visitData])
      .select(`
        id,
        lab_id,
        patient_id,
        executive_id,
        executive:executive_id (
          id,
          name,
          phone
        ),
        visit_date,
        time_slot:time_slot (
          slot_name
        ),
        status
      `)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Visit creation failed" }, { status: 500 });
    }

    // Always send patient SMS for new visit
    try {
      await sendPatientVisitSms(data.id);
    } catch (e) {
      console.error("Failed to send patient SMS:", e?.message || e);
    }

    // If executive assigned at creation, send phlebo SMS
    if (data.executive_id && data.executive?.phone) {
      try {
        await sendPhleboVisitSms(data.id);
      } catch (e) {
        console.error("Failed to send phlebo SMS:", e?.message || e);
      }
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("POST /api/visits failed:", err);
    return NextResponse.json({
      error: err.message || "Internal server error",
    }, { status: 500 });
  }
}

/**
 * PUT /api/visits
 * Update a visit, send patient SMS on every update,
 * send phlebo SMS if a new executive is assigned,
 * OR if the assigned executive's timeslot is set/changed
 */
export async function PUT(request) {
  try {
    const visitData = await request.json();
    if (!visitData.id) {
      return NextResponse.json(
        { error: "Missing visit id for update" },
        { status: 400 }
      );
    }

    // Fetch previous visit assignment to compare
    const { data: prev, error: prevErr } = await supabase
      .from("visits")
      .select("executive_id, time_slot")
      .eq("id", visitData.id)
      .single();

    if (prevErr || !prev) {
      return NextResponse.json(
        { error: "Original visit not found for update" },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("visits")
      .update(visitData)
      .eq("id", visitData.id)
      .select(`
        id,
        lab_id,
        patient_id,
        executive_id,
        executive:executive_id (
          id,
          name,
          phone
        ),
        visit_date,
        time_slot:time_slot (
          slot_name
        ),
        status
      `)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Visit update failed" }, { status: 500 });
    }

    // Always send SMS to patient for visit update
    try {
      await sendPatientVisitSms(data.id);
    } catch (e) {
      console.error("Failed to send patient update SMS:", e?.message || e);
    }

    // Logic for when to send phlebo SMS:
    // a) The executive was just assigned (prev.executive_id was null and data.executive_id is not null)
    // b) The executive_id is the same, BUT time_slot has changed
    const isNewAssignment =
      !prev.executive_id && data.executive_id && data.executive?.phone;
    const isTimeslotChanged =
      prev.executive_id &&
      data.executive_id &&
      prev.executive_id === data.executive_id &&
      prev.time_slot !== visitData.time_slot &&
      data.executive?.phone;

    if (isNewAssignment || isTimeslotChanged) {
      try {
        await sendPhleboVisitSms(data.id);
      } catch (e) {
        console.error("Failed to send phlebo visit update SMS:", e?.message || e);
      }
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error("PUT /api/visits failed:", err);
    return NextResponse.json({
      error: err.message || "Internal server error",
    }, { status: 500 });
  }
}
