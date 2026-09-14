-- RLS hardening, phase 2b, tranche 2 (PREPARED, NOT YET APPLIED): visits,
-- visit_details, visit_activity_log. Do not run this until every anon-key
-- call site listed in db/RLS_HARDENING_PLAN.md's tranche-2 section has been
-- migrated to a server route -- same lesson as tranche 1's same-night
-- nested-embed incident, at larger scale (7 files, ~19 call sites here vs.
-- 2/1 for patients/patient_addresses).
--
-- visits HAS its own lab_id column directly (confirmed via information_
-- schema, 2026-09-14) -- no EXISTS-join needed, unlike patients. visit_details
-- and visit_activity_log only have visit_id, so they're scoped via EXISTS
-- through visits, same shape as patients_addresses_scope's EXISTS through
-- patient_external_keys.

BEGIN;

DROP POLICY IF EXISTS visits_scope ON public.visits;
CREATE POLICY visits_scope ON public.visits
USING (
    public.lm_scope_mode() = 'all'
    OR (public.lm_scope_mode() = 'lab' AND lab_id = public.lm_scope_lab_id())
)
WITH CHECK (
    public.lm_scope_mode() = 'all'
    OR (public.lm_scope_mode() = 'lab' AND lab_id = public.lm_scope_lab_id())
);

DROP POLICY IF EXISTS visit_details_scope ON public.visit_details;
CREATE POLICY visit_details_scope ON public.visit_details
USING (
    public.lm_scope_mode() = 'all'
    OR EXISTS (
        SELECT 1 FROM public.visits v
        WHERE v.id = visit_details.visit_id
          AND public.lm_scope_mode() = 'lab'
          AND v.lab_id = public.lm_scope_lab_id()
    )
)
WITH CHECK (
    public.lm_scope_mode() = 'all'
    OR EXISTS (
        SELECT 1 FROM public.visits v
        WHERE v.id = visit_details.visit_id
          AND public.lm_scope_mode() = 'lab'
          AND v.lab_id = public.lm_scope_lab_id()
    )
);

DROP POLICY IF EXISTS visit_activity_log_scope ON public.visit_activity_log;
CREATE POLICY visit_activity_log_scope ON public.visit_activity_log
USING (
    public.lm_scope_mode() = 'all'
    OR EXISTS (
        SELECT 1 FROM public.visits v
        WHERE v.id = visit_activity_log.visit_id
          AND public.lm_scope_mode() = 'lab'
          AND v.lab_id = public.lm_scope_lab_id()
    )
)
WITH CHECK (
    public.lm_scope_mode() = 'all'
    OR EXISTS (
        SELECT 1 FROM public.visits v
        WHERE v.id = visit_activity_log.visit_id
          AND public.lm_scope_mode() = 'lab'
          AND v.lab_id = public.lm_scope_lab_id()
    )
);

-- 2026-09-14, all 7 anon-key call sites confirmed migrated to server
-- routes (ActiveVisitsTab.js, admin/page.js, PatientLookupTab.js,
-- YourDayView.js, DashboardMetrics.js, VisitDetailTab.js,
-- VisitBillingPanel.js) -- enabling RLS now, same as tranche 1.
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_activity_log ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.visits TO labit_main_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_details TO labit_main_rw;
GRANT SELECT, INSERT ON public.visit_activity_log TO labit_main_rw;

-- Not RLS-restricted yet (out of scope for tranche 2 -- executives is
-- tranche 3, labs/visit_time_slots are the lower-priority reference
-- tables), but the new server routes built for THIS tranche read them via
-- labit_main_rw (which has no default grants the way anon/authenticated
-- do), so they need a plain GRANT now regardless of when RLS itself lands
-- on them.
GRANT SELECT ON public.executives TO labit_main_rw;
GRANT SELECT ON public.labs TO labit_main_rw;
GRANT SELECT ON public.visit_time_slots TO labit_main_rw;

COMMIT;
