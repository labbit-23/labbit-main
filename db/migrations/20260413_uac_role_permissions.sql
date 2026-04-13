create table if not exists public.uac_role_permissions (
  lab_id uuid not null,
  role_key text not null,
  permission text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uac_role_permissions_pkey primary key (lab_id, role_key, permission),
  constraint uac_role_permissions_lab_id_fkey foreign key (lab_id) references public.labs(id) on delete cascade
);

create index if not exists idx_uac_role_permissions_lab_role on public.uac_role_permissions (lab_id, role_key);
create index if not exists idx_uac_role_permissions_lab_permission on public.uac_role_permissions (lab_id, permission);

create or replace function public.touch_uac_role_permissions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_uac_role_permissions_updated_at on public.uac_role_permissions;
create trigger trg_touch_uac_role_permissions_updated_at
before update on public.uac_role_permissions
for each row
execute function public.touch_uac_role_permissions_updated_at();

insert into public.uac_role_permissions (lab_id, role_key, permission, enabled)
select
  l.id as lab_id,
  v.role_key,
  v.permission,
  v.enabled
from public.labs l
cross join (
  values
    ('director', '*', true),
    ('admin', 'patients.create', true),
    ('admin', 'patients.update', true),
    ('admin', 'patients.update_identity', true),
    ('admin', 'visits.create', true),
    ('admin', 'visits.update', true),
    ('admin', 'quickbook.update', true),
    ('admin', 'executives.status.update', true),
    ('admin', 'whatsapp.reply', true),
    ('admin', 'reports.dispatch', true),
    ('manager', 'patients.create', true),
    ('manager', 'patients.update', true),
    ('manager', 'visits.create', true),
    ('manager', 'visits.update', true),
    ('manager', 'quickbook.update', true),
    ('manager', 'whatsapp.reply', true),
    ('manager', 'reports.dispatch', true),
    ('executive', 'whatsapp.reply', true),
    ('integration_tester', 'simulator.read', true),
    ('integration_tester', 'simulator.send', true),
    ('integration_tester', 'simulator.reset', true)
) as v(role_key, permission, enabled)
on conflict (lab_id, role_key, permission) do update
set enabled = excluded.enabled,
    updated_at = now();
