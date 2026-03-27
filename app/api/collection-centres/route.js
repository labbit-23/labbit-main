import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { ironOptions as sessionOptions } from "@/lib/session";

const ADMIN_ROLES = new Set(["admin", "manager", "director"]);

async function getSessionUser() {
  const cookieStore = await cookies();
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

async function resolveTableName() {
  const firstTry = await supabase.from("collection_centre").select("id").limit(1);
  if (!firstTry.error) return "collection_centre";

  const secondTry = await supabase.from("collection_centres").select("id").limit(1);
  if (!secondTry.error) return "collection_centres";

  throw new Error(firstTry.error?.message || secondTry.error?.message || "Collection centre table not found");
}

async function getMyLabIds(executiveId) {
  const { data, error } = await supabase
    .from("executives_labs")
    .select("lab_id")
    .eq("executive_id", executiveId);
  if (error) throw error;
  return (data || []).map((row) => row.lab_id);
}

export async function GET(request) {
  try {
    const user = await getSessionUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    }

    const tableName = await resolveTableName();
    const url = new URL(request.url);
    const myLabsOnly = url.searchParams.get("my_labs") === "true";

    let query = supabase
      .from(tableName)
      .select("id, lab_id, centre_name, contact_email, phone, address, created_at")
      .order("centre_name", { ascending: true });

    if (myLabsOnly) {
      const labIds = await getMyLabIds(user.id);
      if (labIds.length === 0) {
        return NextResponse.json([], { status: 200 });
      }
      query = query.in("lab_id", labIds);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || [], { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const user = await getSessionUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    }
    const roleKey = getRoleKey(user);
    if (!ADMIN_ROLES.has(roleKey)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    if (!body?.lab_id || !body?.centre_name?.trim()) {
      return NextResponse.json({ error: "lab_id and centre_name are required" }, { status: 400 });
    }

    const tableName = await resolveTableName();
    const payload = {
      lab_id: body.lab_id,
      centre_name: body.centre_name.trim(),
      contact_email: body.contact_email?.trim() || null,
      phone: body.phone?.trim() || null,
      address: body.address?.trim() || null,
    };

    const { data, error } = await supabase
      .from(tableName)
      .insert(payload)
      .select("id, lab_id, centre_name, contact_email, phone, address, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const user = await getSessionUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 401 });
    }
    const roleKey = getRoleKey(user);
    if (!ADMIN_ROLES.has(roleKey)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    if (!body?.id || !body?.lab_id || !body?.centre_name?.trim()) {
      return NextResponse.json({ error: "id, lab_id and centre_name are required" }, { status: 400 });
    }

    const tableName = await resolveTableName();
    const payload = {
      lab_id: body.lab_id,
      centre_name: body.centre_name.trim(),
      contact_email: body.contact_email?.trim() || null,
      phone: body.phone?.trim() || null,
      address: body.address?.trim() || null,
    };

    const { data, error } = await supabase
      .from(tableName)
      .update(payload)
      .eq("id", body.id)
      .select("id, lab_id, centre_name, contact_email, phone, address, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
