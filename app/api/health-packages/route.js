import { NextResponse } from "next/server";
import healthPackagesData from "@/lib/data/health-packages.json";

// Plain public read of this repo's own health-packages.json -- the one
// verified-current copy (kept in sync from sdrc-website's own repo via
// scripts/sync-health-packages.mjs). First caller: labit-patient's
// Packages page, which was about to point at the PUBLIC
// sdrc.in/health-packages.json until that turned out to be a stale,
// disconnected static artifact (last-modified predating even this file's
// oldest tracked update, and no route in sdrc-website actually serves
// that path at all -- confirmed 2026-09-12). No new data model here,
// just a route that didn't exist yet for this already-imported JSON.
export async function GET() {
  return NextResponse.json(healthPackagesData);
}
