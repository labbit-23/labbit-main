// /app/api/pickups/route.js

import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabaseServer";
import { getIronSession } from "iron-session";
import { ironOptions as sessionOptions } from "@/lib/session";
import { cookies } from "next/headers";  // ← Add this import!

const ADMIN_MONITOR_ROLES = new Set(["admin", "manager", "director"]);
const LOGISTICS_LAB_WIDE_ROLES = new Set(["logistics"]);

async function getSessionUser() {
  const cookieStore = await cookies(); // ← Use Next.js cookies store!
  const session = await getIronSession(cookieStore, sessionOptions);
  return session?.user || null;
}

function getRoleKey(user) {
  return (
    user?.roleKey ||
    user?.executiveType ||
    (user?.userType === "executive" ? "executive" : user?.userType) ||
    ""
  )
    .toString()
    .toLowerCase();
}

async function getAssignedCentreIds(executiveId, roles = ["requester", "logistics", "admin"]) {
  const { data, error } = await supabase
    .from("executives_collection_centres")
    .select("collection_centre_id")
    .eq("executive_id", executiveId)
    .in("role", roles);

  if (error) throw error;
  return (data || []).map((row) => row.collection_centre_id);
}

async function getLabIds(executiveId) {
  const { data, error } = await supabase
    .from("executives_labs")
    .select("lab_id")
    .eq("executive_id", executiveId);
  if (error) throw error;
  return (data || []).map((row) => row.lab_id);
}

async function getCentreIdsByLabs(labIds) {
  if (!Array.isArray(labIds) || labIds.length === 0) return [];

  const firstTry = await supabase
    .from("collection_centre")
    .select("id")
    .in("lab_id", labIds);
  if (!firstTry.error) return (firstTry.data || []).map((row) => row.id);

  const secondTry = await supabase
    .from("collection_centres")
    .select("id")
    .in("lab_id", labIds);
  if (!secondTry.error) return (secondTry.data || []).map((row) => row.id);

  throw new Error(firstTry.error?.message || secondTry.error?.message || "Failed to resolve collection centres");
}

async function getAccessibleCentreIds(user, { forCreate = false } = {}) {
  const executiveId = user?.id;
  if (!executiveId) return [];

  const roleKey = getRoleKey(user);
  if (ADMIN_MONITOR_ROLES.has(roleKey) || LOGISTICS_LAB_WIDE_ROLES.has(roleKey)) {
    const labIds = await getLabIds(executiveId);
    return getCentreIdsByLabs(labIds);
  }

  const assignmentRoles = forCreate
    ? ["requester", "logistics", "admin"]
    : ["requester", "logistics", "admin"];
  return getAssignedCentreIds(executiveId, assignmentRoles);
}

function appendAuditNote(currentNotes, line) {
  const base = (currentNotes || "").trim();
  return base ? `${base}\n${line}` : line;
}

function isUrgentFromNotes(notes) {
  const text = (notes || "").toString().toLowerCase();
  return text.includes("urgent: yes");
}

/**
 * GET /api/pickups?status=<status>
 * Only returns pickups linked to collection centres assigned to logged-in executive.
 */
export async function GET(request) {
  try {
    const user = await getSessionUser();
    const executiveId = user?.id;
    if (!executiveId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status");

    const centreIds = await getAccessibleCentreIds(user);
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

    const enriched = (data || []).map((row) => ({
      ...row,
      is_urgent: isUrgentFromNotes(row.notes),
    }));

    return NextResponse.json(enriched, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const user = await getSessionUser();
    const executiveId = user?.id;
    if (!executiveId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const nowIso = new Date().toISOString();
    const initialStatus = body.initial_status === "picked_up" ? "picked_up" : "samples_ready";

    let collectionCentreId = body.collection_centre_id;
    const centreIdsForCreate = await getAccessibleCentreIds(user, { forCreate: true });
    if (!collectionCentreId) {
      collectionCentreId = centreIdsForCreate[0] || null;
    }

    if (!collectionCentreId) {
      return NextResponse.json(
        { error: "No collection centre assigned. Please contact admin." },
        { status: 400 }
      );
    }
    if (!centreIdsForCreate.includes(collectionCentreId)) {
      return NextResponse.json({ error: "You are not assigned to this collection centre." }, { status: 403 });
    }

    let notes = body.notes ?? null;
    if (body.urgent_lot === true) {
      notes = appendAuditNote(notes, "Urgent: Yes");
    }
    if (body.lot_reference) {
      notes = appendAuditNote(notes, `Lot Reference: ${String(body.lot_reference).trim()}`);
    }
    notes = appendAuditNote(
      notes,
      `[${nowIso}] Pickup created by ${user?.name || "User"} (${user?.phone || "no-phone"})`
    );

    const insertData = {
      collection_centre_id: collectionCentreId,
      sample_bag_size: body.sample_bag_size ?? null,
      notes,
      status: initialStatus,
      requested_at: nowIso,
      picked_up_at: initialStatus === "picked_up" ? nowIso : null,
      updated_at: nowIso,
    };

    const { data, error } = await supabase
      .from("sample_pickups")
      .insert([insertData])
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
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        ...data,
        is_urgent: isUrgentFromNotes(data?.notes),
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const user = await getSessionUser();
    const executiveId = user?.id;
    if (!executiveId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: "Missing pickup id" }, { status: 400 });
    }

    const centreIds = await getAccessibleCentreIds(user);
    if (centreIds.length === 0) {
      return NextResponse.json({ error: "No collection centre assignment found." }, { status: 403 });
    }

    const { data: existingPickup, error: existingPickupError } = await supabase
      .from("sample_pickups")
      .select("id, status, notes, collection_centre_id, picked_up_at, dropped_off_at")
      .eq("id", body.id)
      .single();
    if (existingPickupError || !existingPickup) {
      return NextResponse.json({ error: "Pickup not found" }, { status: 404 });
    }
    if (!centreIds.includes(existingPickup.collection_centre_id)) {
      return NextResponse.json({ error: "You are not allowed to update this pickup." }, { status: 403 });
    }

    const nowIso = new Date().toISOString();
    const updates = {
      updated_at: nowIso,
    };
    let mergedNotes = existingPickup.notes || "";

    if ("status" in body) {
      const allowedStatuses = new Set(["samples_ready", "picked_up", "dropped", "cancelled"]);
      if (!allowedStatuses.has(body.status)) {
        return NextResponse.json({ error: "Invalid pickup status" }, { status: 400 });
      }

      const roleKey = getRoleKey(user);
      if (
        body.status === "cancelled" &&
        roleKey === "logistics"
      ) {
        return NextResponse.json(
          { error: "Logistics users are not allowed to cancel pickups." },
          { status: 403 }
        );
      }

      updates.status = body.status;
      if (body.status === "picked_up") updates.picked_up_at = existingPickup.picked_up_at || nowIso;
      if (body.status === "dropped") updates.dropped_off_at = existingPickup.dropped_off_at || nowIso;
      mergedNotes = appendAuditNote(
        mergedNotes,
        `[${nowIso}] Status changed: ${existingPickup.status} -> ${body.status} by ${user?.name || "User"}`
      );
    }

    if ("assigned_executive_id" in body) {
      updates.assigned_executive_id = body.assigned_executive_id;
    }

    if ("notes" in body) {
      mergedNotes = body.notes ?? "";
    }

    if ("lot_reference" in body && body.lot_reference) {
      mergedNotes = appendAuditNote(mergedNotes, `Lot Reference: ${String(body.lot_reference).trim()}`);
    }
    updates.notes = mergedNotes;

    const { data, error } = await supabase
      .from("sample_pickups")
      .update(updates)
      .eq("id", body.id)
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
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        ...data,
        is_urgent: isUrgentFromNotes(data?.notes),
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
