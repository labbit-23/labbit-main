# Labit RLS Rollout Plan

This is a staged plan to prepare Labit for Row Level Security without enabling it yet and breaking the current app.

## Current Reality

Labit is not yet in a state where Supabase RLS can safely become the primary access control for browser queries.

Why:

- App login uses `iron-session`, not Supabase Auth.
- Browser-side Supabase calls use the anon client from [lib/supabaseClient.js](/Users/pav/projects/Labbit/labbit-main/lib/supabaseClient.js).
- Many server routes use the Supabase service role from [lib/supabaseServer.js](/Users/pav/projects/Labbit/labbit-main/lib/supabaseServer.js), which bypasses RLS entirely.

So today:

- `session.user.labIds` exists in the app layer
- but Supabase policies cannot see Iron Session directly
- and direct browser `.from(...).select(...)` calls will not magically become lab-scoped just because `labIds` exist in session

## What RLS Should Eventually Protect

Priority tenant-scoped tables:

- `visits`
- `patients`
- `patient_addresses`
- `patient_external_keys`
- `quickbookings`
- `chat_sessions`
- `whatsapp_messages`
- `sample_pickups`
- `collection_centre`
- `labs_apis`
- `cto_service_logs`
- `cto_service_latest`

Reference/config tables that are usually broadly readable:

- `labs`
- `visit_statuses`
- `visit_time_slots`
- `lab_tests`
- `packages`
- `package_items`

## Safe Rollout Order

### Phase 0: No Behavior Change

Do now.

- Prepare policy SQL only.
- Inventory direct browser Supabase reads.
- Move tenant-sensitive reads behind server routes over time.

This phase is what this repo draft supports.

### Phase 1: Server-Enforced Lab Scoping

Before turning on RLS:

- Stop doing broad browser-side reads for tenant data.
- Prefer server APIs that:
  - read `session.user.labIds`
  - enforce `lab_id` filters in code
  - use service-role safely

This is the fastest path to multi-lab safety even before RLS is enabled.

High-priority candidates:

- admin visit loading
- patient/visit lookup flows
- dashboard metrics reads
- quickbookings and pickups reads

### Phase 2: Identity Bridge For Supabase RLS

Needed before browser-side RLS can work cleanly.

Options:

1. Move executives/patients onto Supabase Auth directly
2. Add a secure token-bridging flow so browser Supabase requests carry an authenticated user known to Postgres policies
3. Stop relying on browser-side direct Supabase reads for tenant-sensitive data

Given the current app, option 3 is the least disruptive short-term path.

## Recommended Policy Model

Use `executives_labs` as the main lab-authorization map for executive users.

Conceptually:

- Admin/manager/director/logistics/b2b/phlebo can access rows only for labs in `executives_labs`
- Patient users should access only:
  - their own patient row
  - their addresses
  - their visits
  - lab mappings related to them

## Current Gaps Before Enabling RLS

### 1. Direct frontend reads are too broad

Example:

- [app/admin/page.js](/Users/pav/projects/Labbit/labbit-main/app/admin/page.js)
  - reads `visits`, `labs`, `quickbookings`, `visit_statuses` directly

If RLS were enabled today, these queries would likely fail or return inconsistent data unless the browser session was also a valid Supabase auth identity.

### 2. Service-role server routes bypass RLS

That is fine, but those routes must be treated as the enforcement layer and must always apply `lab_id` filters in code.

### 3. Executive identity is not a Supabase Auth identity

Current login:

- [app/api/auth/user-login/route.js](/Users/pav/projects/Labbit/labbit-main/app/api/auth/user-login/route.js)
  - validates `executives.password_hash`
  - stores role and `labIds` in Iron Session

This is app-auth, not database-auth.

## Practical Recommendation

For the near term:

- treat server routes as the real security boundary
- gradually remove direct browser reads for tenant data
- then enable RLS table-by-table later

For the medium term:

- create a `Super Admin` console
- centralize lab provisioning
- centralize `labs_apis` management
- centralize executive-to-lab membership management

## Suggested First RLS Enablement Sequence Later

Once reads are routed safely and identity is ready:

1. `cto_service_logs`
2. `cto_service_latest`
3. `chat_sessions`
4. `whatsapp_messages`
5. `sample_pickups`
6. `collection_centre`
7. `visits`
8. `patient_addresses`
9. `patients`
10. `quickbookings`
11. `labs_apis`

## Files Added With This Plan

- [rls-draft.sql](/Users/pav/projects/Labbit/labbit-main/docs/rls-draft.sql)
- [rls-rollout-plan.md](/Users/pav/projects/Labbit/labbit-main/docs/rls-rollout-plan.md)

