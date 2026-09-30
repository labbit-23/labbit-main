// File: app/api/internal/app-booking/price-preview/route.js
// POST { test_ids, package_ids } -> real labit-core pricing (D4 package/
// discount resolution), before the patient commits to anything. Read-only,
// nothing persisted labit-core-side. See lib/labitCoreBooking.js.
import { NextResponse } from "next/server";
import { appHubAuthorized } from "@/lib/appHubAuth";
import { pricePreview } from "@/lib/labitCoreBooking";

export async function POST(request) {
  if (!appHubAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const testIds = Array.isArray(body?.test_ids) ? body.test_ids : [];
  const packageIds = Array.isArray(body?.package_ids) ? body.package_ids : [];
  if (!testIds.length && !packageIds.length) {
    return NextResponse.json({ error: "test_ids or package_ids required" }, { status: 400 });
  }
  try {
    const result = await pricePreview({ testIds, packageIds });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[app-booking/price-preview] error", err);
    return NextResponse.json({ error: "Pricing is unavailable right now" }, { status: 502 });
  }
}
