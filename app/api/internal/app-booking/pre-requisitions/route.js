// File: app/api/internal/app-booking/pre-requisitions/route.js
// POST { name, phone, test_ids, package_ids } -> creates a real
// labit-core pre-requisition (a persisted quote, not yet billed). Returns
// its id + priced line items + total -- the caller then takes the patient
// to Cashfree with that exact total, and only calls .../convert once
// Cashfree confirms the charge (see convert route's own comment).
import { NextResponse } from "next/server";
import { appHubAuthorized } from "@/lib/appHubAuth";
import { createPreRequisition } from "@/lib/labitCoreBooking";

export async function POST(request) {
  if (!appHubAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const name = String(body?.name || "").trim();
  const phone = String(body?.phone || "").trim();
  const testIds = Array.isArray(body?.test_ids) ? body.test_ids : [];
  const packageIds = Array.isArray(body?.package_ids) ? body.package_ids : [];
  if (!name || !phone || (!testIds.length && !packageIds.length)) {
    return NextResponse.json({ error: "name, phone and at least one test/package are required" }, { status: 400 });
  }
  try {
    const result = await createPreRequisition({ name, phone, testIds, packageIds });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("[app-booking/pre-requisitions] error", err);
    return NextResponse.json({ error: "Could not create the booking quote" }, { status: 502 });
  }
}
