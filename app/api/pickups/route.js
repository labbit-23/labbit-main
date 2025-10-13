// /app/api/pickups/route.js

import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabaseServer";
import { getIronSession } from "iron-session";
import { ironOptions as sessionOptions } from "@/lib/session";
import { cookies } from "next/headers";  // ← Add this import!

// Helper to get session and executive ID (App Router compatible)
async function getExecutiveId() {
  const cookieStore = cookies(); // ← Use Next.js cookies store!
  const session = await getIronSession(cookieStore, sessionOptions);
  return session?.user?.id || null;
}

/**
 * GET /api/pickups?status=<status>
 * Only returns pickups linked to collection centres assigned to logged-in executive.
 */
export async function GET(request) {
  try {
    const executiveId = await getExecutiveId();
    if (!executiveId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status");

    const { data: assignedCentres, error: centreError } = await supabase
      .from("executives_collection_centres")
      .select("collection_centre_id")
      .eq("executive_id", executiveId)
      .in("role", ["requester", "logistics", "admin"]);

    if (centreError) {
      return NextResponse.json({ error: centreError.message }, { status: 500 });
    }

    const centreIds = assignedCentres.map((c) => c.collection_centre_id);
    if (centreIds.length === 0) {
      // No centres assigned → return empty
      return NextResponse.json([], { status: 200 });
    }

    let query = supabase
      .from("sample_pickups")
      .select(`
        id,
        collection_centre_id,
        sample_bag_size,
        status,
        requested_at,
        picked_up_at,
        dropped_off_at,
        notes,
        updated_at,
        collection_centre:collection_centre_id (
          id,
          centre_name,
          phone,
          contact_email,
          address
        ),
        assigned_executive:assigned_executive_id (
          id,
          name,
          phone
        )
      `)
      .in("collection_centre_id", centreIds);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query.order("requested_at", { ascending: false });

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
    const executiveId = await getExecutiveId();
    if (!executiveId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const insertData = {
      collection_centre_id: body.collection_centre_id,
      sample_bag_size: body.sample_bag_size ?? null,
      notes: body.notes ?? null,
      status: "samples_ready",
      requested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("sample_pickups")
      .insert([insertData])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const executiveId = await getExecutiveId();
    if (!executiveId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: "Missing pickup id" }, { status: 400 });
    }

    const updates = {
      updated_at: new Date().toISOString(),
    };

    if ("status" in body) {
      updates.status = body.status;
      if (body.status === "picked_up") updates.picked_up_at = new Date().toISOString();
      else if (body.status === "dropped") updates.dropped_off_at = new Date().toISOString();
    }

    if ("assigned_executive_id" in body) {
      updates.assigned_executive_id = body.assigned_executive_id;
    }

    if ("notes" in body) {
      updates.notes = body.notes;
    }

    const { data, error } = await supabase
      .from("sample_pickups")
      .update(updates)
      .eq("id", body.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
