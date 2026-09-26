import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { kioskIronOptions } from "@/lib/kioskSession";

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const kioskSession = await getIronSession(cookieStore, kioskIronOptions);
    const kioskUser = kioskSession?.kioskUser;
    if (!kioskUser?.authenticated) {
      return new Response("Kiosk login required", { status: 403 });
    }

    const url = new URL(request.url);
    const reqid = String(url.searchParams.get("reqid") || "").trim();
    if (!reqid) return new Response("Missing reqid", { status: 400 });
    // Requisition ids are non-sequential UUIDs, so possession of the barcode is the credential.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reqid)) return new Response("Invalid reqid", { status: 400 });

    const proxyUrl = new URL("/api/admin/reports/dispatch-status", request.url);
    proxyUrl.searchParams.set("reqid", reqid);
    proxyUrl.searchParams.set("source", "kiosk");

    const proxied = await fetch(proxyUrl.toString(), {
      method: "GET",
      headers: {
        cookie: request.headers.get("cookie") || "",
        "x-report-source": "kiosk",
      },
      cache: "no-store",
    });

    const body = await proxied.text();
    return new Response(body, {
      status: proxied.status,
      headers: {
        "content-type": proxied.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed kiosk dispatch status validation" },
      { status: 500 }
    );
  }
}
