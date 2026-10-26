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
