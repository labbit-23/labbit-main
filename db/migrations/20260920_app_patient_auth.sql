-- Labit App (marketplace client) patient identity + sessions.
--
-- Tenant-hub-owned identity (docs: labit-app/docs/MARKETPLACE_SCOPING.md
-- gap C): a patient signs up with a phone number and ZERO provider link;
-- links to provider cores (labit-core etc.) attach later via the provider
-- identity mapping. Deliberately separate from the legacy `patients`
-- table (per-lab, phone+lab keyed) and from labit-core's patient_session.
--
-- Auth shape mirrors labit-core's proven design (opaque random bearer
-- token, stored hashed, revocable, sliding expiry) so the Capacitor app
-- can send `Authorization: Bearer` instead of relying on cookies.
--
-- Service-role access only: RLS enabled with no policies, so anon/
-- authenticated PostgREST roles see nothing.

CREATE TABLE IF NOT EXISTS public.app_patient (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone       text NOT NULL UNIQUE,          -- normalized 10 digits
    name        text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_patient_otp (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone       text NOT NULL,
    otp_hash    text NOT NULL,
    attempts    integer NOT NULL DEFAULT 0,
    expires_at  timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_patient_otp_phone_created_idx
    ON public.app_patient_otp (phone, created_at DESC);

CREATE TABLE IF NOT EXISTS public.app_patient_session (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id    uuid NOT NULL REFERENCES public.app_patient(id) ON DELETE CASCADE,
    token_hash    text NOT NULL UNIQUE,
    login_method  text NOT NULL DEFAULT 'otp',
    device_label  text,
    expires_at    timestamptz NOT NULL,
    revoked_at    timestamptz,
    last_seen_at  timestamptz NOT NULL DEFAULT now(),
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_patient_session_patient_idx
    ON public.app_patient_session (patient_id);

ALTER TABLE public.app_patient ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_patient_otp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_patient_session ENABLE ROW LEVEL SECURITY;
