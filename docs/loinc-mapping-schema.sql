-- LOINC mapping schema for SDRC tests/panels
-- Run in Supabase SQL editor.
-- Idempotent and safe to re-run.

create extension if not exists pgcrypto;

create table if not exists public.loinc_catalog (
  loinc_num text primary key,
  long_common_name text null,
  class text null,
  property text null,
  system text null,
  scale text null,
  method text null,
  status text null,
  updated_at timestamptz not null default now()
);

create table if not exists public.lab_test_loinc_map (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid null references public.labs(id) on delete cascade,
  entity_type text not null check (entity_type in ('test', 'panel')),
  category_name text null,
  department_name text null,
  source_code text not null,
  source_name text not null,
  loinc_num text not null references public.loinc_catalog(loinc_num),
  mapping_status text not null default 'mapped'
    check (mapping_status in ('mapped', 'candidate', 'review_needed', 'deprecated')),
  mapping_source text not null default 'manual_xls',
  notes text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lab_id, entity_type, source_code, loinc_num)
);

create index if not exists idx_lab_test_loinc_map_lab_entity_code
  on public.lab_test_loinc_map (lab_id, entity_type, source_code);

create index if not exists idx_lab_test_loinc_map_loinc
  on public.lab_test_loinc_map (loinc_num);

create index if not exists idx_lab_test_loinc_map_status
  on public.lab_test_loinc_map (mapping_status, active);

create or replace function public.touch_lab_test_loinc_map_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_lab_test_loinc_map_updated_at on public.lab_test_loinc_map;
create trigger trg_touch_lab_test_loinc_map_updated_at
before update on public.lab_test_loinc_map
for each row execute function public.touch_lab_test_loinc_map_updated_at();

create or replace function public.touch_loinc_catalog_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_loinc_catalog_updated_at on public.loinc_catalog;
create trigger trg_touch_loinc_catalog_updated_at
before update on public.loinc_catalog
for each row execute function public.touch_loinc_catalog_updated_at();

