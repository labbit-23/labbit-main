#!/usr/bin/env node
// One-time migration: loads lib/data/health-packages.json into the
// EXISTING public.packages table (see db/migrations/
// 20260920_packages_website_columns.sql for why this table, not a new
// one). One row per priced VARIANT (packages.price is flat/single-value;
// the source JSON groups several differently-priced variants under one
// marketing package) -- group_name clusters variants back under one card
// on the website. Idempotent by (group_name, name): safe to re-run if the
// JSON changes before the frontend cutover (Phase 4) lands.
//
// NOTE: this JSON file is itself synced FROM sdrc-website by
// scripts/sync-health-packages.mjs (found while building this migration --
// health-packages.json is not hand-authored in this repo, it's a pulled
// copy). That puller is untouched by this script; it still writes the JSON
// file today. Repointing it (or retiring it) is Phase 4's job, once
// lib/packages.js itself reads from the DB instead of the JSON.
//
// Composition (which tests each variant contains) is NOT written to
// package_items by this script -- that needs each test NAME resolved to a
// real labit_core.test.id first (Phase 2/3, name-matching), so for now
// the test list lives only in variant_meta.tests / raw, unlinked.
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const SOURCE = path.resolve(ROOT, "lib/data/health-packages.json");
const SDRC_LAB_ID = "b539c161-1e2b-480b-9526-d4b37bd37b1e"; // "SDRC Diagnostics" in public.labs

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}
const supabase = createClient(supabaseUrl, serviceKey);

function variantMeta(pkg, variant) {
  const meta = {};
  for (const key of [
    "is_most_booked",
    "home_collection",
    "key_inclusions",
    "image",
    "image_focus",
    "image_alt",
    "highlights",
    "adCategories",
    "addon_for",
    "sample_report_url"
  ]) {
    if (variant[key] !== undefined) meta[key] = variant[key];
  }
  if (Array.isArray(variant.tests)) meta.tests = variant.tests;
  if (pkg.id !== undefined) meta.legacy_package_id = pkg.id;
  return meta;
}

async function main() {
  const raw = await fs.readFile(SOURCE, "utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data.packages)) throw new Error("Missing packages[] in source JSON");

  let inserted = 0;
  let updated = 0;
  let variantCount = 0;

  for (const pkg of data.packages) {
    const variants = Array.isArray(pkg.variants) ? pkg.variants : [];
    for (const variant of variants) {
      variantCount += 1;
      const row = {
        lab_id: SDRC_LAB_ID,
        group_name: pkg.name,
        name: variant.name,
        description: variant.description ?? pkg.description ?? null,
        price: variant.price ?? null,
        display_order: pkg.display_order ?? null,
        variant_meta: variantMeta(pkg, variant),
        raw: variant,
        source: "json_migration",
        match_status: "unmatched"
      };

      const { data: existing, error: findErr } = await supabase
        .from("packages")
        .select("id")
        .eq("group_name", pkg.name)
        .eq("name", variant.name)
        .maybeSingle();
      if (findErr) throw findErr;

      if (existing) {
        const { error } = await supabase
          .from("packages")
          .update({ ...row, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
        updated += 1;
      } else {
        const { error } = await supabase.from("packages").insert(row);
        if (error) throw error;
        inserted += 1;
      }
    }
  }

  console.log(
    `[migrate-health-packages-json-to-db] ${inserted} inserted, ${updated} updated, ` +
      `${variantCount} total variants across ${data.packages.length} packages in source JSON.`
  );
}

main().catch((err) => {
  console.error(`[migrate-health-packages-json-to-db] error: ${err?.message || String(err)}`);
  process.exit(1);
});
