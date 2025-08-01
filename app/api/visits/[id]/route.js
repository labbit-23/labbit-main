import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GET - Fetch a single visit by ID (optional, if you want to support fetching specific visit)
 */
export async function GET(request, { params }) {
  const { id } = params;

  if (!id) {
    return NextResponse.json({ error: "Missing visit ID" }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from("visits")
      .select(
        `
        id,
        patient_id,
        executive_id,
        lab_id,
        visit_date,
        time_slot,
        address,
        status,
        patient_id,
        address,
        address_id,
        time_slot:time_slot (
          id,
          slot_name,
          start_time,
          end_time
        )
        `
      )
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

    // Build update object
    const updateData = {};

    // Pick relevant fields if they exist in request body
    const allowedFields = [
      "patient_id",
      "executive_id",
      "lab_id",
      "visit_date",
      "time_slot",  // Use "time_slot" since you confirmed keys can remain as is
      "address",
      "address_id",
      "status",
    ];

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
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE - Optionally, to delete a visit by ID (if needed)
 */
export async function DELETE(request, { params }) {
  const { id } = params;

  if (!id) {
    return NextResponse.json({ error: "Missing visit ID" }, { status: 400 });
  }

  try {
    const { error } = await supabase.from("visits").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { message: "Visit deleted successfully" },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
