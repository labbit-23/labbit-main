alter table public.cto_service_daily_digest
  add column if not exists host_metric_samples integer not null default 0,
  add column if not exists host_memory_avg_pct numeric(8,2),
  add column if not exists host_memory_max_pct numeric(8,2),
  add column if not exists host_disk_avg_pct numeric(8,2),
  add column if not exists host_disk_max_pct numeric(8,2),
  add column if not exists host_swap_avg_pct numeric(8,2),
  add column if not exists host_swap_max_pct numeric(8,2),
  add column if not exists host_load1_avg numeric(10,4),
  add column if not exists host_load1_max numeric(10,4),
  add column if not exists host_load_per_core_avg_pct numeric(8,2),
  add column if not exists host_load_per_core_max_pct numeric(8,2);

