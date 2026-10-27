// Staff-session auth for the marketing bot/inbox/tracker admin routes. Same session + hasPermission pattern as
// app/api/admin/reports/*, with dedicated permissions (granted by the migration; director has "*").
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { hasPermission } from "@/lib/uac/policy";
import { writeAuditLog } from "@/lib/audit/logger";

export function labIdsOf(user) {
  const ids = Array.isArray(user?.labIds) ? user.labIds : [];
  return ids.map((v) => String(v || "").trim()).filter(Boolean);
}

let loadUser = async () => (await getIronSession(await cookies(), ironOptions))?.user || null;
let checkPermission = (user, permission) => hasPermission(user, permission, { labId: labIdsOf(user)[0] || null });
/** Test seams for the 401/403 tests (call with no arguments to restore). */
export function __setStaffGateForTests({ user, permission } = {}) {
  loadUser = user || (async () => (await getIronSession(await cookies(), ironOptions))?.user || null);
  checkPermission = permission || ((u, p) => hasPermission(u, p, { labId: labIdsOf(u)[0] || null }));
}

export async function requireStaff(permission) {
  const user = await loadUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const ok = await checkPermission(user, permission);
  if (!ok) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

// Audit rows carry the action, the thread/setting id and counts only. Never phone numbers, names, MRNs or message text.
export async function auditStaff(request, user, action, entityType, entityId, metadata = null) {
  await writeAuditLog({ request, user, roleKey: user?.roleKey || user?.userType || null, action: `marketing_bot.${action}`, entityType, entityId, labId: labIdsOf(user)[0] || null, metadata });
}

export async function db() {
  return (await import("@/lib/supabaseServer")).supabase;
}

export async function readJson(request) {
  try { return (await request.json()) || {}; } catch { return {}; }
}

/** Route wrapper: staff session + dedicated permission, JSON in/out. handler(request, { user, params }) returns an object or a Response. */
export function botRoute(permission, handler) {
  return async (request, routeCtx = {}) => {
    try {
      const gate = await requireStaff(permission);
      if (gate.error) return gate.error;
      const params = routeCtx?.params ? await routeCtx.params : {};
      const result = await handler(request, { user: gate.user, params });
      if (result instanceof Response) return result;
      return NextResponse.json(result, { status: result?.ok === false ? (result.status || 400) : 200 });
    } catch (err) {
      return NextResponse.json({ error: err?.message || "Internal error" }, { status: 500 });
    }
  };
}
