// File: /app/api/visits/route.js

import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabaseServer";
import {
  sendPatientVisitSms,
  sendPhleboVisitSms,
} from "@/lib/visitSms";
import { sendPatientVisitWhatsapp } from "@/lib/visitWhatsapp";

// GET /api/visits?patient_id=...&visit_date=...
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const patientId = url.searchParams.get("patient_id");
    const visitDate = url.searchParams.get("visit_date");

    if (!patientId && !visitDate) {
      return NextResponse.json([], { status: 200 });
    }

    let query = supabase
      .from("visits")
      .select(`
        id,
        visit_code,
        patient:patient_id(id, name, phone),
        executive_id,
        executive:executive_id(id, name, phone),
        lab_id,
        visit_date,
        time_slot,
        address,
        status,
        notes,
        prescription,
        address_id,
        time_slot:time_slot(id, slot_name, start_time, end_time)
      `);

    if (patientId) query = query.eq("patient_id", patientId);
    if (visitDate) query = query.eq("visit_date", visitDate);

    const { data, error } = await query.order("visit_date", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || [], { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/visits
 * Create a new visit (send patient SMS and phlebo SMS if assigned),
 * log creation in visit_activity_log,
 * update patient's area with new visit area
 */
export async function POST(request) {
  try {
    const visitData = await request.json();

    delete visitData.id;
    delete visitData.visit_code;

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
        status,
        notes,
        prescription
      `)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Visit creation failed" },
        { status: 500 }
      );
    }

    // Insert activity log for creation
    try {
      await supabase.from("visit_activity_log").insert([{
        visit_id: data.id,
        previous_status: null,
        new_status: data.status || null,
        changed_by: visitData.created_by || null,
        notes: visitData.notes || null,
      }]);
    } catch (logError) {
      console.error("Failed to add visit activity log:", logError?.message || logError);
    }


    // Send SMS & Whatsapp  to patient
    try {
      await sendPatientVisitSms(data.id);
    } catch (e) {
      console.error("Failed to send patient SMS:", e?.message || e);
    }

    try {
      await sendPatientVisitWhatsapp(data.id);
    } catch (e) {
      console.error("Failed to send patient WhatsApp:", e?.message || e);
    }

    // Send SMS & Whatsapp to phlebo if assigned
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
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/visits
 * Update a visit, send patient SMS on update,
 * send phlebo SMS if new executive assigned or timeslot changed,
 * log activity in visit_activity_log
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

    // Fetch previous visit details including status
    const { data: prev, error: prevErr } = await supabase
      .from("visits")
      .select("executive_id, time_slot, status")
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
        status,
        notes,
        prescription
      `)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Visit update failed" },
        { status: 500 }
      );
    }

    // Insert activity log for update
    try {
      await supabase.from("visit_activity_log").insert([{
        visit_id: data.id,
        previous_status: prev.status || null,
        new_status: visitData.status || null,
        changed_by: visitData.updated_by || null,
        notes: visitData.notes || null,
      }]);
    } catch (logError) {
      console.error("Failed to add visit activity log:", logError?.message || logError);
    }

    // Send SMS to patient
    try {
      await sendPatientVisitSms(data.id);
    } catch (e) {
      console.error("Failed to send patient SMS:", e?.message || e);
    }

    try {
      await sendPatientVisitWhatsapp(data.id);
    } catch (e) {
      console.error("Failed to send patient WhatsApp:", e?.message || e);
    }

    // Determine if phlebo SMS is needed
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
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
