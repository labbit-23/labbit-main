-- Run against the shared Supabase instance (labit-main) only.
-- Enables fast ilike search with leading wildcard on bmd_patients.

create extension if not exists pg_trgm;

create index if not exists bmd_patients_first_name_trgm_idx
  on bmd_patients using gin (first_name gin_trgm_ops);

create index if not exists bmd_patients_patient_id_trgm_idx
  on bmd_patients using gin (patient_id gin_trgm_ops);
