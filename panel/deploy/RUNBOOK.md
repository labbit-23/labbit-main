# Control Panel go-live runbook (embedded in labit-main)

**STATUS: NOT STARTED. Every step below needs an explicit user go. Nothing here has been run.**
All times are IST.

## Design
The panel lives inside labit-main: pages `app/panel/*`, route handlers `app/api/panel/*`, served at `lab.sdrc.in/panel` by
labit-main's existing deployment on VPS1 (existing nginx, existing PM2 app). Auth is labit-main's iron-session; only
`director` / `director_ceo` pass. The route handlers call the FastAPI `panel-api` on `127.0.0.1:8100` with header
`X-Panel-Key = PANEL_INTERNAL_KEY`. `panel-api` reads `public.cto_service_latest` and the `labit_ops` schema through the limited
Postgres role `labit_ops_api`. Not used: Supabase Auth, panel.labit.online, new DNS, certbot, a new nginx server block, panel-web.
Retired: `deploy/nginx/panel.labit.online*.conf` (removed, they were untracked; see `nginx/NOT_USED.md`), `panel-web` in pm2.

Paths (CHECK-ME, see unknowns): labit-main on VPS1 is assumed at `/opt/labbit-frontend` (default `APP_DIR` of
`scripts/deploy-vps-frontend.sh`, PM2 app `labbit-frontend`, health `http://127.0.0.1:3000/api/health`). Panel root = `<that>/panel`.
API env file: `<panel root>/api/.env` (chmod 600, untracked). Logs: `/var/log/labit-panel`.

Rules for this runbook: never run `pm2 save`, never restart or stop any app other than `panel-api` (and `labbit-frontend` only via its own
deploy script, with the user's go), no passwords in argv or shell history.

## Step 0. Read-only checks on VPS1 (changes nothing)
```
ls -d /opt/labbit-frontend /opt/labit/labit-main 2>&1     # which checkout is labit-main? set PANEL_ROOT accordingly
cd <repo>; git status --short | head; git log -1 --format='%h %ci'
python3 --version; python3 -m venv --help >/dev/null && echo venv-ok   # python3-venv present? (apt package python3-venv if not)
ss -lntH | awk '{print $4}' | grep -E ':8100$' || echo "8100 free"
pm2 list                                                   # no existing panel-api; note the exact labit-main app name
grep -c '^SECRET_COOKIE_PASSWORD=' <repo>/.env* 2>/dev/null; pm2 env <labit-main pm2 id> | grep -c SECRET_COOKIE_PASSWORD   # counts only, never print the value
```
Which DB holds `public.cto_service_latest`: labit-main's `/api/cto/ingest` writes to the Supabase its server env points at. Confirm WITHOUT
printing keys: `grep -o '^[A-Z_]*SUPABASE[A-Z_]*=' <labit-main env file>` (names only) and the host part of the URL only
(`grep '^NEXT_PUBLIC_SUPABASE_URL=' ... | sed 's#//[^/]*@##'`). Then decide: the self-hosted Supabase on VPS2 (reachable from VPS1 as `10.0.0.2:5433`)
or hosted Supabase. `labit_ops_api`'s DSN must point to the one that actually holds the live table. STOP and ask the user if it is hosted Supabase
(then 001/002 and the DSN differ). Connectivity (TCP only): `nc -zv 10.0.0.2 5433` from VPS1 (VPS1 is not on the tailnet; 5432 is the supavisor
pooler and needs tenant-qualified usernames, avoid it).
Live keys (read-only, via psql prompt as an admin/read user): `select distinct service_key,status,updated_at from public.cto_service_latest order by 1;`
Reconcile against `node_service_map.service_key` in `db/001_labit_ops.sql` (see "Known unknowns"). The seed uses `ON CONFLICT DO NOTHING`:
after 001 is applied, seed fixes need explicit `UPDATE`s, so reconcile BEFORE step 2.
Rollback: n/a (read-only).

## Step 1. Code on VPS1
User go first. Get the panel code (branch containing `panel/` and the labit-main pages) onto the checkout with a clean tree. The labit-main deploy
(step 7) pulls it anyway; for step 4 and 5 only `panel/api`, `panel/db`, `panel/deploy` are needed, which a plain `git pull --ff-only` provides.
`mkdir -p /var/log/labit-panel`.
Rollback: `git reset --hard <previous sha>` on the checkout (noted in step 0).

## Step 2. Database (VPS2 admin; user go)
Order: `001_labit_ops.sql` then `002_labit_ops_role.sql`. Admin password from a file or the psql prompt, never argv:
```
set +o history; umask 077
export PGPASSFILE=/root/.pgpass_admin_panel     # 0600 file you create by hand; or omit and answer the psql prompt
openssl rand -hex 24 > /root/.panel_api_pw      # new role password, 0600, deleted in step 3
psql "host=<db host> port=5433 dbname=postgres user=<admin>" -v ON_ERROR_STOP=1 -f panel/db/001_labit_ops.sql
printf '\\set api_password `cat /root/.panel_api_pw`\n\\i panel/db/002_labit_ops_role.sql\n' | psql "host=<db host> port=5433 dbname=postgres user=<admin>" -v ON_ERROR_STOP=1
set -o history
```
(Password reaches psql via file and stdin only. 002 quits if the variable is missing.) Then run the commented "post-apply verification" block at the bottom
of 002 (expected: no USAGE on `labit_core` or other schemas; SELECT only on the two `public.cto_*` tables; no DELETE anywhere).
After 001: fill the placeholders by UPDATE (see unknowns), plus any key corrections from step 0.
Rollback (only on explicit user decision): `drop role labit_ops_api` (after revoking/dropping its policies) and `drop schema labit_ops cascade`.

## Step 3. Secrets: PANEL_INTERNAL_KEY and API env
```
set +o history; umask 077
KEY="$(openssl rand -hex 32)"
PW="$(cat /root/.panel_api_pw)"
printf 'PANEL_DB_DSN=postgresql://labit_ops_api:%s@10.0.0.2:5433/postgres?sslmode=prefer\nPANEL_INTERNAL_KEY=%s\nHEARTBEAT_ENABLED=0\nENABLE_BACKGROUND=1\nSTALE_SECONDS=180\nPOLL_INTERVAL=60\nSNAPSHOT_TTL=5\n' "$PW" "$KEY" > <panel root>/api/.env
chmod 600 <panel root>/api/.env
# add PANEL_LAB_ID=<lab id> if cto_service_latest is multi-lab
```
The same `$KEY` goes into labit-main's server env (never `NEXT_PUBLIC_*`), together with `PANEL_API_URL=http://127.0.0.1:8100`, by editing labit-main's
env file/PM2 env by hand (method depends on step 0 findings; do not echo the value). Then `shred -u /root/.panel_api_pw; unset KEY PW; set -o history`.
Use `sslmode=require` if the server reports `show ssl;` = on; confirm database name `postgres`.
Rollback: delete `api/.env`; remove the two labit-main env lines; labit-main fails closed (HTTP 500 on `/api/panel/*`) when `PANEL_INTERNAL_KEY` is unset.

## Step 4. Start panel-api (user go)
`PANEL_DEPLOY_GO=yes bash panel/deploy/scripts/deploy-panel.sh` (checks the env file, venv + deps, `pm2 start|reload --only panel-api`, health check;
no `pm2 save`, nothing else restarted). Verify: `curl -s http://127.0.0.1:8100/health` -> `{"ok":true}`;
`curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8100/menu` -> **401** (no key); with the key (read it into a variable, do not echo):
`curl -s -H "X-Panel-Key: $KEY" http://127.0.0.1:8100/monitor/nodes | head -c 600` -> node list. Check `pm2 logs panel-api --lines 50` for DB errors.
Persisting across reboot: `pm2 save` is NOT run by the script; the user decides, after reviewing `pm2 list`, whether to run it.
Rollback: `pm2 stop panel-api` (then `pm2 delete panel-api` if removing), only on the user's go. Nothing else is affected.

## Step 5. Deploy order
1. panel-api (step 4) first, so the pages never call a missing backend.
2. labit-main: its own existing `scripts/deploy-vps-frontend.sh` (user go; it restarts `labbit-frontend` and runs its own `pm2 save`, which is its
   existing behaviour, not part of this panel work). That is what ships `app/panel` and `app/api/panel`. This runbook does not edit that script.
Rollback: revert labit-main to the previous release (`git reset --hard <prev sha>`, `npm ci`, `npm run build`, `pm2 restart labbit-frontend --update-env`, user go);
the panel pages vanish, nothing else changes. panel-api can stay running (localhost only, key-protected) or be stopped as in step 4.

## Step 6. Post-deploy verification
- Unsigned: `curl -sI https://lab.sdrc.in/panel` -> redirect to the login page.
- Non-director (e.g. a staff executive session): `/api/panel/*` -> 403; `/panel` not usable.
- Director / director_ceo: `/panel` shows the menu and the monitor with the 5 nodes.
- `curl 127.0.0.1:8100/menu` without key -> 401 (step 4).
- Other apps unaffected: `pm2 list`, spot-check lab.sdrc.in as usual.
- mirth-lab shows unreachable outside lab hours: expected (machine off), not an incident.

## Step 7. Rollback summary
Panel only: `pm2 stop panel-api` (user go). Release: revert labit-main as in step 5. Secrets: remove the env lines. DB (explicit user decision only): drop role / schema.
No nginx, DNS or certificate changes exist to undo.

## Known unknowns (none block review)
- **labit-main checkout path on VPS1**: `/opt/labbit-frontend` assumed from the deploy script; `/opt/labit/labit-main` was the previous guess. Marked CHECK-ME in
  `pm2/ecosystem.config.js` and `scripts/deploy-panel.sh` (override with `PANEL_ROOT`). Also: pm2 user for `/var/log/labit-panel`, and whether `python3-venv` is installed.
- **Which DB holds `public.cto_service_latest`** (VPS2 via 10.0.0.2:5433 vs hosted Supabase): to be confirmed in step 0; decides the DSN and where 001/002 are applied.
- **`SECRET_COOKIE_PASSWORD`** present in labit-main's VPS1 env: assumed, verify (step 0).
- **VPS2 collector does not exist yet**: db-vps shows `Not monitored` until `*__vps2` collector rows exist and `node_service_map` rows are added. `supabase_main__vps` probes the
  legacy hosted Supabase and is informational. Add a seed note/UPDATE when the collector lands (suffix `vps2` is only assumed).
- **Placeholders**: Bonvoice and admin-console URLs (and `labit.sdrc.in` link guesses, mirth-lab lab-hours text) are `CHANGE-ME`; they render "not configured" until filled with
  `UPDATE labit_ops.menu_systems SET url=... WHERE id=...` after migration.
- **Informational rows**: whether the existing seed's `informational` flags need an `UPDATE` on an already-seeded DB (seed is `ON CONFLICT DO NOTHING`, so edits to the file do nothing live).
- **Live key reconciliation** (step 0) vs seed keys, including `labit_core__vps1` (labit-core may report from VPS2) and whether `__vps2` keys exist; devserver is unmapped (`not_monitored`), and its
  IP 100.65.63.54 is also cited as Sophos in labit CLAUDE.md.
- **`X-Panel-User` is not logged yet** by panel-api (sent by labit-main, trusted, logging only): no audit trail until added.
- **Pruning**: `heartbeats` / `status_history` are never pruned (no DELETE grant); DBA cron decision.
- **Heartbeat**: DISABLED by default (`HEARTBEAT_ENABLED=0`, `POST /heartbeat` returns 404). panel-api is localhost-only, so local machines cannot reach it; enabling needs a separate
  decision on exposure. No nginx location is provided. Agent scripts have no default URL (`PANEL_URL` must be set explicitly).

## Appendix A: heartbeat fallback (NOT part of go-live; do not use without the exposure decision above)
Files in `heartbeat/`: `gen-token.sh <node_id>` prints a token once plus its sha256 (the user runs the printed `update labit_ops.nodes set token_hash=...`),
`heartbeat.sh` / `heartbeat.py` agents, systemd service/timer, example env/checks files. Service keys map as `hb:<node_id>:<service>` in `node_service_map`.
