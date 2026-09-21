import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";

// GET /api/internal/app-catalog/tests?q=&popular=1&limit=
//
// Service-to-service read for the Labit App hub (labit-app-api): SDRC's
// patient-visible test catalog with the MAIN SOC price, straight from this
// repo's own lab_tests table (which Live Sync keeps in step with labit-core's
// price master -- see app/api/admin/live-sync/pricelist-sync/route.js).
// Director, 2026-09-21: "Main is correct" -- patients pay the main SOC price.
//
// Only active + patient-visible rows with a real (> 0) price are returned:
// never a guessed or zero price. Turnaround and fasting are not in this table,
// so they are not returned (the contract marks them nullable).
//
// Auth: its own dedicated shared secret (APP_HUB_INTERNAL_TOKEN), not
// LABIT_CORE_INTERNAL_TOKEN -- one compromised integration should not hand
// over every other one.
const DEFAULT_SDRC_LAB_ID = String(
  process.env.DEFAULT_SDRC_LAB_ID ||
    process.env.DEFAULT_LAB_ID ||
    "b539c161-1e2b-480b-9526-d4b37bd37b1e"
).trim();

function getAuthToken(request) {
  return (
    request.headers.get("x-internal-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  ).trim();
}

export async function GET(request) {
  const expected = process.env.APP_HUB_INTERNAL_TOKEN || "";
  if (!expected) {
    return NextResponse.json({ error: "APP_HUB_INTERNAL_TOKEN not configured" }, { status: 503 });
  }
  const provided = getAuthToken(request);
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  // Strip characters that mean something in a PostgREST/ILIKE filter.
  const q = String(url.searchParams.get("q") || "").replace(/[%_,()*\\]/g, " ").trim();
  const popularOnly = ["1", "true"].includes(url.searchParams.get("popular") || "");
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 30, 50));

  let query = supabase
    .from("lab_tests")
    .select("internal_code, lab_test_name, price, is_most_popular")
    .eq("lab_id", DEFAULT_SDRC_LAB_ID)
    .eq("is_active", true)
    .eq("is_patient_visible", true)
    .not("internal_code", "is", null)
    .gt("price", 0);
  if (popularOnly) query = query.eq("is_most_popular", true);
  if (q.length >= 2) query = query.ilike("lab_test_name", `%${q}%`);
  query = query
    .order("is_most_popular", { ascending: false })
    .order("lab_test_name", { ascending: true })
    .limit(limit);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Failed to load catalog" }, { status: 500 });
  }
  return NextResponse.json({
    tests: (data || []).map((r) => ({
      providerTestCode: String(r.internal_code).trim().toUpperCase(),
      name: r.lab_test_name,
      price: Number(r.price),
      patientVisible: true,
      patientPopular: !!r.is_most_popular,
    })),
  });
}
