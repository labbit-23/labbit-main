# Labbit VPS Operations Runbook

Last updated: March 26, 2026

This runbook covers day-to-day operations for:
- Frontend server process: `labbit-frontend` (Next.js, port `3000`)
- Python API process: `labbit-api` (FastAPI, port `8000`)
- Optional monitoring process: `labbit-monitoring` (currently recommended OFF)

## 1. VPS Layout

- Frontend repo path on VPS: `/opt/labbit-frontend`
- Python repo path on VPS: `/opt/labbit-py`
- PM2 user: `root` (based on current server setup)

## 2. PM2 Quick Commands

List processes:

```bash
pm2 status
```

View logs:

```bash
pm2 logs labbit-frontend --lines 200
pm2 logs labbit-api --lines 200
pm2 logs labbit-monitoring --lines 200
```

Restart:

```bash
pm2 restart labbit-frontend --update-env
pm2 restart labbit-api --update-env
```

Persist process state:

```bash
pm2 save
```

## 3. Standard Deploy - Frontend

Run on VPS:

```bash
cd /opt/labbit-frontend
bash scripts/deploy-vps-frontend.sh
```

Health checks:

```bash
curl -i http://127.0.0.1:3000/api/health
curl -i https://lab.sdrc.in/api/health
```

## 4. Standard Deploy - Python API

Run on VPS:

```bash
cd /opt/labbit-py
bash scripts/deploy-vps-api.sh
```

Health checks:

```bash
curl -i http://127.0.0.1:8000/health
curl -i https://api.sdrc.in/py/health
curl -i https://api.sdrc.in/py/openapi.json
curl -i https://api.sdrc.in/py/docs
```

## 4A. Ops Collector Ownership

Ops collector deployment is owned by `labbit-ops` (separate repo), not `labbit-main`.
Run ops deploy scripts from `/opt/labbit-ops` only.

## 5. Deploy API Without Monitoring

Recommended when we want `labbit-monitoring` disabled:

```bash
cd /opt/labbit-py
SKIP_MONITORING=1 bash scripts/deploy-vps-api.sh
```

One-time disable monitoring in PM2:

```bash
pm2 stop labbit-monitoring
pm2 delete labbit-monitoring
pm2 save
```

## 6. If Deploy Fails: "Working tree is dirty"

Example error:
- `❌ Working tree is dirty. Commit/stash/revert before deploy.`

Safe fix:

```bash
cd /opt/labbit-py
git status --short
git stash push -m "temp-before-deploy" -- ecosystem.config.cjs
SKIP_MONITORING=1 bash scripts/deploy-vps-api.sh
```

If local change is not needed:

```bash
git restore ecosystem.config.cjs
SKIP_MONITORING=1 bash scripts/deploy-vps-api.sh
```

## 7. Git-to-Server Release Flow

Local machine:

```bash
cd /path/to/repo
git add <files>
git commit -m "your message"
git push origin main
```

VPS:

```bash
cd /opt/<repo>
bash scripts/deploy-vps-<service>.sh
```

## 8. Env and Config Locations

Frontend:
- `/opt/labbit-frontend/.env.production`

Python API:
- `/opt/labbit-py/.env` (if used)
- `/opt/labbit-py/config.ini`
- `/opt/labbit-py/services.ini`

Check env-style values:

```bash
grep -E "WHATSAPP|WEBHOOK|INGEST|TOKEN|API_KEY|NEOSOFT" /opt/labbit-frontend/.env.production
```

## 9. WhatsApp/Bot Troubleshooting Checklist

1. Confirm inbound webhooks are arriving:
- Check `pm2 logs labbit-frontend --lines 300`
- Look for `RAW WEBHOOK` entries.

2. Confirm bot processing and outbound attempt:
- Look for `[bot] process result`, `[bot] send start`, `[bot] send ok`.

3. Confirm provider status callbacks:
- Query `whatsapp_messages` table for `direction='status'`.
- Ensure `status` values appear (`sent`, `delivered`, `read`, `failed`).

4. If inbound works but outbound not delivered:
- Share provider message IDs and timestamps with provider.
- Ask provider to trace DLR callbacks and WABA health for that window.

## 10. Known Good API Paths

Use these for quick path validation:

```bash
curl -i https://api.sdrc.in/py/health
curl -i https://api.sdrc.in/py/openapi.json
curl -i https://api.sdrc.in/py/latest-report-meta/919949099249
curl -i https://api.sdrc.in/py/report-status/20260315001
```

## 11. Rollback (Fast Recovery)

Frontend:

```bash
cd /opt/labbit-frontend
git log --oneline -n 5
git checkout <previous_commit>
pm2 restart labbit-frontend --update-env
pm2 save
```

API:

```bash
cd /opt/labbit-py
git log --oneline -n 5
git checkout <previous_commit>
pm2 restart labbit-api --update-env
pm2 save
```

After rollback, always run health checks from sections 3 and 4.

## 12. Daily Ops Snapshot Commands

```bash
date
pm2 status
df -h
free -h
pm2 logs labbit-api --lines 50
pm2 logs labbit-frontend --lines 50
curl -fsS https://api.sdrc.in/py/health
curl -fsS https://lab.sdrc.in/api/health
```

## 13. Dual-Monitor Architecture (Recommended)

Goal:
- VPS monitor: public health and bot-path checks.
- Office monitor: internal LAN/Tailscale/Mirth/Orthanc/cloud host checks.

Use separate configs and separate PM2 process names:
- `/opt/labbit-py/services.public.ini`
- `/opt/labbit-py/services.internal.ini`
- `labbit-monitoring-public`
- `labbit-monitoring-internal`

Important:
- Keep `monitoring.source` different for each monitor.
- Avoid overlapping `service:*` section names between the two configs to reduce DB lock contention.

Start on VPS (public monitor):

```bash
cd /opt/labbit-py
cp services.public.ini.example services.public.ini
MONITORING_SERVICES_INI=/opt/labbit-py/services.public.ini \
MONITORING_LOG_PATH=/opt/labbit-py/logs/monitoring-public.log \
pm2 start scripts/start-monitoring.sh --name labbit-monitoring-public --interpreter /usr/bin/bash
pm2 save
```

Start on office server (internal monitor):

```bash
cd /opt/labbit-py
cp services.internal.ini.example services.internal.ini
MONITORING_SERVICES_INI=/opt/labbit-py/services.internal.ini \
MONITORING_LOG_PATH=/opt/labbit-py/logs/monitoring-internal.log \
pm2 start scripts/start-monitoring.sh --name labbit-monitoring-internal --interpreter /usr/bin/bash
pm2 save
```

## 14. CTO Trend Digest + Log Compaction

Run one daily compaction job after midnight IST so dashboard trends stay fast and raw logs do not grow forever.

One-time setup:

```sql
-- Run in Supabase SQL editor
-- file: docs/cto-trends-compaction.sql
```

Manual dry-run:

```bash
curl -fsS -X POST "https://lab.sdrc.in/api/cto/compact" \
  -H "Authorization: Bearer ${CTO_INGEST_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"day":"2026-03-28","dry_run":true}'
```

Daily execution (digest yesterday + delete that day raw logs + keep only last 45 days raw):

```bash
curl -fsS -X POST "https://lab.sdrc.in/api/cto/compact" \
  -H "Authorization: Bearer ${CTO_INGEST_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"drop_digested_day":true,"prune_raw_older_than_days":45}'
```

Suggested cron (IST 01:20 daily):

```bash
20 1 * * * /usr/bin/bash -lc 'source /opt/labbit-py/.env && curl -fsS -X POST "https://lab.sdrc.in/api/cto/compact" -H "Authorization: Bearer ${CTO_INGEST_TOKEN}" -H "Content-Type: application/json" -d "{\"drop_digested_day\":true,\"prune_raw_older_than_days\":45}" >> /opt/labbit-py/logs/cto-compact.log 2>&1'
```

---

If you update scripts/process names/paths, update this runbook in the same PR so operations never drift.
