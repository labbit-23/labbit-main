insert into public.uac_role_permissions (lab_id, role_key, permission, enabled)
select
  l.id as lab_id,
  v.role_key,
  v.permission,
  v.enabled
from public.labs l
cross join (
  values
    ('director_ceo', 'management.metrics.view', true),
    ('director_ceo', 'reports.run.mis', true),
    ('director_ceo', 'reports.logs.view', true),
    ('director_ceo', 'reports.auto_dispatch.view', true)
) as v(role_key, permission, enabled)
on conflict (lab_id, role_key, permission) do update
set enabled = excluded.enabled,
    updated_at = now();
