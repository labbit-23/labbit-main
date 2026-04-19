-- Add/backfill lab_id on core operational tables used by reporting and RLS.
-- Safe/idempotent: only applies changes when columns/constraints are missing.

-- ============================================================
-- quickbookings
-- ============================================================
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'quickbookings'
      and column_name = 'lab_id'
  ) then
    alter table public.quickbookings add column lab_id uuid null;
  end if;
end $$;

-- Backfill from linked visit first.
update public.quickbookings q
set lab_id = v.lab_id
from public.visits v
where q.lab_id is null
  and q.visit_id is not null
  and v.id = q.visit_id
  and v.lab_id is not null;

-- If there is exactly one lab in this deployment, use it as fallback.
with one_lab as (
  select id
  from public.labs
  order by id
  limit 1
)
update public.quickbookings q
set lab_id = (select id from one_lab)
where q.lab_id is null
  and (select count(*) from public.labs) = 1;

create index if not exists idx_quickbookings_lab_id_created_at
  on public.quickbookings (lab_id, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'quickbookings_lab_id_fkey'
  ) then
    alter table public.quickbookings
      add constraint quickbookings_lab_id_fkey
      foreign key (lab_id) references public.labs(id) on delete set null;
  end if;
end $$;

-- ============================================================
-- visit_activity_log
-- ============================================================
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'visit_activity_log'
      and column_name = 'lab_id'
  ) then
    alter table public.visit_activity_log add column lab_id uuid null;
  end if;
end $$;

-- Backfill from visits.
update public.visit_activity_log a
set lab_id = v.lab_id
from public.visits v
where a.lab_id is null
  and a.visit_id is not null
  and v.id = a.visit_id
  and v.lab_id is not null;

create index if not exists idx_visit_activity_log_lab_id_created_at
  on public.visit_activity_log (lab_id, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'visit_activity_log_lab_id_fkey'
  ) then
    alter table public.visit_activity_log
      add constraint visit_activity_log_lab_id_fkey
      foreign key (lab_id) references public.labs(id) on delete set null;
  end if;
end $$;

-- ============================================================
-- report_dispatch_logs
-- ============================================================
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'report_dispatch_logs'
      and column_name = 'lab_id'
  ) then
    alter table public.report_dispatch_logs add column lab_id uuid null;
  end if;
end $$;

-- Best-effort fallback: if single-lab deployment, assign that lab.
with one_lab as (
  select id
  from public.labs
  order by id
  limit 1
)
update public.report_dispatch_logs d
set lab_id = (select id from one_lab)
where d.lab_id is null
  and (select count(*) from public.labs) = 1;

create index if not exists idx_report_dispatch_logs_lab_id_created_at
  on public.report_dispatch_logs (lab_id, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'report_dispatch_logs_lab_id_fkey'
  ) then
    alter table public.report_dispatch_logs
      add constraint report_dispatch_logs_lab_id_fkey
      foreign key (lab_id) references public.labs(id) on delete set null;
  end if;
end $$;

-- ============================================================
-- Discovery: show other public tables still missing lab_id
-- (run manually after migration to plan next wave)
-- ============================================================
-- select t.table_name
-- from information_schema.tables t
-- where t.table_schema = 'public'
--   and t.table_type = 'BASE TABLE'
--   and t.table_name not in ('schema_migrations')
--   and not exists (
--     select 1
--     from information_schema.columns c
--     where c.table_schema = 'public'
--       and c.table_name = t.table_name
--       and c.column_name = 'lab_id'
--   )
-- order by t.table_name;
