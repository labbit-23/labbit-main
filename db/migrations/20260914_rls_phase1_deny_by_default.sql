-- RLS hardening, phase 1: deny-by-default on every table the anon key never
-- legitimately touches. Director, 2026-09-14: "start hardening RLS in this
-- labit main repo this time knowing well soon there will be a new tenant" --
-- short-term deliverable must ship with zero UI/UX change.
--
-- What this fixes: `public` schema tables get Supabase's default
-- `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated` with no
-- RLS to restrict it (confirmed live 2026-09-14 -- every table below had
-- relrowsecurity=false). NEXT_PUBLIC_SUPABASE_ANON_KEY ships in every page's
-- JS bundle by definition, so this is a real, live, non-hypothetical
-- exposure today, not just a multi-tenant readiness gap: anyone who reads
-- that key out of the shipped bundle can hit PostgREST directly and
-- select/insert/update/delete on otp_codes, users, uac_role_permissions,
-- report_master, etc. with zero auth of any kind.
--
-- Why this is zero-UX-risk: `service_role` has BYPASSRLS (confirmed via
-- pg_roles, 2026-09-14) and that's what every legitimate labit-main backend
-- path already uses (lib/supabaseServer.js, imported by the vast majority
-- of app/api/**/route.js files). Enabling RLS with zero policies makes a
-- table deny-all to `anon`/`authenticated` only -- roles that, per the
-- audit below, have no legitimate call site touching these specific tables
-- anywhere in this repo (grep across all 20 files that import the anon
-- client, lib/supabaseClient.js, plus a cross-repo sweep of labit-ui/
-- labit-patient/labit-website/labit-one/sdrc for the same table names
-- against any anon-key usage -- zero hits). cto_service_latest/
-- cto_service_logs already run this exact deny-by-default pattern in
-- production (enabled, zero policies) with no incident, confirming the
-- approach works here.
--
-- Deliberately NOT included in this pass -- these tables ARE read/written
-- via the anon key from real, live code paths (browser components or
-- server routes using the anon client instead of the service-role one) and
-- need per-table policy design + testing, not a blanket deny:
--   visits, visit_time_slots, visit_statuses, visit_details,
--   visit_activity_log, executives, patients, patient_addresses,
--   quickbookings, labs, labs_apis, lab_tests, packages, sample_pickups,
--   whatsapp_messages
-- `labs_apis` in particular is the most urgent item in that follow-up list
-- -- it is read via the anon client in app/api/quickbook/route.js and
-- app/api/whatsapp/send/route.js and, by its name, likely holds per-lab API
-- credentials; treat that one as priority #1 for the phase-2 pass, not
-- last.
--
-- Out of scope for this pass (different Supabase-hosted repo, not
-- labit-main): bmd_patients/bmd_results/bmd_scans/ecg_studies already have
-- RLS enabled but with a `using (true)` read-all policy -- fully exposed to
-- anon reads today, just not through any labit-main code path. Belongs to
-- labit-dexa; flagged for a separate pass, not touched here.

alter table public.audit_logs enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.campaign_short_link_clicks enable row level security;
alter table public.campaign_short_links enable row level security;
alter table public.campaigns enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.collection_centre enable row level security;
alter table public.cto_events enable row level security;
alter table public.cto_service_daily_digest enable row level security;
alter table public.executives_collection_centres enable row level security;
alter table public.executives_labs enable row level security;
alter table public.global_test_aliases enable row level security;
alter table public.global_tests enable row level security;
alter table public.otp_codes enable row level security;
alter table public.package_items enable row level security;
alter table public.report_auto_dispatch_daily_metrics enable row level security;
alter table public.report_auto_dispatch_events enable row level security;
alter table public.report_auto_dispatch_jobs enable row level security;
alter table public.report_dispatch_logs enable row level security;
alter table public.report_feedback enable row level security;
alter table public.report_half_days enable row level security;
alter table public.report_master enable row level security;
alter table public.report_run_log enable row level security;
alter table public.results enable row level security;
alter table public.stg_lab_tests_raw enable row level security;
alter table public.stg_loinc_raw enable row level security;
alter table public.uac_role_permissions enable row level security;
alter table public.users enable row level security;
alter table public.website_events enable row level security;
alter table public.whatsapp_agent_locks enable row level security;

-- No policies added deliberately: RLS enabled + zero policies = deny-all
-- to anon/authenticated, allow-all to service_role (BYPASSRLS). If a
-- legitimate anon/authenticated need for one of these tables ever shows
-- up, add a narrow policy then -- don't add speculative ones now.
