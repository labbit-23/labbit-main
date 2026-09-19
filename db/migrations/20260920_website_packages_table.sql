-- website_packages table: replaces the static lib/data/health-packages.json
-- as the source of truth for the website's wellness/health-checkup
-- packages.
--
-- Director, 2026-09-20: "I would ideally move away from the json and
-- eventually read packages from labit main that we curate matched with
-- name from website and core, and any anomalies checked. And do a sync
-- along with price sync of package updates like composition, pricing,
-- etc., for live sync from core->main. Deprecate JSON, and make sure no
-- JSON data is lost."
--
-- NOT named `packages` -- that table already exists (found live 2026-09-20:
-- id/lab_id/name/description/price/created_at, FK'd from package_items and
-- visit_details) and is a DIFFERENT concept: staff-facing, per-lab,
-- visit-level package selection. Only 1 stray row and 0 rows in the
-- referencing tables live, so it's functionally dead today, but its shape
-- and FKs signal a real distinct purpose -- reusing it for marketing/
-- website content would conflate two unrelated data models. A new table
-- avoids that collision entirely; `packages` is left untouched.
--
-- variants stored as JSONB rather than normalized into their own table --
-- preserves the JSON's exact nested shape (parameters/price/tests[]/
-- home_collection/key_inclusions/is_most_booked per variant) with zero
-- translation loss for the one-time JSON->DB migration script
-- (scripts/migrate-health-packages-json.js) that populates this table.
-- Nothing reads from this table yet; lib/packages.js still reads the JSON
-- directly until Phase 4 (frontend cutover) of the packages Live Sync plan.
--
-- core_package_id (nullable): the Phase 2 name-match link to
-- labit_core.package, added by this same migration so the matching script
-- can write into it -- NULL until a package is matched (or confirmed to
-- have no core equivalent, e.g. a pure-marketing bundle).

create table if not exists public.website_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  display_order integer,
  description text,
  variants jsonb not null default '[]'::jsonb,
  raw jsonb,
  core_package_id uuid,
  core_package_code text,
  match_status text not null default 'unmatched'
    check (match_status in ('unmatched', 'matched', 'no_core_equivalent', 'ambiguous')),
  source text not null default 'json_migration',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.website_packages.raw is
  'The exact original health-packages.json package object, verbatim -- '
  'guarantees zero data loss regardless of fields not otherwise extracted '
  '(e.g. addon_for, image, image_focus, image_alt, highlights, '
  'adCategories, sample_report_url, or the stray package-level id some '
  'entries carry, e.g. Hair Fall Profile''s "id": "001").';

-- Catalog-wide data from health-packages.json that is NOT per-package:
-- globalNotes, testCategoryMap, categoryIconMap. Single-row table.
create table if not exists public.website_package_catalog_meta (
  id integer primary key default 1,
  global_notes jsonb not null default '[]'::jsonb,
  test_category_map jsonb not null default '{}'::jsonb,
  category_icon_map jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint website_package_catalog_meta_singleton check (id = 1)
);

create index if not exists idx_website_packages_display_order on public.website_packages (display_order);
create index if not exists idx_website_packages_core_package_id on public.website_packages (core_package_id);
create index if not exists idx_website_packages_match_status on public.website_packages (match_status);

comment on table public.website_packages is
  'Website wellness/health-checkup packages. Migrating away from '
  'lib/data/health-packages.json (director, 2026-09-20) -- see this '
  'migration''s own header for the full plan and why this is a NEW table, '
  'not the pre-existing (unrelated) public.packages. Not yet read by any '
  'frontend code as of this migration.';
comment on column public.website_packages.variants is
  'JSONB array, exact shape ported from health-packages.json: '
  '[{name, parameters, price, tests: [string], home_collection, '
  'key_inclusions: [string], is_most_booked, description?}, ...].';
comment on column public.website_packages.core_package_id is
  'Link to labit_core.package.id once name-matched (Phase 2). NULL until '
  'matched or confirmed to have no core equivalent (match_status).';
