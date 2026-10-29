# Labit Control Panel - contract (matches implementation, Phase A: local files only)

Host: lab.sdrc.in/panel, inside labit-main (reuses its login). UI + route handlers live in labit-main; panel/api is a FastAPI on 127.0.0.1:8100 (PM2 `panel-api`),
panel/db (`001_labit_ops.sql`, `002_labit_ops_role.sql`; NOT applied anywhere). Legacy panel/web and panel/deploy (standalone host) are superseded. No admin console is ever proxied.

## Auth (single role)
Hosting changed: the panel lives INSIDE labit-main (lab.sdrc.in/panel) and reuses its login (iron-session cookie, `executives`
table, `executiveType`). A Next route handler verifies the session, lets only `director` / `director_ceo` through, then calls
this FastAPI over localhost. No Supabase Auth, no JWT, no `user_roles`; a single role: every authorised caller is `cto`.
Every route except GET /health (and POST /heartbeat, own token auth, disabled by default) requires header
`X-Panel-Key` == env `PANEL_INTERNAL_KEY` (constant-time compare; 401 if env unset or header missing/wrong; fail closed).
`X-Panel-User` = executive id, trusted, logging only. The API binds 127.0.0.1:8100 only and is never proxied publicly.
DB access: limited Postgres role `labit_ops_api` (PANEL_DB_DSN, direct SQL). No service-role key anywhere.

## Schema labit_ops
- nodes(id pk, label, kind 'local'|'cloud', host, depends_on text[], token_hash null (optional heartbeat), quiet bool, expected_offline text, sort)
- node_service_map(id pk, node_id fk, service_key, is_prefix bool, label, required bool, probe bool, informational bool, max_age_seconds int null, sort)
  Maps `public.cto_service_latest.service_key` (exact or prefix) to a panel service. `probe=true` marks an external probe OF the node
  (labit-py monitoring_agent keys, suffixed `__vps`/`__local`); collector keys are `<pm2 name>__<CTO_NODE_SUFFIX>` (vps1 = VPS1; vps2 for VPS2 is UNVERIFIED).
  `informational=true`: listed as a service but never a health signal (cannot prove reachability, never required). `max_age_seconds` null => STALE_SECONDS.
- heartbeats(id, node_id, received_at, payload) - optional fallback only
- node_status(node_id pk, state, last_seen, detail, updated_at); status_history(node_id, bucket, state) 5-min buckets
- menu_systems(id pk, label, group_name, url CHECK http(s), admin_console, service_id -> node_service_map.id, sort, pinned bool, pin_sort int)
RLS ON everywhere. anon/authenticated have no grants. `labit_ops_api` has SELECT on config tables and public.cto_service_latest/cto_service_logs,
INSERT on heartbeats, INSERT/UPDATE on node_status/status_history, no DELETE, nothing else (002 also adds read-only RLS policies on the two
existing public.cto_* tables, scoped to that role, only if RLS is enabled there).

Nodes (seed): app-vps (VPS1), db-vps (VPS2 self-hosted Supabase; NO health source yet => `not_monitored`; `supabase_main__vps` probes the legacy hosted Supabase so it is informational, tile 'Hosted Supabase'), mirth-dicom (sdrc-integrations), mirth-lab (lab-mirth, `quiet`: powered off outside lab hours), devserver (no known keys => `not_monitored`).
Dependencies are data: app-vps -> db-vps; mirth-dicom, mirth-lab -> app-vps.
Menu tiles (seed): Radiology (DEXA reports) [pinned, public Tailscale Funnel URL behind nginx basic auth], Labit One ops, FastAPI, report dispatch kiosk,
DEXA app, SDRC website, Bonvoice IVR; admin consoles (`admin_console:true`, Tailscale-only link-outs, never proxied): Supabase studio, Mirth lab, Mirth DICOM, ERPNext, Orthanc.
Placeholder (`CHANGE-ME`) URLs are returned as `url: null` = "not configured".

## States
node: online | degraded | unreachable | service_down | **not_monitored**. service: up | degraded | down | unreachable.
- CTO status -> service state (one function `state.cto_status_to_service_state`): healthy->up, degraded->degraded, down->down, unknown->degraded.
- Freshness: a row is fresh if `updated_at` is within its entry's max_age_seconds (default STALE_SECONDS=180).
- `not_monitored`: node with NO non-informational mapped signal sources (devserver; db-vps until a VPS2 collector exists). Not unreachable, detail {reason:'unmapped',cause:'self',message}, MUST NOT cascade to dependents; its dependents are judged on their own signals. Mapped-but-silent keys still make a node `unreachable` (and that cascades).
- Reachable = any fresh non-probe row, else any fresh non-`down` probe row. Never-emitting mapped keys cannot make a node unreachable. Otherwise `unreachable`.
- Reachable node: required service down -> service_down; optional service down or any degraded -> degraded; else online. A service with no fresh row is `down`.
- Cascade: every node transitively depending (depends_on) on an unreachable node is `unreachable` with all its services `unreachable`, never `service_down`.
- `detail` on unreachable nodes: {reason: unmapped|never_seen|stale|probe_down|dependency_unreachable, cause: 'self'|'dependency', via?, message}.
- Pure function: `compute_states(nodes, svc_map, rows, now, stale_seconds=None)`, rows = [{service_key,status,updated_at}].

## API (JSON; base /panel-api in prod, / locally)
- POST /heartbeat - OPTIONAL fallback, returns 404 unless HEARTBEAT_ENABLED=1. Bearer node token vs sha256 `token_hash`, constant time, 6/min/node, body <= 4KB, 204. Services appear as map keys `hb:<node_id>:<service>`.
- GET /health - {"ok":true}.
- GET /me - {role:'cto'}.
- GET /menu - all tiles (no staff variant). Item {id,label,group,url|null,dot:'up'|'down'|'unknown',pinned,admin_console}. url is http(s) only.
- GET /monitor/nodes - [{id,label,state,last_seen,detail,quiet,expected_offline,expected_offline_note,services:[{id,label,state}]}].
  `expected_offline` is true only when the node is quiet AND unreachable AND detail.cause=='self'. Never true for `not_monitored`.
- GET /monitor/nodes/{id}/uptime - {buckets:[{t,state}] x288 (24h, 'unknown' when no data; state may be 'not_monitored'), uptime_pct: number|**null**, source:'cto_service_logs'|'status_history'}. `uptime_pct` is null when no bucket has data; clients must handle null. `not_monitored` buckets are ignored; for `quiet` nodes `unreachable` buckets are ignored too (off-hours do not lower the percent).
Env: PANEL_DB_DSN, PANEL_INTERNAL_KEY, PANEL_LAB_ID (optional), STALE_SECONDS, POLL_INTERVAL, SNAPSHOT_TTL, HEARTBEAT_ENABLED, ENABLE_BACKGROUND.
No patient tables are touched.

## Frontend
Lives in labit-main under /panel (director / director_ceo only, enforced in the Next route handler). Palette/states: up #22c55e, degraded #f59e0b, unreachable #94a3b8, down #ef4444, not_monitored: neutral grey, label "Not monitored" (not an alert).
Quiet nodes: show calm "off-hours" styling only when `expected_offline` is true; show `detail.message` for any unreachable or not_monitored node; tiles with `url: null` render "not configured". Uptime null renders "n/a".
