-- Add patient registration source tracking
alter table public.patients
add column if not exists registration_source text;

-- Backfill all existing patients as requested (Home Visit)
update public.patients
set registration_source = 'home_visit'
where coalesce(registration_source, '') = '';

-- Optional: default future inserts (can be changed later)
alter table public.patients
alter column registration_source set default 'home_visit';
