-- URGENT same-night fix: enabling RLS on patients/patient_addresses
-- (20260914_rls_phase2b_patients_guc.sql) broke every nested PostgREST
-- embed of them through `visits` via the anon key -- confirmed live via
-- curl: `visits?select=id,patient:patient_id(name,phone)` returned
-- `patient: null` for every row. Real, live call sites that do this:
-- app/phlebo/YourDayView.js, app/phlebo/ActiveVisitsTab.js (also embeds
-- patient_addresses), app/phlebo/PatientLookupTab.js's createVisit,
-- app/admin/page.js. These are the phlebo app's main daily-use views --
-- this cannot wait for the full server-route migration (db/
-- RLS_HARDENING_PLAN.md tranche 1/2) to land safely before tomorrow AM.
--
-- Fix: restore anon SELECT only (not INSERT/UPDATE/DELETE) on both tables
-- -- identical to their actual pre-migration behavior (RLS was off
-- entirely, so anon could always read everything anyway; this changes
-- nothing about what data was reachable, it only re-permits the read path
-- that already existed). Writes stay closed: patients had zero anon write
-- call sites to begin with, and patient_addresses' one write call site
-- (YourDayView.js confirmLocUpdate) is already migrated to
-- app/api/internal/patient-addresses/[id]/route.js (service-role/pgScoped,
-- not anon).
--
-- TEMPORARY. Remove this policy once every nested-embed call site above is
-- migrated to a server route (same pattern as the search/address-update
-- routes already shipped tonight) -- tracked in db/RLS_HARDENING_PLAN.md.

CREATE POLICY patients_anon_read_temp ON public.patients
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY patient_addresses_anon_read_temp ON public.patient_addresses
FOR SELECT
TO anon, authenticated
USING (true);
