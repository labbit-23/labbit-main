// Server-only helper: session guard + fail-closed proxy to the panel FastAPI.
// The browser never sees PANEL_INTERNAL_KEY or PANEL_API_URL.
import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { ironOptions, isSessionValid } from "@/lib/session";

const ALLOWED = new Set(["director", "director_ceo"]);

export async function proxyPanel(request, path) {
  const noStore = { "Cache-Control": "no-store" };
  try {
    const response = NextResponse.next();
    const session = await getIronSession(request, response, ironOptions);
    const user = session?.user;
    if (!user?.id || !isSessionValid(session)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
    }
    const role = String(user.executiveType || "").toLowerCase().trim();
    if (user.userType !== "executive" || !ALLOWED.has(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
    }
    const key = process.env.PANEL_INTERNAL_KEY;
    if (!key) {
      return NextResponse.json({ error: "Panel unavailable" }, { status: 500, headers: noStore });
    }
    const base = (process.env.PANEL_API_URL || "http://127.0.0.1:8100").replace(/\/+$/, "");
    const upstream = await fetch(`${base}${path}`, {
      headers: { "X-Panel-Key": key, "X-Panel-User": String(user.id) },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!upstream.ok) {
      const status = upstream.status === 404 ? 404 : 502;
      return NextResponse.json({ error: "Panel service error" }, { status, headers: noStore });
    }
    const data = await upstream.json();
    return NextResponse.json(data, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Panel service error" }, { status: 502, headers: noStore });
  }
}
