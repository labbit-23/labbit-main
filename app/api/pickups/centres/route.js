import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { getIronSession } from "iron-session";
import { ironOptions as sessionOptions } from "@/lib/session";
import { cookies } from "next/headers";

const ADMIN_ROLES = new Set(["admin", "manager", "director"]);
const LOGISTICS_LAB_WIDE_ROLES = new Set(["logistics"]);

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

async function getLabIds(executiveId) {
  const { data, error } = await supabase
    .from("executives_labs")
    .select("lab_id")
    .eq("executive_id", executiveId);
  if (error) throw error;
  return (data || []).map((row) => row.lab_id);
}

async function getCentresByLabs(labIds) {
  if (!Array.isArray(labIds) || labIds.length === 0) return [];

  const selectColumns = "id, centre_name, phone, contact_email, address";

  const firstTry = await supabase
    .from("collection_centre")
    .select(selectColumns)
    .in("lab_id", labIds)
    .order("centre_name", { ascending: true });

  if (!firstTry.error) return firstTry.data || [];

  const secondTry = await supabase
    .from("collection_centres")
    .select(selectColumns)
    .in("lab_id", labIds)
    .order("centre_name", { ascending: true });

  if (!secondTry.error) return secondTry.data || [];

  throw new Error(firstTry.error?.message || secondTry.error?.message || "Failed to fetch collection centres");
}

export async function GET() {
  try {
    const user = await getSessionUser();
    const executiveId = user?.id;
    if (!executiveId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const roleKey = getRoleKey(user);

    if (ADMIN_ROLES.has(roleKey) || LOGISTICS_LAB_WIDE_ROLES.has(roleKey)) {
      const labIds = await getLabIds(executiveId);
      const centres = await getCentresByLabs(labIds);
      const withRoles = centres.map((centre) => ({
        ...centre,
        roles: ADMIN_ROLES.has(roleKey) ? ["admin"] : ["logistics"],
      }));
      return NextResponse.json(withRoles, { status: 200 });
    }

    const { data, error } = await supabase
      .from("executives_collection_centres")
      .select(`
        role,
        collection_centre:collection_centre_id (
          id,
          centre_name,
          phone,
          contact_email,
          address
        )
      `)
      .eq("executive_id", executiveId)
      .in("role", ["requester", "logistics", "admin"]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const centresMap = new Map();
    (data || []).forEach((row) => {
      const centre = row.collection_centre;
      if (!centre?.id) return;

      if (!centresMap.has(centre.id)) {
        centresMap.set(centre.id, {
          ...centre,
          roles: [row.role]
        });
      } else {
        const existing = centresMap.get(centre.id);
        if (!existing.roles.includes(row.role)) {
          existing.roles.push(row.role);
        }
      }
    });

    return NextResponse.json(Array.from(centresMap.values()), { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
