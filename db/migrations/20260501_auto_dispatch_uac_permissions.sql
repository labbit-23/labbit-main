insert into public.uac_role_permissions (lab_id, role_key, permission, enabled)
select l.id, v.role_key, v.permission, true
from public.labs l
cross join (
  values
    ('admin', 'reports.auto_dispatch.view'),
    ('admin', 'reports.auto_dispatch.push'),
    ('admin', 'reports.auto_dispatch.send_to'),
    ('admin', 'reports.auto_dispatch.pause'),
    ('admin', 'reports.auto_dispatch.pause_all'),
    ('manager', 'reports.auto_dispatch.view'),
    ('manager', 'reports.auto_dispatch.push'),
    ('manager', 'reports.auto_dispatch.send_to'),
    ('executive', 'reports.auto_dispatch.view'),
    ('b2b', 'reports.auto_dispatch.view'),
    ('logistics', 'reports.auto_dispatch.view')
) as v(role_key, permission)
on conflict (lab_id, role_key, permission) do update
set enabled = excluded.enabled,
    updated_at = now();
