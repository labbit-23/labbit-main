# WhatsApp bot automations, interaction tracker and staff inbox

Code: `lib/whatsappBot/*`. Webhook hook: one flag-guarded block in `app/api/whatsapp/webhook/route.js` (just before "9. Human Handoff Mode").
Migration: `db/migrations/20261028_marketing_bot_tracker.sql` (idempotent, not applied). Tests: `tests/whatsappBot.test.mjs` (Meta client and DB mocked).

Everything is OFF by default. `whatsapp_bot_settings` has no rows until staff switch something on; a missing row or a DB error reads as "off".
`global_enabled=false` is the kill switch: no automation, no tracking, no inbox capture, and the webhook behaves exactly as before.

## How it fits the existing bot
The router EXTENDS the old bot, it does not replace it. It only looks at a message when the session is idle (`current_state = START`) and
not already with a human (`handoff`/`pending`). Greetings, the Trend Report / Previous Reports buttons, location pins, media and every
mid-flow menu reply are passed straight through (tracked, never claimed). If an intent's flag is off, or the router throws, the old flow runs.
STOP/UNSUBSCRIBE is handled earlier by the existing opt-out block (unchanged). A thread open in the staff inbox owns the chat: patient
messages are appended to it and the bot stays quiet (the patient can still say "Hi" for the menu).

## Intents
| Intent | Triggers (examples) | Flag | Action |
|---|---|---|---|
| `report_status` | "where is my report", "report ready?", report + a requisition no. | `report_status` | Looks up reports registered to the SENDER's phone (`lookupReports`), reads live status (`getReportStatus`), replies "ready" or the standard status text. |
| `report_resend` | "send my report", "Latest Report" button | `report_resend` | As above, then sends the PDF only if `overall_status = FULL_REPORT`, max 3 per phone per day, PDF reachability checked. Partial: status text only (auto-dispatch sends the full report later). |
| `book_followup` | "Book follow-up" button, "home visit", "book ..." | `book_followup` | Creates a lead via labit-core `POST /api/website-enquiries` (same bridge/credentials as `lib/labitCoreEnquiry.js`), with campaign + offer id in the message when the patient replied to a campaign (needs `campaign_attribution`). One per phone per 24 h. If the bridge fails the chat goes to staff, so the lead is never lost. |
| `package_enquiry` | "price of thyroid profile", "full body checkup cost" | `package_enquiry` | Top 3 from `public.packages` (patient-facing, priced) then `lab_tests` (active, patient-visible, price > 0). Prices only from the catalogue; reply ends with a "Reply BOOK" offer. No match goes to staff. |
| `complaint` | "worst service", "refund", "wrong report" | `human_handoff` | Staff queue, apology holding reply. |
| `medical_advice` | "is my result serious", "should I worry", "which medicine" | `human_handoff` | Staff queue; reply states results are not interpreted over chat. The bot never interprets results. |
| unknown / low confidence | anything else, confidence < `min_confidence` (0.6) | `human_handoff` | Staff queue, polite holding reply (after-hours variant outside 07:00-23:00 IST). |
| `opt_in` | "START", "SUBSCRIBE" | `start_optin` | Deletes the number's row in `whatsapp_opt_outs`, confirms. (STOP is unchanged and always on.) |

Other flags: `tracker_enabled` (write the timeline), `inbox_enabled` (capture handed-off chats; handoff needs both `human_handoff` and `inbox_enabled`),
`campaign_attribution` (look up the latest sent `campaign_recipients` row for the phone within `campaign_attribution_days`=7 and carry `campaign_id` / `offer_id`;
offer id is read from `campaigns.config.offer_id` or `config.offer.id`).

Phone safety: reports are only ever looked up with the sender's own number. A requisition number typed by the patient must be in that list; otherwise the bot
answers with the generic privacy text and queues a `phone_mismatch` handoff, without confirming the requisition exists.

## 24-hour window
Every inbound sets the window (`last_inbound_at`, or the message's own timestamp for replayed messages). The bot sends free-form text only while it is open;
otherwise it records `window_closed_skip` and sends nothing. Staff replies in the inbox follow the same rule: outside the window `reply` returns
`409 window_closed` with the allowed templates. Templates are never invented: staff can only use names listed in `params.window_reopen_templates`
(empty by default; add only templates already approved in Mtalkz/Meta).

## Flow diagrams
```
inbound --> global_enabled? --no--> old bot
   |yes
   +--> track inbound (hash only) --> open staff thread? --yes--> append to thread, stay quiet
   |                                       |no
   +--> session idle (START, not handoff)? --no--> old bot
   +--> classify
         greeting / trend button / menu word -------> old bot
         START ---------------------------------> opt-in (flag)
         complaint | medical | unknown | low conf --> thread + holding reply (human_handoff + inbox)
         report_status/resend --> lookup by sender phone --> none: handoff | reqno not theirs: handoff
                                   --> status --> ready? --> resend: send PDF (limit 3/day) | status: say ready
                                              \-> not ready: status text only
         book_followup --> dup in 24h? say so | create enquiry --> ok: ack, event | fail: handoff
         package_enquiry --> catalogue --> reply + BOOK offer | none: handoff
flag off for an intent --> old bot unchanged
```
```
staff reply: window open? --yes--> free text | no --> approved template from list --> sent | else 409 window_closed
```

## Tables
`whatsapp_bot_settings` (key flags|params|texts), `whatsapp_interaction_events` (phone_hash, mrn, event_type, intent, campaign_id, offer_id, ref_id, small detail json,
no message text, no phone), `whatsapp_inbox_threads` (one live thread per phone, status open|assigned|resolved, tags, assigned_to, window start), `whatsapp_inbox_messages`,
`whatsapp_inbox_notes`. RLS on, service role only. Hash = sha256(`WHATSAPP_BOT_PHONE_SALT`:last10)[0:32]. Campaign sent/delivered/read for a patient are read at view time
from `campaign_recipients` (no extra writes in the status webhook).
Event types: campaign_* (derived), button_tap, inbound_message, bot_reply, report_status_sent, report_resent, package_info_sent, handoff_created, booking_created,
staff_reply, staff_assigned, staff_resolved, opt_in, window_closed_skip.

## Permissions and audit
Staff session (iron-session) + `hasPermission`: `marketing.bot.view`, `marketing.bot.manage`, `marketing.inbox.view`, `marketing.inbox.reply`, `marketing.tracker.view`.
The migration grants them to admin / manager / executive as listed in the SQL (director has `*`). Every staff action writes `audit_logs` (`marketing_bot.*`) with ids and counts only,
never phone numbers, names, MRNs or message text. These routes do not use the campaign agent's `marketingRoute` role gate.

## Routes (all under /api/admin/marketing, JSON, staff cookie)
| Method + path | Permission | Purpose |
|---|---|---|
| GET `/bot/flags` | bot.view | flags, labels, defaults |
| PUT `/bot/flags` | bot.manage | `{flags:{report_status:true}}` merge |
| POST `/bot/kill-switch` | bot.manage | sets `global_enabled=false` |
| GET/PUT `/bot/params` | view / manage | `min_confidence`, `report_resend_max_per_day`, `booking_dedupe_hours`, `catalog_max_results`, `campaign_attribution_days`, `window_reopen_templates` |
| GET/PUT `/bot/texts` | view / manage | reply texts; per language `en`/`te`/`hi`; empty value reverts a key; only listed placeholders allowed |
| GET `/inbox` | inbox.view | `?status=&assigned=none\|me\|<id>&tag=&q=<phone or MRN>&limit=&before=` |
| GET `/inbox/{id}` | inbox.view | thread, messages, notes, patient timeline; clears unread |
| POST `/inbox/{id}/reply` | inbox.reply | `{text}` or `{template:{name,params}}` |
| POST `/inbox/{id}/assign` | inbox.reply | `{assignee:"me"\|"<id>"\|null}` |
| POST `/inbox/{id}/resolve` | inbox.reply | `{note?, reopen?}` |
| POST `/inbox/{id}/tags` | inbox.reply | `{add:[],remove:[]}` |
| GET/POST `/inbox/{id}/notes` | view / reply | internal notes |
| GET `/tracker/summary?days=7` | tracker.view | aggregates |
| GET `/tracker/patients?days=14&limit=50` | tracker.view | recent patients (hash + MRN) |
| GET `/tracker/patient?phone=\|phone_hash=\|mrn=` | tracker.view | one patient timeline + campaign messages |

Examples (fake data):
```json
GET /bot/flags -> {"ok":true,"flags":{"global_enabled":false,"report_status":false,"book_followup":false,"...":false},
  "labels":{"global_enabled":"Global switch (off = all bot automations stop)"},"defaults":{"global_enabled":false}}
PUT /bot/flags {"flags":{"global_enabled":true,"human_handoff":true,"inbox_enabled":true}} -> {"ok":true,"flags":{...}}
PUT /bot/texts {"texts":{"hi":{"holding_reply":"<Hindi text>"}}} -> {"ok":true,"overrides":{"hi":{"holding_reply":"<Hindi text>"}}}
GET /inbox -> {"ok":true,"threads":[{"id":"3f0c...","status":"open","reason":"medical_advice","phone_masked":"******0001",
  "display_name":"Fake Patient","mrn":"MRN-FAKE-1","assigned_to":null,"tags":[],"campaign_id":null,"offer_id":null,"unread_count":2,
  "last_inbound_at":"2026-10-28T08:00:00Z","window":{"open":true,"closes_at":"2026-10-29T08:00:00Z","remaining_ms":86100000}}],
  "next_before":"2026-10-28T08:00:00Z"}
POST /inbox/3f0c.../reply {"text":"We will call you at 5 pm."} -> {"ok":true,"sent":"text","window":{"open":true,...}}
POST /inbox/3f0c.../reply {"text":"hello"} (window closed) -> 409 {"ok":false,"error":"window_closed","allowed_templates":[]}
GET /tracker/summary?days=7 -> {"ok":true,"by_type":{"inbound_message":120,"handoff_created":9,"booking_created":14},
  "by_intent":{"book_followup":30},"by_campaign":{"<campaign uuid>":{"inbound":40,"button_taps":22,"bookings":6,"handoffs":2}},
  "handoff_reasons":{"unrecognised":5,"medical_advice":2},"open_threads":{"open":3,"assigned":1},"distinct_patients":88}
GET /tracker/patient?mrn=MRN-FAKE-1 -> {"ok":true,"phone_hash":"a1b2...","events":[{"event_type":"booking_created","ref_id":"enq-1","created_at":"..."}],
  "campaigns":[{"campaign_id":"...","delivery_status":"read","sent_at":"..."}]}
```

## Meta templates the flows may need (for the Template agent; none are invented or required to run)
All replies above are free-form session messages sent inside the 24 h window, so no template is needed for the bot itself. Templates only help when staff must write
first after the window has closed (inbox reopen), and they would be registered in `params.window_reopen_templates`:
1. UTILITY `staff_followup_reopen`: "Hi {{1}}, this is SDRC Diagnostics following up on your message. Reply here and our team will help you." + quick reply buttons "Talk to us", "Call me back" (the button tap opens a fresh window).
2. UTILITY `report_status_nudge` (optional): "Hi {{1}}, your SDRC report ({{2}}) is ready. Reply SEND REPORT to receive it here." Quick reply "Send report".
3. MARKETING button targets: campaign templates should use quick-reply button texts the router recognises: `Book follow-up`, `Latest Report`, `View packages`
   (`Trend Report` / `Previous Reports` pass through to the existing bot). Any other button text is treated as free text.

## Known limits / follow-ups
- Router replies go out before the old flow; if the router sends and then throws, the old flow could also reply. Failures are logged `[whatsapp-bot]`.
- English only today; `te` / `hi` maps exist in `lib/whatsappBot/texts.js` and the settings table. Intent keywords are English plus a few Hinglish report phrases.
- Staff are not pushed a notification on a new handoff (the inbox and the existing chat console, which the session handoff also feeds, are the queues).
- Tracker aggregates scan the latest 20,000 events in the window (flagged `truncated`).
