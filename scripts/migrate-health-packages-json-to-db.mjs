#!/usr/bin/env node
// One-time migration: loads lib/data/health-packages.json into
// public.website_packages / public.website_package_catalog_meta (see
// db/migrations/20260920_website_packages_table.sql). Idempotent by name
// (upsert on name) so it's safe to re-run if the JSON changes before the
// frontend cutover (Phase 4) lands.
//
// NOTE: this JSON file is itself synced FROM sdrc-website by
// scripts/sync-health-packages.mjs (found while building this migration --
// health-packages.json is not hand-authored in this repo, it's a pulled
// copy). That puller is untouched by this script; it still writes the JSON
// file today. Repointing it (or retiring it) is Phase 4's job, once
// lib/packages.js itself reads from the DB instead of the JSON.
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const SOURCE = path.resolve(ROOT, "lib/data/health-packages.json");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}
const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
  const raw = await fs.readFile(SOURCE, "utf8");
  const data = JSON.parse(raw);

  if (!Array.isArray(data.packages)) throw new Error("Missing packages[] in source JSON");

  let inserted = 0;
  let updated = 0;

  for (const pkg of data.packages) {
    const row = {
      name: pkg.name,
      display_order: pkg.display_order ?? null,
      description: pkg.description ?? null,
      variants: pkg.variants ?? [],
      raw: pkg,
      source: "json_migration"
    };

    const { data: existing, error: findErr } = await supabase
      .from("website_packages")
      .select("id")
      .eq("name", pkg.name)
      .maybeSingle();
    if (findErr) throw findErr;

    if (existing) {
      const { error } = await supabase
        .from("website_packages")
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw error;
      updated += 1;
    } else {
      const { error } = await supabase.from("website_packages").insert(row);
      if (error) throw error;
      inserted += 1;
    }
  }

  const { error: metaError } = await supabase
    .from("website_package_catalog_meta")
    .upsert(
      {
        id: 1,
        global_notes: data.globalNotes ?? [],
        test_category_map: data.testCategoryMap ?? {},
        category_icon_map: data.categoryIconMap ?? {},
        updated_at: new Date().toISOString()
      },
      { onConflict: "id" }
    );
  if (metaError) throw metaError;

  console.log(
    `[migrate-health-packages-json-to-db] ${inserted} inserted, ${updated} updated, ` +
      `${data.packages.length} total packages in source JSON, catalog meta written.`
  );
}

main().catch((err) => {
  console.error(`[migrate-health-packages-json-to-db] error: ${err?.message || String(err)}`);
  process.exit(1);
});
