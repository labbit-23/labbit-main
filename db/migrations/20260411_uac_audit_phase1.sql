create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid null,
  actor_name text null,
  actor_role text null,
  action text not null,
  entity_type text not null,
  entity_id text null,
  lab_id uuid null,
  status text not null default 'success',
  before_json jsonb null,
  after_json jsonb null,
  metadata_json jsonb null,
  ip text null,
  user_agent text null
);

create index if not exists idx_audit_logs_created_at on public.audit_logs (created_at desc);
create index if not exists idx_audit_logs_actor_user_id on public.audit_logs (actor_user_id);
create index if not exists idx_audit_logs_actor_role on public.audit_logs (actor_role);
create index if not exists idx_audit_logs_entity on public.audit_logs (entity_type, entity_id);
create index if not exists idx_audit_logs_action on public.audit_logs (action);
create index if not exists idx_audit_logs_lab_id on public.audit_logs (lab_id);
