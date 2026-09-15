-- URGENT same-night fix (2026-09-15): tranche 2 enabled RLS on visits/
-- visit_details/visit_activity_log directly in production Postgres, live,
-- immediately -- but the corresponding code (migrating admin/page.js and
-- 6 other files off the anon key onto server routes) was only committed
-- locally, never deployed. VPS1 is still running the OLD admin/page.js,
-- which queries `visits` via the anon key directly -- confirmed live via
-- curl, anon key got [] back. "Admin Dashboard already is RLS Scoped?
-- Shows 0 visits?" -- yes, this is why.
--
-- Same fix pattern as the patients/patient_addresses incident earlier
-- tonight: restore anon SELECT only (identical to pre-RLS behavior since
-- RLS was off entirely before tonight). Writes stay closed -- every write
-- call site was already migrated in code, and none of them are live
-- anon-key writes today regardless of deploy status (the OLD deployed
-- code's writes go through /api/visits' PUT/POST, which use the
-- service-role key, not anon -- confirmed unaffected).
--
-- TEMPORARY. Remove once labit-main's tranche-2 commit is actually
-- deployed to VPS1 (all 7 call sites already migrated to server routes in
-- that commit -- see db/RLS_HARDENING_PLAN.md tranche 2).

CREATE POLICY visits_anon_read_temp ON public.visits
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY visit_details_anon_read_temp ON public.visit_details
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY visit_activity_log_anon_read_temp ON public.visit_activity_log
FOR SELECT
TO anon, authenticated
USING (true);
