# CTO Monitoring Phase 1

This document defines the first implementation contract for the CTO dashboard monitoring pipeline.

## Architecture

- Python collector runs on the local machine that has Tailscale access.
- Python reads monitoring targets from `services.ini`.
- Python polls internal/private systems and normalizes results.
- Python posts results to Labit via a protected ingest API.
- Labit writes snapshots and latest state into Supabase.
- CTO dashboard reads from Supabase through Labit APIs.

## Python Layout

Recommended files in the Python service:

```text
fetchreports/
  main.py
  config.ini
  services.ini
  monitoring_agent.py
  monitoring_checks.py
  monitoring_writer.py
```

Notes:

- `config.ini` remains for report and delivery config.
- `services.ini` is only for monitoring targets and collector settings.
- `main.py` should only add minimal glue later to run the monitor alongside the existing service.

## services.ini

Suggested shape:

```ini
[monitoring]
enabled = 1
lab_id = SDRC_MAIN
source = neosoft-edge-1
ingest_url = https://your-vercel-app.vercel.app/api/cto/ingest
ingest_token = REPLACE_ME
interval_seconds = 60
request_timeout_seconds = 8

[service:mirth_main]
type = http_json
enabled = 1
category = mirth
label = Mirth Main
url = http://100.103.168.62:8080/api/server/version
method = GET
expected_status = 200

[service:orthanc_main]
type = http_json_auth
enabled = 1
category = orthanc
label = Orthanc Main
url = http://100.103.168.62:8042/system
method = GET
username = ORTHANC_USER
password = ORTHANC_PASS
expected_status = 200

[service:labbit_prod]
type = http_json
enabled = 1
category = app
label = Labit Prod
url = https://your-vercel-app.vercel.app/api/health
method = GET
expected_status = 200

[service:report_lookup_test]
type = http_json
enabled = 1
category = neosoft
label = Report Lookup Test
url = http://127.0.0.1:8000/lookup/919999999999
method = GET
expected_status = 200

[service:report_status_test]
type = http_json
enabled = 1
category = neosoft
label = Report Status Test
url = http://127.0.0.1:8000/report-status/20260315001
method = GET
expected_status = 200

[service:tailscale_mirth]
type = tcp
enabled = 1
category = tailscale
label = Mirth Node Reachability
host = 100.103.168.62
port = 8080
timeout_seconds = 4

[service:local_delivery_engine]
type = heartbeat_file
enabled = 1
category = python
label = Delivery Engine Heartbeat
path = /var/tmp/fetchreports/delivery_engine_heartbeat.json
max_age_seconds = 300
```

## Supported Check Types

Phase 1 should support these check types:

- `http_json`
- `http_json_auth`
- `tcp`
- `heartbeat_file`

Later we can add:

- `mirth_channel`
- `orthanc_query`
- `process`
- `tailscale_status`

## Python Output Payload

Python should send one batched payload per cycle:

```json
{
  "lab_id": "SDRC_MAIN",
  "source": "neosoft-edge-1",
  "checked_at": "2026-03-17T11:00:00+05:30",
  "services": [
    {
      "service_key": "mirth_main",
      "category": "mirth",
      "label": "Mirth Main",
      "status": "healthy",
      "latency_ms": 182,
      "message": "HTTP 200",
      "payload": {
        "url": "http://100.103.168.62:8080/api/server/version",
        "status_code": 200
      }
    },
    {
      "service_key": "report_status_test",
      "category": "neosoft",
      "label": "Report Status Test",
      "status": "degraded",
      "latency_ms": 2210,
      "message": "Slow response",
      "payload": {
        "url": "http://127.0.0.1:8000/report-status/20260315001",
        "status_code": 200
      }
    }
  ]
}
```

## Status Values

Use only:

- `healthy`
- `degraded`
- `down`
- `unknown`

Suggested rules:

- `healthy`: expected response within threshold
- `degraded`: response works but is slow or incomplete
- `down`: connection failed, timed out, or invalid response
- `unknown`: collector could not determine status

## Labit Ingest API

Suggested route:

```text
POST /api/cto/ingest
```

Headers:

```text
Authorization: Bearer <token>
Content-Type: application/json
```

Labit should:

1. validate bearer token
2. validate `lab_id`, `source`, `checked_at`, `services`
3. insert rows into `cto_service_logs`
4. upsert rows into `cto_service_latest`

## Supabase Tables

### 1. Historical Logs

```sql
create table if not exists public.cto_service_logs (
  id uuid primary key default gen_random_uuid(),
  lab_id text not null,
  checked_at timestamptz not null,
  source text not null,
  service_key text not null,
  category text,
  label text,
  status text not null,
  latency_ms integer,
  message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_cto_service_logs_lab_checked_at
  on public.cto_service_logs (lab_id, checked_at desc);

create index if not exists idx_cto_service_logs_service_checked_at
  on public.cto_service_logs (service_key, checked_at desc);
```

### 2. Latest State

```sql
create table if not exists public.cto_service_latest (
  lab_id text not null,
  service_key text not null,
  category text,
  label text,
  status text not null,
  checked_at timestamptz not null,
  source text not null,
  latency_ms integer,
  message text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (lab_id, service_key)
);

create index if not exists idx_cto_service_latest_lab_status
  on public.cto_service_latest (lab_id, status);
```

## Initial Metrics For CTO Dashboard

The first dashboard version should prefer compact metrics over descriptive copy.

Top-level tiles:

- total services monitored
- healthy services
- degraded services
- down services
- average latency by category
- most recent ingest timestamp

Initial sections:

- core services status
- recent incidents from log transitions
- latency watchlist
- category summary: `mirth`, `orthanc`, `neosoft`, `tailscale`, `python`, `app`

## Phase 1 Targets

Minimum useful services to wire first:

- Mirth base API
- Orthanc system/status API
- Labit health endpoint
- local report lookup endpoint
- local report-status endpoint
- 2-3 important Tailscale nodes
- 1 local heartbeat file for a Python worker

## Manageability Notes

- Keep secrets out of `services.ini` when possible.
- If credentials must be local, restrict file permissions.
- Prefer known safe test endpoints and known test phone numbers.
- Avoid checks that trigger real patient-side side effects.
