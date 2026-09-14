-- RLS hardening, phase 2b, tranche 1: patients + patient_addresses +
-- patient_external_keys. First slice of the Supabase-independence direction
-- (director, 2026-09-14: "moving towards Supabase independence is a better
-- path for this") -- policies here are keyed on Postgres session GUCs set by
-- labit-main's own server code (lib/pgScoped.js), the same mechanism
-- labit-core already runs in production (schema/021_rls.sql), NOT on
-- Supabase Auth / auth.uid() (this app has no Supabase-authenticated users --
-- iron-session is the real auth, see docs/rls-draft.sql's own unresolved
-- TODO #4 for why the auth.uid()-based draft was never viable as-is).
--
-- Fail-closed by the same mechanism as core: current_setting(name, true)
-- returns NULL when nothing set it, every predicate's OR-chain evaluates to
-- NULL (never TRUE) on NULL, so a caller that forgot to establish scope gets
-- zero rows, not all rows.
--
-- Schema note (confirmed 2026-09-14): patients and patient_addresses have NO
-- lab_id column of their own -- tenancy is only reachable via
-- patient_external_keys.lab_id (matches docs/rls-draft.sql's own
-- patients_exec_read policy shape, which already knew this). Policies below
-- are EXISTS-anchored through patient_external_keys, not a direct column
-- compare.
--
-- Role: labit_main_rw (created separately -- see db/RLS_HARDENING_PLAN.md
-- "Handoff" section; this migration does not create it, only policies +
-- grants against it. It must NOT have BYPASSRLS -- if it does, every policy
-- below is silently inert, exactly like postgres/service_role today).

BEGIN;

CREATE OR REPLACE FUNCTION public.lm_scope_mode() RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT current_setting('app.scope_mode', true)
$$;

CREATE OR REPLACE FUNCTION public.lm_scope_lab_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.lab_id', true), '')::uuid
$$;

-- patient_external_keys: the anchor table. lab_id is a direct column here.
ALTER TABLE public.patient_external_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_external_keys_scope ON public.patient_external_keys;
CREATE POLICY patient_external_keys_scope ON public.patient_external_keys
USING (
    public.lm_scope_mode() = 'all'
    OR (public.lm_scope_mode() = 'lab' AND lab_id = public.lm_scope_lab_id())
)
WITH CHECK (
    public.lm_scope_mode() = 'all'
    OR (public.lm_scope_mode() = 'lab' AND lab_id = public.lm_scope_lab_id())
);

-- patients: no lab_id of its own -- scoped via EXISTS on patient_external_keys.
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patients_scope ON public.patients;
CREATE POLICY patients_scope ON public.patients
USING (
    public.lm_scope_mode() = 'all'
    OR EXISTS (
        SELECT 1 FROM public.patient_external_keys pek
        WHERE pek.patient_id = patients.id
          AND public.lm_scope_mode() = 'lab'
          AND pek.lab_id = public.lm_scope_lab_id()
    )
)
WITH CHECK (
    public.lm_scope_mode() = 'all'
);
-- WITH CHECK on insert/update deliberately only allows 'all' for now --
-- patients has no lab_id to attach a new row's scope to, so a 'lab'-mode
-- write can't be validated here. Writes must go through a route that has
-- already confirmed the new patient has (or will immediately get) a
-- patient_external_keys row in that lab; do not widen this until that's
-- true, or a 'lab'-mode session could otherwise write an unscoped orphan.

-- patient_addresses: no lab_id either -- same EXISTS shape as patients.
ALTER TABLE public.patient_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_addresses_scope ON public.patient_addresses;
CREATE POLICY patient_addresses_scope ON public.patient_addresses
USING (
    public.lm_scope_mode() = 'all'
    OR EXISTS (
        SELECT 1 FROM public.patient_external_keys pek
        WHERE pek.patient_id = patient_addresses.patient_id
          AND public.lm_scope_mode() = 'lab'
          AND pek.lab_id = public.lm_scope_lab_id()
    )
)
WITH CHECK (
    public.lm_scope_mode() = 'all'
    OR EXISTS (
        SELECT 1 FROM public.patient_external_keys pek
        WHERE pek.patient_id = patient_addresses.patient_id
          AND public.lm_scope_mode() = 'lab'
          AND pek.lab_id = public.lm_scope_lab_id()
    )
);

-- Grants: labit_main_rw needs ordinary table privileges too -- RLS narrows
-- rows, it does not substitute for GRANT. Run once the role exists.
GRANT SELECT, INSERT, UPDATE ON public.patients TO labit_main_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_addresses TO labit_main_rw;
GRANT SELECT ON public.patient_external_keys TO labit_main_rw;

COMMIT;
