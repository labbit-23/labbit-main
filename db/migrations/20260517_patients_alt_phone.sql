alter table if exists public.patients
  add column if not exists alt_phone text;

create index if not exists idx_patients_alt_phone
  on public.patients (alt_phone);
