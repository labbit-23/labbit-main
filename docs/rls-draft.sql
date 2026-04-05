-- Labit RLS draft
-- Do not run wholesale yet.
-- This file is a policy starter pack for staged rollout.

-- ============================================================
-- 0. Helper Functions
-- ============================================================

-- Assumes future database-authenticated users map to auth.uid().
-- This is a DRAFT shape only. Current app still uses iron-session,
-- so these helpers are not sufficient by themselves yet.

create or replace function public.is_exec_in_lab(target_lab_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.executives_labs el
    where el.executive_id = auth.uid()
      and el.lab_id = target_lab_id
  );
$$;

create or replace function public.is_admin_family()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.executives e
    where e.id = auth.uid()
      and lower(coalesce(e.type, '')) in ('admin', 'manager', 'director')
  );
$$;

create or replace function public.is_phlebo_user()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.executives e
    where e.id = auth.uid()
      and lower(coalesce(e.type, '')) = 'phlebo'
  );
$$;

-- ============================================================
-- 1. Monitoring Tables
-- ============================================================

alter table public.cto_service_logs enable row level security;
alter table public.cto_service_latest enable row level security;

create policy cto_logs_lab_read
on public.cto_service_logs
for select
using (
  public.is_exec_in_lab(lab_id::uuid)
);

create policy cto_latest_lab_read
on public.cto_service_latest
for select
using (
  public.is_exec_in_lab(lab_id::uuid)
);

-- Writes for monitoring should continue through service-role ingest routes.
-- Do not add browser insert/update policies here yet.

-- ============================================================
-- 2. Lab-Scoped Operational Tables
-- ============================================================

-- Visits
alter table public.visits enable row level security;

create policy visits_lab_read
on public.visits
for select
using (
  public.is_exec_in_lab(lab_id)
);

create policy visits_lab_write
on public.visits
for all
using (
  public.is_exec_in_lab(lab_id)
)
with check (
  public.is_exec_in_lab(lab_id)
);

-- Quickbookings
alter table public.quickbookings enable row level security;

-- NOTE:
-- quickbookings currently does not appear to have lab_id in the schema snippet.
-- This must be addressed before true multi-tenant RLS is possible.
-- Recommended fix: add quickbookings.lab_id uuid references labs(id).

-- Chat sessions
alter table public.chat_sessions enable row level security;

create policy chat_sessions_lab_read
on public.chat_sessions
for select
using (
  public.is_exec_in_lab(lab_id)
);

create policy chat_sessions_lab_write
on public.chat_sessions
for all
using (
  public.is_exec_in_lab(lab_id)
)
with check (
  public.is_exec_in_lab(lab_id)
);

-- WhatsApp messages
alter table public.whatsapp_messages enable row level security;

create policy whatsapp_messages_lab_read
on public.whatsapp_messages
for select
using (
  public.is_exec_in_lab(lab_id)
);

create policy whatsapp_messages_lab_write
on public.whatsapp_messages
for all
using (
  public.is_exec_in_lab(lab_id)
)
with check (
  public.is_exec_in_lab(lab_id)
);

-- Collection centres
alter table public.collection_centre enable row level security;

create policy collection_centre_lab_read
on public.collection_centre
for select
using (
  public.is_exec_in_lab(lab_id)
);

create policy collection_centre_lab_write
on public.collection_centre
for all
using (
  public.is_exec_in_lab(lab_id)
)
with check (
  public.is_exec_in_lab(lab_id)
);

-- Sample pickups
alter table public.sample_pickups enable row level security;

create policy sample_pickups_read
on public.sample_pickups
for select
using (
  exists (
    select 1
    from public.collection_centre cc
    where cc.id = sample_pickups.collection_centre_id
      and public.is_exec_in_lab(cc.lab_id)
  )
);

create policy sample_pickups_write
on public.sample_pickups
for all
using (
  exists (
    select 1
    from public.collection_centre cc
    where cc.id = sample_pickups.collection_centre_id
      and public.is_exec_in_lab(cc.lab_id)
  )
)
with check (
  exists (
    select 1
    from public.collection_centre cc
    where cc.id = sample_pickups.collection_centre_id
      and public.is_exec_in_lab(cc.lab_id)
  )
);

-- Labs APIs
alter table public.labs_apis enable row level security;

create policy labs_apis_lab_read
on public.labs_apis
for select
using (
  public.is_exec_in_lab(lab_id)
);

create policy labs_apis_admin_write
on public.labs_apis
for all
using (
  public.is_exec_in_lab(lab_id) and public.is_admin_family()
)
with check (
  public.is_exec_in_lab(lab_id) and public.is_admin_family()
);

-- ============================================================
-- 3. Patient/Address Layer
-- ============================================================

alter table public.patients enable row level security;
alter table public.patient_addresses enable row level security;
alter table public.patient_external_keys enable row level security;

-- Executive users can see patients tied to visits or external keys in their labs.
create policy patients_exec_read
on public.patients
for select
using (
  exists (
    select 1
    from public.visits v
    where v.patient_id = patients.id
      and public.is_exec_in_lab(v.lab_id)
  )
  or exists (
    select 1
    from public.patient_external_keys pek
    where pek.patient_id = patients.id
      and public.is_exec_in_lab(pek.lab_id)
  )
);

create policy patient_addresses_exec_read
on public.patient_addresses
for select
using (
  exists (
    select 1
    from public.visits v
    where v.patient_id = patient_addresses.patient_id
      and public.is_exec_in_lab(v.lab_id)
  )
  or exists (
    select 1
    from public.patient_external_keys pek
    where pek.patient_id = patient_addresses.patient_id
      and public.is_exec_in_lab(pek.lab_id)
  )
);

create policy patient_external_keys_exec_read
on public.patient_external_keys
for select
using (
  public.is_exec_in_lab(lab_id)
);

-- Writes should remain server-routed first.
-- Add write policies only after all patient flows move behind lab-scoped APIs.

-- ============================================================
-- 4. Reference Tables
-- ============================================================

alter table public.visit_statuses enable row level security;
alter table public.visit_time_slots enable row level security;
alter table public.labs enable row level security;

create policy visit_statuses_public_read
on public.visit_statuses
for select
using (true);

create policy visit_time_slots_public_read
on public.visit_time_slots
for select
using (true);

create policy labs_member_read
on public.labs
for select
using (
  public.is_exec_in_lab(id)
);

-- ============================================================
-- 5. TODO Before Real Enablement
-- ============================================================

-- 1. Replace broad browser-side reads with server routes.
-- 2. Add lab_id to quickbookings if multi-lab booking isolation is required.
-- 3. Decide patient-facing auth model for patient RLS.
-- 4. Decide whether executives will eventually authenticate as Supabase users.
-- 5. Dry-run policies in staging before enabling in production.

