# Marketing campaigns (WhatsApp) — runbook

Code: `lib/marketingCampaigns/index.js`, route `POST|GET /api/internal/whatsapp/marketing-campaign` (internal token), audience in
labit-core `GET /internal/campaign-audience` (token `CAMPAIGN_AUDIENCE_TOKEN`, reads the Shivam archive), schema
`db/migrations/20261026_marketing_campaigns.sql`. Replaces the Shivam-endpoint based `app/admin/campaigns` tool (dead since Shivam shut down).

## Audience (what "package" and "inactive" mean in the archive)
- A package purchase = `diagnotech.requisitiondtl.pkgid` -> `diagnotech.packagehdr`; `genpackage = 1` marks the general health-check
  packages (this is Shivam's `wf277`). Inactive = latest `diagnotech.requisitions.reqdt` for the MRN is before a date.
- Phone: `labit_core.patient.phone` > `ots1.patientsregistration.phone2` > the MRN's latest requisition `mobileno`; valid 10-digit Indian mobile only.
- Always excluded: any patient ever referred through a confidential source (`sourcehdr.confidential`), cancelled requisitions, anyone with a
  labit_core requisition since 2026-09-19 (or sharing a phone with one), opt-outs, anyone sent a campaign in the last `cooldown_days` (30).

## Campaign config (example: Diwali, package buyers not seen for a year)
```json
{ "name": "Diwali 2026 - package buyers",
  "config": {
    "template": { "name": "diwali_health_checkup_2026", "language": "en", "header_image_url": "https://.../diwali-banner.jpg", "params": ["first_name"] },
    "segment":  { "type": "package", "last_visit_before": "2025-10-26" },
    "limits":   { "per_run_cap": 100, "daily_cap": 1000, "rate_per_minute": 30, "cooldown_days": 30 } } }
```
Hard ceilings in code: 500 per run, 5000 per day, 120/min, send window 09:00-20:00 IST (config can only narrow it).
A campaign auto-pauses after 5 consecutive send failures (e.g. template not approved).

## Operate (token header `X-Internal-Token`, base `https://labit.sdrc.in/api/internal/whatsapp/marketing-campaign`)
1. `{"action":"create", ...}` -> `campaign_id`
2. `{"action":"prepare","campaign_id":"..","dry_run":true}` -> counts, anonymised sample, cost estimate. Nothing is written.
3. `{"action":"prepare","campaign_id":"..","dry_run":false}` -> stores recipients (status `prepared`)
4. `{"action":"test","campaign_id":"..","numbers":["<staff number>"]}` -> look at the real message on a phone
5. `{"action":"send","campaign_id":"..","batch_size":20}` pilot; then repeat `send` while `more` is true (each call is one ~45 s batch)
6. `GET ...?campaign_id=..` results (delivered / read / failed by Meta code, opt-outs, cost so far). Stop any time: `{"action":"stop",...}`.

## Template to submit (Meta Business Manager / Mtalkz) — MARKETING category
Name `diwali_health_checkup_2026`, language `en`, header IMAGE (banner), body:

> Hi {{1}}, wishing you and your family a very happy Diwali from SDRC Diagnostics! 🪔
>
> This festive season give your family the gift of good health. Book our Diwali Health Checkup — *[OFFER: package name, tests, price / % off]* — valid till *[DATE]*.
>
> Home sample collection available. Tap below to book.

Footer: `Reply STOP to opt out`. Buttons: URL `Book now` -> `https://sdrc.in/[offer-page]` (static) and Quick Reply `Stop promotions`.
Body example for {{1}}: `Rahul`. Do NOT submit it as Utility: Meta re-categorises promotional content and repeated mis-categorisation hurts account quality.
Fill the bracketed offer details before submission; the offer text is fixed in the template (only the first name varies) so review is quick.

## Fallback: the existing `trend_reports` template (image header, 4 variables, quick-reply buttons)
Already approved in Mtalkz (confirm its category there before a mass send). Body: "Dear {{1}}, your health records of ({{2}} on {{3}}) are available with us ... contact {{4}} or reply Hi."
The image header can carry the Diwali banner. Config:
`"template": { "name": "trend_reports", "language": "en", "header_image_url": "https://.../diwali-banner.jpg", "params": ["first_name", "records_label", "last_visit_date", "lab_contact"] }`
`lab_contact` reads env `MARKETING_CONTACT_PHONE` (no default; the dry run fails if it is unset). `records_label` is the last package, or "lab tests" when none is on file.
Caution: a promotional banner on a template approved as Utility can get the template re-categorised by Meta. Start with the pilot batch and watch the failure/quality counts.

## Second existing template: the package-results one (name: confirm in Mtalkz)
Body: "Dear {{1}}, results for your last health checkup are now available by clicking {{2}} (Package {{3}} done on date {{4}}). ... contact us on {{5}}. Reply with Hi ..." One quick-reply button "Hi", no header image.
`"params": ["first_name", "trend_link", "last_package", "last_visit_date", "lab_contact"]` with `"segment": {"type": "package", ...}`.
`trend_link` is the patient's trend-report page (needs an MRN). A recipient whose any variable is empty (e.g. no package on file, so use the package segment) is skipped with `skip_reason = empty_param:<name>`, not counted as a failure. The dry run's skipped count shows how many.

## Personalised follow-up with a "view my summary" button (diwali_followup_2026)
Per-patient link: `https://app.sdrc.in/s/<token>` opens that patient's one-page "Your health at a glance" PDF, built from their latest visit (Shivam archive or labit_core). The token is signed by labit-core (`summary_link_service`, same `BILL_LINK_SECRET` as the bill buttons), carries the MRN and an expiry, and is not guessable.
Template URL button: `https://app.sdrc.in/s/{{1}}` (dynamic suffix). Campaign config:
`"template": { "name": "diwali_followup_2026", "language": "en", "header_image_url": "https://.../banner.jpg", "params": [...], "link_valid_days": 21, "buttons": [{"index": 0, "text": "{summary_token}"}] }`
`prepare` asks labit-core for the audience with `link_valid_days`, stores each patient's token in `campaign_recipients.link_token` (migration adds the column), and `send` fills the button; a recipient without a token is skipped (`empty_button:0`).
Needs on VPS1 before it works: nginx `location /s/ { proxy_pass http://127.0.0.1:8081/public/s/; ... }` on app.sdrc.in (same block shape as `/r/` and `/pay/`), then a labit-core deploy.

## Engine v3 (2026-10-28): segments, offers, templates by key, scheduling, pilot
Migration `db/migrations/20261028_marketing_engine_v3.sql` (not applied until you do it by hand). Staff-facing API: `docs/marketing-admin-api.md`
(`/api/admin/marketing/*`, staff session + role check; the internal-token route above keeps working and gains a `due` action).
- **Template by key**: a campaign names a registry key (`lib/marketingCampaigns/templateRegistry.js`); name, language, params, header image and dynamic URL buttons
  are derived from it. `draft` templates cannot start a campaign.
- **Segment**: a saved row in `marketing_segments` or an inline filter; either way the filter JSON is copied into the campaign (a later edit of a saved segment never
  changes a campaign already made). The filter is passed verbatim to labit-core via `lib/marketingCampaigns/audienceClient.js`, the only module that knows labit-core's contract
  (`GET /internal/campaign-audience?filter=<json>` rows, `GET /internal/campaign-audience/summary?filter=<json>` aggregates). Legacy `package`/`inactive` segments still work.
- **Offer** (`marketing_offers`): pct or flat discount, packages, validity dates, tier mapping (`tier_map`, keyed by the audience row's `offer_tier`), terms, code.
  At `prepare` each recipient gets a snapshot (`offer_id`, `offer_text`, `focus_areas`, `offer_tier`); `send` fills the variables `offer_text`, `focus_areas`, `offer_code`,
  `offer_valid_till`, `offer_terms`. An empty variable skips the recipient. An offer outside its dates blocks both `prepare` and `send`.
- **Pilot**: `prepare` with `pilot_size: N` stores a deterministic sample (sha1 of campaign id + phone, so the same N every time). Review, send, then `prepare` with `expand: true` adds the rest.
- **Dry-run diff** (`diff` action): counts only, what a re-prepare would add/remove against the stored recipients.
- **Scheduling**: `schedule` sets status `scheduled` + `send_after` on a prepared campaign. `runDue()` (internal route action `due`, admin `POST campaigns/run-due`) sends ONE bounded batch for
  each campaign whose `send_after` has passed, only inside 09:00-20:00 IST, honouring every cap. **There is no cron/pm2 job**: until you add one (for example a minute-cron on VPS1 calling the
  internal route with `{"action":"due"}`), scheduled campaigns only move when someone calls it. Not adding it is deliberate.
- **Hard limits unchanged and not raisable from the panel**: 500/run, 5000/day, 120/min, window 09:00-20:00 IST, 5-failure circuit breaker, opt-outs, cooldown. `limits` from the panel are clamped in `normalizeConfig`.
- **Results**: funnel (prepared/sent/delivered/read/failed by Meta code/replied/clicked/opted-out), cost so far, per-offer-tier tally, per-day trend; plus a cross-campaign overview.
  `clicked` = an inbound webhook row whose `raw_message.type` is `button`/`interactive` and whose `context.id` is the campaign message; `replied` = any inbound from the recipient after the send.
- **A/B split**: not built (would be a per-recipient variant column and a second template key); say if wanted.
- Env: `MARKETING_TEST_NUMBERS` (comma list; the only numbers the admin `test` action can send to), `MARKETING_ADMIN_ROLES` (default `director,admin`), `MARKETING_ADMIN_USERS` (extra user ids/emails).
