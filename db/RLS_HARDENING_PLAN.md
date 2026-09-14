# RLS Hardening Plan

Started 2026-09-14, director: "start hardening RLS in this labit main repo
this time knowing well soon there will be a new tenant here" +
"no change in UI or UX (no one notices) is a good result" for the short-term
deliverable.

## Status

**Phase 1 — done, verified live.** `db/migrations/
20260914_rls_phase1_deny_by_default.sql`. Enabled RLS + zero policies on 30
`public` schema tables with zero anon-key consumers anywhere in `labit-main`
or any sibling repo (`labit-ui`, `labit-patient`, `labit-website`,
`labit-one`, `sdrc-website` — checked). Includes `otp_codes` and `users`,
which were fully anon-readable in production before this. `service_role`
(`BYPASSRLS`, confirmed via `pg_roles`) is what every real backend path
uses, so this is zero-behavior-change by construction. Verified via curl
with the real anon key: `otp_codes`/`labs_apis` now return `[]` instead of
real rows.

**Phase 2a — done, verified live.** `db/migrations/
20260914_rls_phase2_labs_apis.sql`. `labs_apis.auth_details` holds a live
WhatsApp API key in plaintext. Its only anon-key consumer anywhere in the
repo was `app/api/whatsapp/send/route.js` — a dead route, zero callers,
**not** the bot/report-sender's real send path (that's `lib/whatsapp/
sender.js`, already on the service-role client; py_utils' `report_sender`
worker connects with its own `service_role_key` too — confirmed neither is
affected). Repointed that dead route to the service-role client, then
enabled RLS on the table.

**Phase 2b — in progress.** Director, 2026-09-14: "moving towards Supabase
independence is a better path for this" — adopted as the direction, not
just a defense-in-depth bolt-on. Built so far (not yet live — blocked on one
handoff step, see below):

- `lib/pgScoped.js` — direct-Postgres connection module (the `pg` npm
  package, added as a dependency), the Node equivalent of `labit-core/app/
  db.py`. Exports `scoped({mode, labId}, fn)` and `query()`/`queryOne()`;
  every `query()` opens its own transaction, applies the current scope as
  `set_config('app.scope_mode', ..., true)` / `set_config('app.lab_id',
  ..., true)` (transaction-local, fail-closed if scope was never set — same
  mechanism as core, see the file's own header comment).
- `db/migrations/20260914_rls_phase2b_patients_guc.sql` — GUC-keyed RLS
  policies for `patients`, `patient_addresses`, `patient_external_keys`
  (tranche 1, see "Sequencing" below). **Not yet applied** — it grants to a
  role, `labit_main_rw`, that doesn't exist yet.

**Handoff — one step only I can't do myself:** creating `labit_main_rw` is
a new-credential action, blocked by auto-mode the same way the earlier
`supabase_admin` grant was. Run this once, from a `psql` session on
`supabase.sdrc.in` (`docker exec -i supabase-db psql -U postgres -d
postgres`), generating your own password rather than reusing any shown
earlier in this session:

```sql
-- generate a password first, e.g.: openssl rand -base64 24 | tr -d '=+/' | cut -c1-32
CREATE ROLE labit_main_rw LOGIN PASSWORD '<paste generated password>';
```

Do **not** grant it `BYPASSRLS` or superuser — that's the one property that
must differ from `postgres`/`service_role`, or every policy in this phase
is silently inert (same failure mode phase 1 exists to close).

Then add to labit-main's env (`.env.local` locally, and VPS1's production
env) — direct connection confirmed reachable from VPS1 already, no firewall
change needed (`10.0.0.2:5432`, private network, confirmed via `nc` from
VPS1; port 6543 is the pooler, session-mode behavior not yet verified for
this GUC pattern — start on 5432):

```
LABIT_MAIN_PG_DSN=postgresql://labit_main_rw:<password>@10.0.0.2:5432/postgres
```

Once both exist, tell me and I'll run the migration and wire up the first
route.

**Incident, same night:** enabling RLS on `patients`/`patient_addresses`
(above) broke every *nested* PostgREST embed of them through `visits` via
the anon key — `visits?select=id,patient:patient_id(name,phone)` started
returning `patient: null` for every row, confirmed live via curl. This hits
`YourDayView.js`, `ActiveVisitsTab.js` (also embeds `addresses:
patient_addresses`), `PatientLookupTab.js`'s `createVisit`, and `app/admin/
page.js` — not just the search box being migrated. Caught and fixed same
night, before it reached tomorrow's shift: `db/migrations/
20260914_rls_phase2b_temp_read_restore.sql` adds `FOR SELECT ... TO anon,
authenticated USING (true)` on both tables — identical to their actual
pre-migration behavior (RLS was off entirely, so anon could always read
everything; this only restores the read path, not the write path). Writes
stay closed and verified blocked (tested against real row ids with
`Prefer: return=representation`, not just a nonexistent-id 204 which can't
distinguish "blocked" from "matched nothing"). **This SELECT-open policy is
temporary** — remove it once every nested-embed call site above is migrated
to a server route the same way `patients/search` and `patient-addresses/
[id]` were tonight. Swept the rest of the anon-client surface for the same
risk (any other embedded table from tonight's phase-1/phase-2a list) —
clean, nothing else affected; the only other embedded tables
(`executives`, `labs`, `visit_time_slots`) were never touched tonight.

**Corrected tranche-1 file list** (re-verified 2026-09-14 — the original
sweep over-counted one dead file): `app/archive/patient/PatientLookup.js`
has zero importers anywhere in the repo, confirmed via grep — not live,
dropped from scope. The real, live `patients`/`patient_addresses` call
sites are just `app/phlebo/PatientLookupTab.js` and `app/phlebo/
YourDayView.js`.

## Phase 2b — the 14 remaining tables

`executives, patients, patient_addresses, labs, lab_tests, packages,
quickbookings, sample_pickups, visit_activity_log, visit_details,
visit_statuses, visit_time_slots, visits, whatsapp_messages`

All reached today via the browser importing `lib/supabaseClient.js` (the
anon key) directly from client components — confirmed the full call-site
list by grepping every file that imports it:

| File | Tables |
|---|---|
| `app/archive/patient/PatientLookup.js` | `patients`, `patient_addresses` |
| `app/phlebo/PatientLookupTab.js` | `visit_time_slots`, `patients`, `visits` |
| `app/phlebo/YourDayView.js` | `visits`, `patient_addresses`, `visit_details`, `visit_activity_log` |
| `app/phlebo/VisitDetailTab.js` | `visit_details`, `lab_tests` |
| `app/phlebo/ActiveVisitsTab.js` | `visits` |
| `app/phlebo/page.js`, `app/phlebo/yourdayview/page.js` | `executives` |
| `app/patient/VisitScheduler.js` | `visit_time_slots` |
| `app/admin/page.js` | `visits`, `quickbookings`, `labs`, `visit_time_slots`, `visit_statuses` |
| `components/DashboardMetrics.js` | `sample_pickups`, `visits` |
| `components/TestPackageSelector.js` | `lab_tests`, `packages` |
| `components/VisitBillingPanel.js` | `lab_tests`, `packages`, `visit_details` |
| `lib/sendWhatsAppMessage.js`, `lib/processBookingMessage.js`, `app/api/whatsapp/book_visit/route.js` | `whatsapp_messages` (insert only) |

(`app/admin/page.backup.js`/`page.old.js` also reference several of these
but are dead code — not a real route in Next's app router, nothing imports
them. Not part of the live surface; can be deleted separately, out of scope
here.)

## Why this needs two changes together, not one

1. **Move the query server-side.** The browser calls a `/api/...` route
   instead of Supabase directly; the route checks the iron-session cookie
   (`lib/session.js` — `session.user` already carries executive identity)
   the same way every other authenticated route in this repo already does.
   This alone stops the anon key from being a viable path to these tables at
   all — the browser never touches Postgres, only the app's own API surface.
2. **Enforce the scope in Postgres too, not only in the route's own `WHERE`
   clause** — the `labit-core` pattern (`app/db.py` + `schema/021_rls.sql`):
   a trusted server sets session GUCs (`set_config('app.lab_id', ..., true)`,
   transaction-scoped) as the first statement of a transaction, and RLS
   policies key off those GUCs via `current_setting(name, true)`, which
   returns NULL — and NULL denies — when nothing set it. Fail-closed: a
   route that forgets to set scope gets zero rows, not all rows.
   Step 1 alone (server route + service-role client, relying only on the
   route's own filter) is what the rest of this codebase already does
   everywhere, and it's a legitimate, lower-effort stopping point. Step 2 is
   the defense-in-depth core already validated in production — worth doing
   here specifically *because* a second tenant is coming: a filter bug in
   one route becomes a cross-tenant data leak with only step 1, and a
   same-request no-op (zero rows, loud in dev) with both.

## What step 2 requires that labit-main doesn't have yet

- A direct Postgres connection from Node — add `pg` (node-postgres) as a
  dependency; labit-main currently only holds `@supabase/supabase-js`
  (PostgREST-over-HTTP), which has no way for an anonymous or even a
  service-role HTTP client to run `set_config` as part of the same
  transaction as the query. This is the one genuinely new piece — small
  (one package, one pooled-connection helper module, e.g. `lib/pgScoped.js`
  mirroring `labit-core/app/db.py`'s `scoped()`/`q()` shape), not a new
  service or repo.
- A GUC vocabulary for labit-main's own scoping axis. Core's is branch/
  referrer because that's its domain (staff vs. b2b partner). labit-main's
  is tenant/lab plus phlebo-vs-admin, so the equivalent shape is closer to:
  `app.lab_id` (every one of these 14 tables already has or can derive
  `lab_id`), `app.executive_id`, `app.scope_mode` ('all' for
  admin/director, 'own' for a phlebo seeing only their assigned visits).
  Needs its own short design pass per table (which mode each table needs)
  before writing policies — don't copy core's policies verbatim, the
  domain is different.

## Sequencing (by risk, not by file count)

1. `patients`, `patient_addresses` — real PII, highest priority.
2. `visits`, `visit_details`, `visit_activity_log` — operational core, same
   effort either way since they share call sites with #1 (`YourDayView.js`,
   `PatientLookupTab.js`).
3. `executives`, `quickbookings`, `sample_pickups`, `whatsapp_messages`,
   `labs` — lower sensitivity, smaller blast radius per row.
4. `visit_statuses`, `visit_time_slots`, `lab_tests`, `packages` — closer to
   reference/catalog data than tenant-private data; may only need the
   step-1 server-route move (with an explicit public-read RLS policy, not
   deny-by-default) rather than full GUC scoping — confirm per-table before
   assuming they need the same treatment as #1–3.

Each tranche: touch the frontend call site(s), add/extend the server route,
add the GUC-keyed policy, migrate, verify with the same curl-with-anon-key
check used in phases 1–2, then move to the next tranche. No UI/UX change at
any step — the frontend components keep calling what looks like the same
data shape, just through `/api/...` instead of Supabase directly.
