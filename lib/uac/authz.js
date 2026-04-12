import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";
import { hasPermission, resolveRoleKey } from "@/lib/uac/policy";

export async function getSessionUser(request) {
  const sessionResponse = NextResponse.next();
  const session = await getIronSession(request, sessionResponse, ironOptions);
  return session?.user || null;
}

export function deny(message = "Forbidden", status = 403, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function checkPermission(user, permission) {
  const roleKey = resolveRoleKey(user);
  return {
    ok: hasPermission(user, permission),
    roleKey
  };
}
