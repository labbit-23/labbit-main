import { getIronSession } from "iron-session";
import { NextResponse } from "next/server";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";

const ADMIN_ROLES = new Set(["admin", "manager", "director"]);

function roleKey(user) {
  if (!user) return "";
  if (user.userType === "executive") return String(user.executiveType || "").toLowerCase();
  return String(user.userType || "").toLowerCase();
}

export function canManageCampaigns(user) {
  return ADMIN_ROLES.has(roleKey(user));
}

export async function getCampaignSessionUser(request) {
  const response = NextResponse.next();
  const session = await getIronSession(request, response, ironOptions);
  return session?.user || null;
}

export async function resolveLabIdForUser(user) {
  const directLabId = String(user?.lab_id || user?.labId || "").trim();
  if (directLabId) return directLabId;

  const labIds = Array.isArray(user?.labIds) ? user.labIds.filter(Boolean) : [];
  if (labIds.length > 0) return String(labIds[0]);

  const { data, error } = await supabase
    .from("labs")
    .select("id")
    .eq("is_default", true)
    .single();
  if (error || !data?.id) {
    throw new Error("Unable to resolve lab_id for campaign operations");
  }

  return String(data.id);
}

