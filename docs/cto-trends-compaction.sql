create table if not exists public.cto_service_daily_digest (
  day_date date not null,
  lab_id text not null,
  service_key text not null,
  category text,
  label text,
  source text,
  total_checks integer not null default 0,
  healthy_count integer not null default 0,
  degraded_count integer not null default 0,
  down_count integer not null default 0,
  unknown_count integer not null default 0,
  avg_latency_ms numeric(10,2),
  latency_sample_count integer not null default 0,
  p95_latency_ms integer,
  max_latency_ms integer,
  first_checked_at timestamptz,
  last_checked_at timestamptz,
  status_transitions integer not null default 0,
  host_metric_samples integer not null default 0,
  host_memory_avg_pct numeric(8,2),
  host_memory_max_pct numeric(8,2),
  host_disk_avg_pct numeric(8,2),
  host_disk_max_pct numeric(8,2),
  host_swap_avg_pct numeric(8,2),
  host_swap_max_pct numeric(8,2),
  host_load1_avg numeric(10,4),
  host_load1_max numeric(10,4),
  host_load_per_core_avg_pct numeric(8,2),
  host_load_per_core_max_pct numeric(8,2),
  last_status text not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (day_date, lab_id, service_key)
);

create index if not exists idx_cto_service_daily_digest_lab_day
  on public.cto_service_daily_digest (lab_id, day_date desc);

create index if not exists idx_cto_service_daily_digest_service_day
  on public.cto_service_daily_digest (service_key, day_date desc);

create or replace function public.touch_cto_service_daily_digest_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_cto_service_daily_digest_updated_at on public.cto_service_daily_digest;
create trigger trg_touch_cto_service_daily_digest_updated_at
before update on public.cto_service_daily_digest
for each row execute function public.touch_cto_service_daily_digest_updated_at();
