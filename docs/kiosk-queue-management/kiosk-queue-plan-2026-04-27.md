# Kiosk Queue Plan Notes (April 27, 2026)

## Context
We are planning a lite department queue system for kiosk/reception flow in `labbit-main` with py-backed data.

Scope explicitly excludes profile/password work for now.

## Decisions Locked Today
- Queue domain: `cardiology`, `sonology` (v1).
- Queue unit: test-level items.
- Clearing rule: clear at earliest available signal (`collected_at` or `approved_at`), whichever comes first.
- Ordering: oldest first across date range (`REQDT`, `REQTM`), not just today.
- Range: customizable `from` + `to`, default planned as last 7 days (including today).
- Data source for department mapping: Supabase test menu (`TCODE -> lab_tests.internal_code`), no hardcoded dept mapping.
- Queue payload must **not** include patient name.
- Kiosk device model: trusted device credentials (device key pair), not QR-dependent kiosk auth.
- Reception screen: separate read-only display mode (`/kiosk/display`), distinct from operator actions.
- Current phase: API + kiosk queue coding only after payload is shared.

## Payload Requirements (from py endpoint)
Expected queue-safe fields per row:
- `reqno`
- `reqid` (optional but preferred)
- `reqdt`
- `reqtm`
- `tcode`
- `test_name`
- `department_name`
- `approved_flg`
- `collected_at`
- `approved_at` (if available)
- derived fields:
  - `effective_clear_at`
  - `is_cleared`
  - `clear_source`

## Planned Code Touchpoints

### Py
- Minimal route wiring in `main.py`.
- Full queue logic in `tests_queue.py`.
- SQL source pattern based on:
  - `REQUISITIONS`
  - `REQUISITIONDTL`
  - `TESTMAST`
  - `DEPARTMENTS`

### Node (`labbit-main`)
- `lib/neosoft/client.js`:
  - add department queue fetch client.
- `app/api/admin/reports/department-queue/route.js`:
  - auth + scoped access + pass-through normalization.
- Kiosk:
  - operator queue consumption in kiosk flow.
  - separate display mode path: `/kiosk/display`.

## Future Queue Management Improvements

### 1) Bot Notifications (Next-in-Queue)
- Emit queue transition events on:
  - new item added
  - item cleared
  - item reopened
- Derive and publish:
  - `next_up_by_department`
  - `position_change`
- Integrate with existing WhatsApp/bot infra as a separate phase.

### 2) Queue Event Log / Audit
- Persist append-only events for traceability:
  - `seen`, `cleared`, `reopened`.
- Keep compact current-state snapshot table for fast reads.

### 3) Smart Alerting
- Threshold alerts:
  - stale pending beyond SLA
  - long backlog per department
  - sudden queue spike.

### 4) Display Enhancements
- Rotating queue + ad panels in `/kiosk/display`.
- Department-specific color coding and ETA hints.
- Silent auto-refresh + offline fallback behavior.

### 5) Operational Hardening
- Idempotent queue item keys.
- Deterministic sorting for equal timestamps.
- Null-safe timestamp parsing and fallback ordering.
- Scoped lab/device isolation.

## Open Inputs Needed Tomorrow
- Final py endpoint URL/config key.
- Real sample payload (single-day + multi-day + mixed clear states).
- Exact timestamp field names and timezone behavior.
- Confirmation of any extra flags in `REQDTLS` beyond `APPROVEDFLG`.
