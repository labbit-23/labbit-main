# Labit Control Panel API (FastAPI, port 8100)

Contract: `../CONTRACT.md` (see "Deviations" below). Schema: `../db/001_labit_ops.sql`, role: `../db/002_labit_ops_role.sql`. Neither is applied by this code.

## Run
```
python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
cp .env.example .env   # export into pm2 env; the app reads os.environ
uvicorn app.main:app --host 127.0.0.1 --port 8100   # localhost ONLY, never 0.0.0.0
pytest -q
```
Single worker only: heartbeat rate limit is in-process memory.

## Auth
The panel lives inside labit-main (lab.sdrc.in/panel). A Next route handler verifies the iron-session cookie and lets only
executiveType `director` / `director_ceo` through, then calls this API on localhost. Here: every endpoint except `/health`
(and `/heartbeat`, own token auth, off by default) requires header `X-Panel-Key` == env `PANEL_INTERNAL_KEY`
(`hmac.compare_digest`; 401 if the env is unset or the header missing). `X-Panel-User` (executive id) is trusted, logging only.
One role: every authorised caller is `cto`. No Supabase Auth, no JWT, no user_roles. The service must bind 127.0.0.1 only.

## Data flow
- **Source of truth: `public.cto_service_latest`** (written by the existing CTO collector/ingest). `labit_ops.node_service_map` maps `service_key` (exact or prefix) -> panel node + service (`label`, `required`, `probe`). Worst status of matched rows wins.
- **Reachability**: a node is reachable if ANY fresh non-probe (collector) row exists, else if any fresh non-`down` probe row exists. Freshness = `updated_at` within the entry's `max_age_seconds` (null => `STALE_SECONDS`, default 180; seed: supabase_main 600, orthanc_main 300). Mapped keys that never emit therefore cannot make a node unreachable. `detail` explains why: `reason`, `cause` ('self'|'dependency'), `message` (e.g. 'Not monitored', 'Dependency db-vps is unreachable'). 
- **db-vps has no health source yet** (needs a VPS2 CTO collector, `CTO_NODE_SUFFIX=vps2`, unverified). `supabase_main__vps` probes the legacy *hosted* Supabase, so it is mapped `informational` (tile 'Hosted Supabase'): shown, but never a health signal. Until `*__vps2` rows are added db-vps is `not_monitored`.
- **`not_monitored`**: a node with no non-informational mapped entries (devserver, db-vps for now). Not unreachable; never cascades to dependents. A node whose mapped keys exist but are silent is still `unreachable`, and that does cascade.
- **Status vocabulary**, one function `state.cto_status_to_service_state`: healthy->up, degraded->degraded, down->down, unknown->degraded. Node state: required service down -> `service_down`; optional down or any degraded -> `degraded`; else `online`; not reachable -> `unreachable`.
- **Cascade** (unchanged): every node transitively depending (`depends_on`) on an unreachable node is `unreachable`, services too, never `service_down`.
- **Quiet nodes**: `/monitor/nodes` returns `quiet`, `expected_offline` (bool: quiet AND unreachable AND cause 'self', never because a dependency is down) and `expected_offline_note` (text). mirth-lab is `quiet` (powered off outside lab hours); the state stays `unreachable`, the UI should just not alert-style it. Its 24h `uptime_pct` ignores `unreachable` buckets (lab hours are unknown to the API, so a daytime outage is ignored too).
- **24h uptime** (`/monitor/nodes/{id}/uptime`): computed from `public.cto_service_logs` (5-min buckets, aggregated in SQL, cross-node cascade not applied; empty bucket = `unreachable`); falls back to the panel's own `status_history`. Slow probes are carried forward within `max_age_seconds` so they do not flap; `uptime_pct` is `null` when there are no known buckets, written every `POLL_INTERVAL` by the background cycle. Response has `source`.
- No unbounded selects: map-filtered queries with `LIMIT 20000`; direct SQL (no PostgREST 1000-row cap applies).
- `/menu` url: only http(s) is emitted; CHANGE-ME placeholders and other schemes come back `null` ('not configured'); `menu_systems.url` also has a CHECK constraint. DB access uses a small `psycopg_pool` and `/menu`+`/monitor` share a `SNAPSHOT_TTL` (5s) cached snapshot. `/menu` dot: up/degraded -> `up`, down -> `down`, unreachable/no linked service -> `unknown`. Every item has `pinned` and `admin_console` (single role, full menu). Pinned tile `radiology-dexa` is a **public Tailscale Funnel URL behind nginx basic auth**; the DEXA tile has the same URL. It is not linked to a service (no known `dexa` CTO key).

## DB access (H2)
No service-role key. The API connects with `PANEL_DB_DSN` as limited role `labit_ops_api` (SELECT on labit_ops config tables + `cto_service_latest`/`cto_service_logs`; INSERT on heartbeats; INSERT/UPDATE on node_status/status_history; no DELETE, nothing else). Heartbeats table is append-only (no DELETE granted); prune as DBA.

## Heartbeat fallback
`POST /heartbeat` returns 404 unless `HEARTBEAT_ENABLED=1`. Use only for nodes not covered by `cto_service_latest`: add map rows with `service_key='hb:<node_id>:<service>'`. Token = sha256 vs `nodes.token_hash`, constant-time, 6/min/node, 4KB.

## Reused from the CTO pipeline
`cto_service_latest` columns/status vocabulary, `STALE`-style freshness window (tightened from the dashboard's 10 min to 180 s), the collector key convention `<normalized_name>__<CTO_NODE_SUFFIX>` (`collector.py with_node_suffix`), `lab_id` filter (`PANEL_LAB_ID`), `cto_service_logs.checked_at` for history. The old disk/load thresholds were dropped: the collector's `vps_host__<suffix>` row already carries host mem/disk degradation.

## Verify against live keys at Phase C
Run `select service_key, status, updated_at from public.cto_service_latest order by 1;` and reconcile `node_service_map`.
- Probe keys are `<key>__vps` / `<key>__local` (monitoring_agent role suffix): seeded as labbit_health__vps, supabase_main__vps, mirth_dicom__local, mirth_lab__local, orthanc_main__local, funnel_mirth_public__local, funnel_mirth_health__ (prefix; also run on vps in the example ini). Verified against services.ini run_on and ecosystem.monitoring.config.cjs; confirm on live data.
- VPS2 collector suffix `vps2` and existence: ASSUMED.
- `vps_host__`, `docker_runtime__`, `report_sender__`, `report_enqueue_watch__`, `auto_dispatch_queue__`, `labit_core__` derive from collector.py; pm2 app names assumed. Memory notes suggest the real labit-core may run on VPS2: if `labit_core__vps1` is absent, app-vps goes service_down (it is required).
- Not mapped on purpose: dicom_worker, ecg_sender, machine_bridge, supabase_rest_probe (disabled), sophos_firewall__local, oracle_db__vps, tomcat_*, monitoring_agent, auto_send_reports. devserver has no keys (`not_monitored`).
- CLAUDE.md lists 100.65.63.54 as the Sophos Tailscale address, the IP given for devserver; confirm.
- mirth-lab lab-hours text is a placeholder. Set PANEL_LAB_ID to avoid cross-lab rows.
- Seed uses `on conflict do nothing`: fixing keys on an already-seeded DB needs UPDATEs.
- `heartbeats`/`status_history` are never pruned (no DELETE grant): DBA cron.

## Deviations
See `../CONTRACT.md` (rewritten to match this implementation).
