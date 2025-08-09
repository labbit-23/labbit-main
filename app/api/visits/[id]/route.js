// File: /app/api/visits/[id]/route.js

import { NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabaseServer"; // adjust the relative path as needed

/**
 * GET - Fetch a single visit by ID with executive and time_slot details
 */
export async function GET(request, { params }) {
  const { id } = params;

  if (!id) {
    return NextResponse.json({ error: "Missing visit ID" }, { status: 400 });
  }

  try {
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
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT - Update a visit by ID
 */
export async function PUT(request, { params }) {
  const { id } = params;

  if (!id) {
    return NextResponse.json({ error: "Missing visit ID" }, { status: 400 });
  }

  try {
    const body = await request.json();

    const allowedFields = [
      "patient_id",
      "executive_id",
      "lab_id",
      "visit_date",
      "time_slot",
      "address",
      "address_id",
      "status",
    ];

    const updateData = {};
    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields provided for update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("visits")
      .update(updateData)
      .eq("id", id)
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
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
