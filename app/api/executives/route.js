//app/api/executives/route.js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const COLLECTION_ROLES = new Set(["logistics", "b2b"]);

function normalizeExecutiveType(type) {
  const value = (type || "").toString().trim();
  if (!value) return "Unknown";
  if (COLLECTION_ROLES.has(value.toLowerCase())) return value.toLowerCase();
  return value;
}

function getCollectionAssignmentRole(type) {
  const key = (type || "").toString().trim().toLowerCase();
  if (key === "logistics") return "logistics";
  return "requester";
}

async function syncCollectionCentreAssignments(executiveId, type, centreIds) {
  const roleKey = (type || "").toString().trim().toLowerCase();
  if (!COLLECTION_ROLES.has(roleKey)) return;

  const assignmentRole = getCollectionAssignmentRole(roleKey);
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const ids = Array.isArray(centreIds)
    ? [
        ...new Set(
          centreIds
            .map((v) => (v == null ? "" : String(v).trim()))
            .filter((v) => uuidRegex.test(v))
        ),
      ]
    : [];
  if (Array.isArray(centreIds) && centreIds.length > 0 && ids.length === 0) {
    throw new Error("Invalid collection centre IDs");
  }

  const { error: deleteError } = await supabase
    .from("executives_collection_centres")
    .delete()
    .eq("executive_id", executiveId);
  if (deleteError) throw deleteError;

  if (ids.length === 0) return;

  const rows = ids.map((collectionCentreId) => ({
    executive_id: executiveId,
    collection_centre_id: collectionCentreId,
    role: assignmentRole,
  }));

  const { error: insertError } = await supabase
    .from("executives_collection_centres")
    .insert(rows);
  if (insertError) throw insertError;
}

export async function POST(request) {
  const data = await request.json();
  if (!data.name || !data.phone) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const { data: insertedExec, error: execError } = await supabase
    .from("executives")
    .insert({
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      type: normalizeExecutiveType(data.type),
      active: data.active ?? true,
      status: data.status ?? "active",
      password_hash: " ",
    })
    .select()
    .single();

  if (execError) {
    return NextResponse.json({ error: execError.message }, { status: 500 });
  }

  // Link to lab if provided
  if (data.lab_id) {
    const { error: linkError } = await supabase
      .from("executives_labs")
      .upsert({
        executive_id: insertedExec.id,
        lab_id: data.lab_id,
      }, { onConflict: ["executive_id", "lab_id"] });

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }
  }

  try {
    await syncCollectionCentreAssignments(
      insertedExec.id,
      data.type,
      data.collection_centre_ids
    );
  } catch (assignmentError) {
    return NextResponse.json(
      { error: assignmentError.message || "Failed to save collection centre assignment" },
      { status: 500 }
    );
  }

  return NextResponse.json(insertedExec, { status: 201 });
}

export async function PUT(request) {
  const data = await request.json();
  if (!data.id) {
    return NextResponse.json({ error: "Missing ID" }, { status: 400 });
  }

  const { data: updatedExec, error: execError } = await supabase
    .from("executives")
    .update({
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      type: normalizeExecutiveType(data.type),
      active: data.active ?? true,
      status:
        data.status ??
        (data.type?.toLowerCase() === "phlebo" ? "available" : "active"),
    })
    .eq("id", data.id)
    .select()
    .single();

  if (execError) {
    return NextResponse.json({ error: execError.message }, { status: 500 });
  }

  // Update lab mapping if provided
  if (data.lab_id) {
    const { error: linkError } = await supabase
      .from("executives_labs")
      .upsert({
        executive_id: data.id,
        lab_id: data.lab_id,
      }, { onConflict: ["executive_id", "lab_id"] });

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }
  }

  try {
    await syncCollectionCentreAssignments(
      data.id,
      data.type,
      data.collection_centre_ids
    );
  } catch (assignmentError) {
    return NextResponse.json(
      { error: assignmentError.message || "Failed to save collection centre assignment" },
      { status: 500 }
    );
  }

  return NextResponse.json(updatedExec, { status: 200 });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const activeParam = url.searchParams.get("active");
    const typeParam = url.searchParams.get("type");
    const idParam = url.searchParams.get("id"); // optional filter by id

    let query = supabase
      .from("executives")
      .select(`
        id,
        name,
        phone,
        email,
        type,
        status,
        active,
        executives_labs(lab_id),
        executives_collection_centres(collection_centre_id, role)
      `)
      .order("created_at", { ascending: false });

    if (activeParam !== null) {
      const activeBoolean = activeParam.toLowerCase() === "true";
      query = query.eq("active", activeBoolean);
    }

    if (typeParam) {
      query = query.ilike("type", `%${typeParam}%`);
    }

    if (idParam) {
      query = query.eq("id", idParam);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Flatten lab_id (from first mapping) so frontend exec.lab_id exists
    const normalize = (exec) => ({
      ...exec,
      lab_id: Array.isArray(exec.executives_labs) && exec.executives_labs.length > 0
        ? exec.executives_labs[0].lab_id
        : "",
      collection_centre_ids: Array.isArray(exec.executives_collection_centres)
        ? [
            ...new Set(
              exec.executives_collection_centres
                .map((row) => row.collection_centre_id)
                .filter((v) => v != null)
            ),
          ]
        : [],
    });

    // Map for array or normalize single
    const result = Array.isArray(data) ? data.map(normalize) : normalize(data);

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
