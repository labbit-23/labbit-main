import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions } from "@/lib/session";

export const dynamic = "force-dynamic";

export function canAccessCto(user) {
  return user?.userType === "executive" && String(user?.executiveType || "").toLowerCase() === "director";
}

export async function requireCto(request) {
  const response = NextResponse.next();
  const session = await getIronSession(request, response, ironOptions);
  if (!canAccessCto(session?.user)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user: session.user };
}

export function deliverConfig() {
  const baseUrl = String(process.env.LABIT_DELIVER_BASE_URL || "").trim().replace(/\/+$/, "");
  const token = String(process.env.LABIT_DELIVER_ADMIN_TOKEN || process.env.DELIVER_ADMIN_TOKEN || "").trim();
  return { baseUrl, token };
}

export async function proxyDeliverJson(path, { method = "GET", searchParams = null, body = null } = {}) {
  const { baseUrl, token } = deliverConfig();
  if (!baseUrl || !token) {
    return NextResponse.json(
      { error: "LABIT_DELIVER_BASE_URL and LABIT_DELIVER_ADMIN_TOKEN are required" },
      { status: 503 }
    );
  }

  const url = new URL(`${baseUrl}${path}`);
  if (searchParams) {
    for (const [key, value] of searchParams.entries()) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Internal-Token": token,
    },
    cache: "no-store",
    body: body == null ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  return NextResponse.json(payload, { status: response.status });
}

