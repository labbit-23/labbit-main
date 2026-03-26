create extension if not exists pgcrypto;

create table if not exists public.cto_events (
  id uuid primary key default gen_random_uuid(),
  lab_id text not null,
  source text not null,
  service_key text not null,
  event_type text not null,
  severity text not null check (severity in ('critical', 'high', 'medium', 'info')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  fingerprint text not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  acknowledged_at timestamptz,
  acknowledged_by text,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lab_id, fingerprint)
);

create index if not exists idx_cto_events_lab_status_last_seen
  on public.cto_events (lab_id, status, last_seen_at desc);

create index if not exists idx_cto_events_lab_severity_last_seen
  on public.cto_events (lab_id, severity, last_seen_at desc);

create index if not exists idx_cto_events_source_last_seen
  on public.cto_events (source, last_seen_at desc);

create index if not exists idx_cto_events_service_last_seen
  on public.cto_events (service_key, last_seen_at desc);

create index if not exists idx_cto_events_event_type_last_seen
  on public.cto_events (event_type, last_seen_at desc);

create or replace function public.touch_cto_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_cto_events_updated_at on public.cto_events;
create trigger trg_touch_cto_events_updated_at
before update on public.cto_events
for each row execute function public.touch_cto_events_updated_at();

-- Optional helper upsert pattern (used by API):
-- on conflict (lab_id, fingerprint) do update set
--   source = excluded.source,
--   service_key = excluded.service_key,
--   event_type = excluded.event_type,
--   severity = excluded.severity,
--   message = excluded.message,
--   payload = excluded.payload,
--   last_seen_at = greatest(public.cto_events.last_seen_at, excluded.last_seen_at),
--   first_seen_at = least(public.cto_events.first_seen_at, excluded.first_seen_at),
--   occurrence_count = public.cto_events.occurrence_count + 1,
--   status = case when public.cto_events.status = 'resolved' then 'open' else public.cto_events.status end;
