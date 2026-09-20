-- Extends the EXISTING public.packages table (id/lab_id/name/description/
-- price, FK'd from package_items and visit_details) with what's needed to
-- also hold the website's wellness/health-checkup catalog, instead of a
-- separate table.
--
-- Director, 2026-09-20: "But package has no entries. So lets get it live"
-- (packages/package_items/visit_details.package_id already existed but
-- was completely unpopulated -- 1 stray demo row, 0 package_items, 0
-- visit_details linked) -- "Dont add tables we dont need safeguarding
-- tables we never use" (after this agent first built a separate
-- website_packages table out of caution about conflating the two
-- concepts). Consolidated into this one table instead.
--
-- One row per PRICED VARIANT (packages.price is a single flat numeric,
-- and the source JSON's "packages" each contain multiple differently-
-- priced variants, e.g. "Executive Wellness Checkup" -> Executive Home/
-- Total/Plus) -- group_name clusters variants back under one marketing
-- card. Composition (which tests) goes into the pre-existing
-- package_items table (item_type='test', item_id -- expected to hold a
-- labit_core.test.id once Phase 2/3 name-matching resolves each test
-- name to a real core test row; no FK possible, cross-database).
--
-- variant_meta holds fields with no other home in this schema
-- (is_most_booked, home_collection, key_inclusions, images, highlights,
-- adCategories, addon_for, sample_report_url) rather than one column
-- each -- these are website-display-only and packages/package_items was
-- never designed for them.

ALTER TABLE public.packages
    ADD COLUMN IF NOT EXISTS group_name text,
    ADD COLUMN IF NOT EXISTS display_order integer,
    ADD COLUMN IF NOT EXISTS variant_meta jsonb,
    ADD COLUMN IF NOT EXISTS raw jsonb,
    ADD COLUMN IF NOT EXISTS core_package_id uuid,
    ADD COLUMN IF NOT EXISTS core_package_code text,
    ADD COLUMN IF NOT EXISTS match_status text NOT NULL DEFAULT 'unmatched',
    ADD COLUMN IF NOT EXISTS source text,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.packages
    DROP CONSTRAINT IF EXISTS packages_match_status_check;
ALTER TABLE public.packages
    ADD CONSTRAINT packages_match_status_check
    CHECK (match_status IN ('unmatched', 'matched', 'no_core_equivalent', 'ambiguous', 'n_a'));

COMMENT ON COLUMN public.packages.group_name IS
    'Marketing display grouping -- multiple priced variants (rows) shown '
    'under one card on the website, e.g. "Executive Home"/"Executive Total"/'
    '"Executive Plus" all group_name=''Executive Wellness Checkup''. NULL '
    'for packages with no such grouping (e.g. a future staff-entered '
    'operational package once visit_details.package_id goes live).';
COMMENT ON COLUMN public.packages.variant_meta IS
    'Website-display-only fields not modeled elsewhere: is_most_booked, '
    'home_collection, key_inclusions, image/image_focus/image_alt, '
    'highlights, adCategories, addon_for, sample_report_url. NULL for '
    'non-website packages.';
COMMENT ON COLUMN public.packages.raw IS
    'Original health-packages.json variant object verbatim, for zero data '
    'loss during the JSON->DB migration (director, 2026-09-20).';
COMMENT ON COLUMN public.packages.core_package_id IS
    'Link to labit_core.package.id once name-matched (Phase 2 of the '
    'packages Live Sync plan). NULL until matched.';
COMMENT ON COLUMN public.packages.match_status IS
    'unmatched (not yet attempted) / matched / no_core_equivalent / '
    'ambiguous (needs manual review) / n_a (not a website package).';
