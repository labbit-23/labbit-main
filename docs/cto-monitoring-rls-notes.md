# CTO Monitoring RLS Notes

These notes are for the first compliant version of the CTO monitoring tables when we expand to more labs.

## Recommended Model

Use two layers of protection:

1. Service-role writes only
2. RLS for user-facing reads

## Why

The Python collector should not talk to Supabase directly for normal operation.
Labbit ingest APIs should validate and write using the service role.

That means:

- Python collector authenticates only to Labbit
- Labbit writes monitoring rows with service-role permissions
- dashboard reads happen under user/session access rules

## Tables

Initial tables:

- `cto_service_logs`
- `cto_service_latest`

Future supporting tables:

- `cto_services`
- `cto_incidents`

## Required Ownership Columns

Every monitoring table should carry:

- `lab_id`
- `source`
- `service_key`

This is the minimum needed for multi-lab isolation.

## Read Access Policy Direction

Principle:

- Directors should only read rows for their own `lab_id` values
- Service-role can bypass RLS for ingest/write

Practical approach:

1. Store executive lab memberships in `executives_labs`
2. Put `labIds` into the session in Labbit
3. For direct Supabase reads later, attach the user identity and lab scope
4. Add RLS policies filtering monitoring tables by `lab_id`

## Example Policy Shape

This is conceptual and should be adapted to your final auth model:

```sql
create policy \"directors can read their lab monitoring latest\"
on public.cto_service_latest
for select
using (
  lab_id in (
    select el.lab_id
    from public.executives_labs el
    join public.executives e on e.id = el.executive_id
    where e.id = auth.uid()
  )
);
```

If you keep dashboard reads server-side through Labbit APIs, this can wait.

## Best Phase 1 Practice

For now:

- write using Labbit service-role only
- read through Labbit APIs only
- keep `lab_id` mandatory on every row

That gives you:

- no direct public table exposure
- easier rollout
- clean future migration to stricter RLS

## Phase 2 Direction

When multi-lab expansion starts:

- introduce a proper service registry table
- enforce RLS on dashboard-facing tables
- keep raw ingest restricted to server-side writes only
- separate lab-scoped dashboards from global CTO views
