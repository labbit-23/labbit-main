import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";
import { appHubAuthorized, DEFAULT_SDRC_LAB_ID } from "@/lib/appHubAuth";

// GET /api/internal/app-catalog/packages?q=&limit=
//
// Service-to-service read for the Labit App hub: SDRC's consolidated
// wellness/health-checkup package catalog. Source of truth is
// public.packages (+ public.package_items for composition) -- NOT
// /api/health-packages (still reads the old static health-packages.json;
// never cut over -- see commits 043f731/396d727, 2026-09-20: a first pass
// added a separate website_packages table, then explicitly reversed that
// ("Dont add tables we dont need") and consolidated into the pre-existing
// packages/package_items tables instead, price/name-matched against
// labit_core.package). One row per priced VARIANT (packages.price is
// flat; group_name clusters variants back under one marketing card, e.g.
// "Executive Home"/"Executive Total"/"Executive Plus" all group_name=
// "Executive Wellness Checkup").
//
// Composition: package_items.item_id holds labit_core.test.id directly
// (no FK -- cross-database by design, same posture as core_package_id).
// That id can't be resolved to a display name without a second call to
// labit-core, and nothing here needs one: variant_meta.tests (and raw.tests,
// identical) already carries the original plain-text test/panel names
// authored for the website catalog -- exactly what a patient needs to see,
// with zero cross-service join.
//
// No patient-visibility flag exists (or is needed) on packages: every row
// with `source` set came from the public wellness website catalog, so it
// is patient-facing by construction, unlike lab_tests' internal B2B
// catalog. The 1 pre-existing demo row (source IS NULL) predates this
// consolidation and is excluded.
export async function GET(request) {
  if (!appHubAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const q = String(url.searchParams.get("q") || "").replace(/[%_,()*\\]/g, " ").trim();
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 30, 50));

  let query = supabase
    .from("packages")
    .select("id, name, price, group_name, variant_meta")
    .eq("lab_id", DEFAULT_SDRC_LAB_ID)
    .not("source", "is", null)
    .gt("price", 0);
  if (q.length >= 2) query = query.ilike("name", `%${q}%`);
  query = query.order("group_name", { ascending: true }).order("display_order", { ascending: true }).limit(limit);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Failed to load packages" }, { status: 500 });
  }
  return NextResponse.json({
    packages: (data || []).map((p) => ({
      providerPackageCode: p.id,
      name: p.name,
      price: Number(p.price),
      groupName: p.group_name || null,
      testNames: Array.isArray(p.variant_meta?.tests) ? p.variant_meta.tests : [],
    })),
  });
}
