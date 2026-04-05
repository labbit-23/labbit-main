# CTO Log Viewer Phase 1 (Human-Friendly Ops)

Last updated: March 26, 2026

## Why This Approach

Terminal logs (`pm2 logs`) are useful for engineers but not practical for daily operations.
Phase 1 should show structured, deduplicated incidents in CTO dashboard, not raw log streams.

This keeps it:
- readable for non-engineers
- mobile-friendly
- proactive (open/ack/resolved workflow)
- cost-safe on Supabase

## Scope

In scope:
- Event ingestion endpoint for curated incidents only
- Incident table with dedupe and counters
- CTO dashboard log viewer
- Basic acknowledge/resolve actions

Out of scope:
- Full text log shipping from PM2
- Raw line-by-line log search
- SIEM-level analytics

## Data Model

Use one primary table for active and historical incidents:
- `public.cto_events`

Each row represents one deduplicated incident fingerprint.
Repeated occurrences increment `occurrence_count` and refresh `last_seen_at`.

## Event Fingerprint

Fingerprint should be deterministic to avoid duplicates:

`sha1(lab_id + source + service_key + event_type + normalized_message)`

Examples:
- `supabase_timeout`
- `whatsapp_send_failed`
- `monitor_deadlock_retry`
- `webhook_auth_failed`

## Severity

Allowed values:
- `critical`
- `high`
- `medium`
- `info`

## Status

Allowed values:
- `open`
- `acknowledged`
- `resolved`

## Ingest Contract

Route:
- `POST /api/cto/events/ingest`

Headers:
- `Authorization: Bearer <CTO_INGEST_TOKEN>`
- `Content-Type: application/json`

Payload:

```json
{
  "lab_id": "b539c161-1e2b-480b-9526-d4b37bd37b1e",
  "source": "vps-public-monitor",
  "events": [
    {
      "service_key": "supabase_main",
      "event_type": "supabase_timeout",
      "severity": "high",
      "message": "upstream connect timeout",
      "payload": { "status_code": 502, "route": "/api/cto/whatsapp-sim" },
      "event_at": "2026-03-26T20:10:00+05:30"
    }
  ]
}
```

Server behavior:
1. validate token and payload
2. compute fingerprint
3. upsert into `cto_events`
4. if existing open/ack row exists, increment `occurrence_count` and update `last_seen_at`
5. if resolved row exists and same fingerprint reappears, reopen as `open`

## Dashboard UX (CTO)

Main filters:
- Status
- Severity
- Source
- Service
- Time range

Columns:
- Severity
- Service
- Event Type
- Message
- Source
- First Seen
- Last Seen
- Count
- Status
- Actions (Acknowledge, Resolve)

Cards:
- Open critical
- Open high
- New in last 1h
- Resolved in last 24h

## Cost / Load Controls

1. Do not store raw PM2 logs in Supabase.
2. Ingest only warning/error/high-signal events.
3. Dedupe by fingerprint to keep row count low.
4. Keep `payload` small (avoid huge stack traces).
5. Apply retention:
   - hard delete resolved events older than 30 days
   - archive optional later

## Retention Job

Daily cleanup SQL:

```sql
delete from public.cto_events
where status = 'resolved'
  and last_seen_at < now() - interval '30 days';
```

## Security

- Service-role writes only via Labit API
- Dashboard reads through Labit server APIs
- Add RLS later for direct-table reads if needed

## Rollout Plan

1. Create `cto_events` table and indexes.
2. Build `/api/cto/events/ingest`.
3. Emit curated events from:
   - monitoring ingest failures
   - WhatsApp send failures
   - webhook auth failures
   - repeated 5xx paths
4. Build CTO log viewer page.
5. Add ack/resolve endpoints.

---

This gives a non-technical, actionable log surface without turning Supabase into a raw log warehouse.
