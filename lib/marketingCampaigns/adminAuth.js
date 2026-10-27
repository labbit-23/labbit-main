// Staff-session auth for /api/admin/marketing/*. NOT the internal token.
// Allowed: a logged-in staff user whose role key is in MARKETING_ADMIN_ROLES (default "director,admin"), or whose id/email is listed in
// MARKETING_ADMIN_USERS (comma list). Patients and other staff types are refused.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";

export function roleKeyOf(user) {
  if (!user) return "";
  if (user.userType === "executive") return String(user.executiveType || "").toLowerCase();
  return String(user.userType || "").toLowerCase();
}

const list = (v) => String(v || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export function canManageMarketing(user, env = process.env) {
  if (!user) return false;
  const roles = list(env.MARKETING_ADMIN_ROLES || "director,admin");
  const users = list(env.MARKETING_ADMIN_USERS);
  if (roles.includes(roleKeyOf(user))) return true;
  return [user.id, user.email, user.username].some((x) => x != null && users.includes(String(x).toLowerCase()));
}

export function actorOf(user) {
  return { id: user?.id ?? null, name: user?.name || user?.username || null, role: roleKeyOf(user) || null };
}

async function sessionUser() {
  const sessionData = await getIronSession(await cookies(), ironOptions);
  return sessionData?.user || null;
}
let loadUser = sessionUser;
/** Test seam for the 401/403 tests (pass nothing to restore). */
export function __setUserLoaderForTests(fn) { loadUser = fn || sessionUser; }

/** Wraps a route handler: 401/403 unless allowed, JSON errors, `ctx.actor`/`ctx.user` provided. */
export function marketingRoute(handler) {
  return async (request, routeCtx = {}) => {
    try {
      const user = await loadUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      if (!canManageMarketing(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const params = routeCtx?.params ? await routeCtx.params : {};
      const result = await handler(request, { user, actor: actorOf(user), params });
      if (result instanceof Response) return result;
      return NextResponse.json(result, { status: result?.ok === false ? 400 : 200 });
    } catch (err) {
      return NextResponse.json({ error: err?.message || "Internal error" }, { status: 500 });
    }
  };
}

export async function readJson(request) {
  try { return (await request.json()) || {}; } catch { return {}; }
}
