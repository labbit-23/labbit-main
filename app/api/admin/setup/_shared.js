import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { supabase } from "@/lib/supabaseServer";

const ALLOWED_EXEC_TYPES = new Set(["director"]);

export function getRoleKey(user) {
  if (!user) return "";
  if (user.userType === "executive") return String(user.executiveType || "").toLowerCase();
  return String(user.userType || "").toLowerCase();
}

export function canManageSetup(user) {
  return ALLOWED_EXEC_TYPES.has(getRoleKey(user));
}

export function parseMaybeJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return {};
}

export async function getSessionUserAndLab(request, response) {
  const session = await getIronSession(request, response, ironOptions);
  const user = session?.user || null;
  const labId = Array.isArray(user?.labIds) ? String(user.labIds.find(Boolean) || "") : "";
  return { user, labId };
}

export async function getWhatsappOutboundConfig(labId) {
  const { data, error } = await supabase
    .from("labs_apis")
    .select("id, lab_id, api_name, base_url, auth_details, templates")
    .eq("lab_id", labId)
    .eq("api_name", "whatsapp_outbound")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}
