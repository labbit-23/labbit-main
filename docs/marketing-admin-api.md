# Marketing admin API (`/api/admin/marketing/*`)

Staff-session authenticated (iron-session cookie `labbit_session`), NOT the internal token. Allowed: staff whose role key (`executiveType` for executives, else `userType`) is in
`MARKETING_ADMIN_ROLES` (default `director,admin`), or whose id/email is in `MARKETING_ADMIN_USERS`. No session -> 401, wrong role -> 403.
All bodies are JSON. Failures return `{ "ok": false, "error": "..." }` with HTTP 400 (unexpected errors: 500 `{ "error": "..." }`). Every mutation writes a `marketing_audit` row
(who, action, campaign id, details; no names, phones or numbers). All data below is fake.

| Method + path | Purpose |
|---|---|
| GET `templates` | Registry templates (draft ones flagged `status:"draft"`; only `approved` can start a campaign) |
| GET / POST `segments` | List / create a saved segment `{name, filter, notes?}` |
| GET / PUT / DELETE `segments/:id` | Read / update / archive (soft). Existing campaigns keep their own filter snapshot |
| POST `audience/preview` | `{filter}` or `{segment_id}` -> labit-core aggregates only |
| GET / POST `offers` | List / create an offer |
| GET / PUT / DELETE `offers/:id` | Read / update / archive |
| GET / POST `campaigns` | List / create a campaign |
| GET / PATCH / DELETE `campaigns/:id` | Detail / edit (draft only) / delete (draft, no recipients) |
| POST `campaigns/:id/actions` | `prepare`, `diff`, `test`, `send`, `stop`, `resume`, `schedule` |
| GET `campaigns/:id/results` | Funnel, errors, cost, trend (`?refresh=0|1`, `?engagement=0|1`) |
| POST `campaigns/run-due` | Send one batch for scheduled campaigns that are due |
| GET `overview` | Cross-campaign totals + per-day trend (`?days=30&refresh=0|1`) |
| GET `audit` | Audit rows (`?campaign_id=&limit=100`) |

## Templates
`GET templates` -> `{ "ok": true, "templates": [ { "key":"trend_reports","name":"trend_reports","language":"en","category":"UTILITY","status":"approved","header":{"type":"image","sample_url":"https://..."},"body":"Dear {{1}}, ...","params":["first_name","records_label","last_visit_date","lab_contact"],"buttons":[{"type":"quick_reply","text":"Hi"}],"purpose":"...","notes":"..." } ] }`

## Segments
`POST segments` `{ "name": "Lapsed 12m, liver focus", "filter": { "segment": "package", "months_since_last_visit_min": 12, "focus_areas_any": ["liver"], "sex": "F" }, "notes": "pilot audience" }`
-> `{ "ok": true, "segment": { "id": "5f0c...", "name": "Lapsed 12m, liver focus", "filter": {...}, "notes": "pilot audience", "created_at": "..." } }`
The filter is labit-core's `AudienceFilters` (labit-core `docs/campaign-audience.md`). Unknown field names, wrong types, and the engine-owned fields (`opted_out_phones`, `messaged`, `include_focus`, `per_message_rate_inr`) are rejected with a clear 400 before any network call.

## Audience preview
`POST audience/preview` `{ "segment_id": "5f0c..." }` (or `{ "filter": {...} }`)
-> `{ "ok": true, "summary": { ...labit-core aggregates: funnel, breakdowns, estimate, anonymised sample... }, "cost_rate_inr": 0.88, "cost_note": "estimate, verify vs Mtalkz rate card" }`. Opt-outs and the cooldown list are applied for you. Any `phone/name/mrn/email/...` key is stripped before it leaves the server.

## Offers
`POST offers`
```json
{ "name": "Diwali 2026", "discount_type": "pct", "value": 20, "applies_to_packages": ["Executive Health Checkup"],
  "valid_from": "2026-11-01", "valid_to": "2026-11-30", "code": "DIWALI20",
  "tier_map": { "gold": { "value": 30 }, "vip": { "text": "Free vitamin D with any package" } },
  "terms": "Not valid with other offers." }
```
-> `{ "ok": true, "offer": { "id": "a1b2...", ...same fields } }`. A recipient's `offer_tier` selects a `tier_map` entry (`value`, `packages`, or a literal `text`); otherwise base values apply.
Rendered text, e.g. `30% off on Executive Health Checkup`.

## Campaigns
`POST campaigns`
```json
{ "name": "Diwali lapsed - liver", "template_key": "trend_reports", "segment_id": "5f0c...", "offer_id": "a1b2...",
  "pilot_size": 50, "header_image_url": "https://example.test/banner.jpg",
  "limits": { "per_run_cap": 100, "daily_cap": 1000, "rate_per_minute": 30, "cooldown_days": 30, "window_start_hhmm": "10:00", "window_end_hhmm": "18:00" } }
```
(`filter: {...}` instead of `segment_id` for an inline segment. `template_key` is mandatory: a raw template name is refused, and the template must be `approved` in the registry with a confirmed Mtalkz name. The lab is taken from the server (`DEFAULT_LAB_ID`); a `lab_id` in the body is ignored.) -> `{ "ok": true, "campaign_id": "c9d8...", "config": { normalised config } }`.
Limits are clamped to the code ceilings (500/run, 5000/day, 120/min, 09:00-20:00 IST) and cannot be raised. Statuses: `draft -> prepared -> scheduled? -> running -> completed`, plus `paused` (circuit breaker) and `stopped`.

`GET campaigns` -> `{ "ok": true, "campaigns": [ { "id","name","status","segment_type","template_key","segment_id","offer_id","send_after","created_at","prepared_at","config" } ] }`
`GET campaigns/:id` -> `{ "ok": true, "campaign": {...}, "recipients_by_status": { "pending": 50, "sent": 0 } }`

### Actions: `POST campaigns/:id/actions`
- `{ "action": "prepare", "dry_run": true, "pilot_size": 50 }` -> `{ "ok": true, "dry_run": true, "stats": { "eligible": 4210, "opted_out": 12, "messaged_recently": 80, "pilot_size": 50, "audience_after_exclusions": 4210 }, "offer": { "offer_id": "a1b2...", "by_tier": { "gold": 300, "none": 3910 }, "with_focus_areas": 2100 }, "sample": [ { "name_initial": "R", "phone_masked": "98******01", "last_visit_year": "2025", "last_package": "..." } ], "cost_estimate": { "messages": 50, "inr_with_gst": 52 }, "days_to_complete_at_daily_cap": 1 }`. Dry run writes nothing and is not audited.
- `{ "action": "prepare", "dry_run": false, "pilot_size": 50 }` stores the recipients (+ offer snapshot). After a pilot: `{ "action": "prepare", "dry_run": false, "expand": true }` adds the remaining audience (needs status `prepared`/`paused`, or `completed` for a campaign that was prepared as a pilot, once).
- `{ "action": "diff" }` -> `{ "ok": true, "diff": { "stored": 50, "audience_now": 4210, "would_add": 4160, "would_remove_pending": 0, "unchanged_pending": 50, "already_sent": 0, "already_skipped_or_failed": 0 } }` (counts only).
- `{ "action": "test", "numbers": ["<allowlisted>"] }` (omit `numbers` for all of `MARKETING_TEST_NUMBERS`) -> `{ "ok": true, "results": [ { "phone_masked": "98******11", "ok": true, "pmid": "wamid..." } ] }`; any number not on the allowlist rejects the whole call; an unset allowlist refuses all test sends; test sends are also refused outside the 09:00-20:00 IST window. A test counts as "done" (audit `campaign.test`, `ok: true`) only if at least one message was actually sent.
- `{ "action": "send", "batch_size": 20 }` (refused until a successful `test` exists for the campaign; a second caller while a batch is in flight gets `sent: 0, stopped_reason: "another batch is already sending..."`) -> `{ "ok": true, "sent": 20, "failed": 0, "skipped": 1, "remaining": 29, "more": true, "stopped_reason": null }`. Repeat while `more`. Outside the window: `sent: 0, stopped_reason: "outside send window ..."`. A scheduled campaign refuses manual send.
- `{ "action": "stop" }` / `{ "action": "resume" }` (resume: paused -> prepared).
- `{ "action": "schedule", "send_after": "2026-11-02T04:30:00Z" }` -> `{ "ok": true, "status": "scheduled", "send_after": "..." }`; `"send_after": null` clears (back to `prepared`).

`POST campaigns/run-due` -> `{ "ok": true, "due": 1, "results": [ { "campaign_id": "c9d8...", "sent": 100, "more": true } ] }`. One batch per due campaign per call, never outside the window. Nothing calls it on a timer (see marketing-campaigns.md).

## Results
`GET campaigns/:id/results`
```json
{ "ok": true, "campaign_id": "c9d8...", "name": "Diwali lapsed - liver", "status": "running", "template": "trend_reports", "send_after": null, "recipients": 50,
  "funnel": { "prepared": 50, "sent": 48, "delivered": 45, "read": 20, "failed": 3, "failed_by_code": { "131026": 2, "send_error": 1 }, "skipped": 2, "replied": 6, "clicked": 4, "opted_out": 1 },
  "by_status": { "sent": 48, "failed": 1, "skipped": 1 }, "delivery": { "read": 20, "delivered": 25, "failed": 2, "sent": 1 }, "by_offer_tier": { "gold": 10, "none": 40 },
  "delivery_error_codes": { "131026": 2 }, "send_errors": { "...": 1 }, "skipped_reasons": { "empty_param:offer_text": 1 }, "opt_outs_since_prepared": 1,
  "trend_by_day": [ { "date": "2026-11-02", "sent": 48, "delivered": 45, "read": 20, "failed": 2 } ],
  "cost_so_far_estimate": { "messages": 48, "inr_ex_gst": 42, "inr_with_gst": 50 } }
```
`GET overview?days=30` -> `{ "ok": true, "days": 30, "totals": { "sent","delivered","read","failed","opted_out" }, "cost_estimate_inr_with_gst": 1234, "trend_by_day": [ {date,sent,delivered,read,failed} ], "per_campaign": [ {campaign_id,name,status,sent,delivered,read,failed} ], "campaigns_by_status": { "completed": 3 } }`

## Audit
`GET audit?campaign_id=...` -> `{ "ok": true, "audit": [ { "id": 7, "created_at": "...", "actor_name": "Dr Fake", "actor_role": "director", "action": "campaign.send", "campaign_id": "c9d8...", "details": { "sent": 20, "failed": 0, "ok": true } } ] }`
Actions: `segment.create|update|archive`, `offer.create|update|archive`, `campaign.create|update|delete|prepare|test|send|stop|resume|schedule|run_due`.
