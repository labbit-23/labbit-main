# Marketing WhatsApp templates: submission pack

Source of truth: `lib/marketingCampaigns/templateRegistry.js` (exact wording, params, buttons; unit-tested against Meta limits in `tests/marketingTemplates.test.mjs`).
Previews: `docs/marketing-previews/*.png`, regenerated with `python3 scripts/render-template-preview.py <key> <samples.json> <out.png>` (fake data only).
Header image for all image templates: `public/marketing/trend-header.png` (1200x628, neutral, no offer text). Intended public URL once deployed: `https://lab.sdrc.in/marketing/trend-header.png`.

**All clinical wording needs pathologist review before submission.** It is deliberately conservative: no diagnosis, no "normal/abnormal", no prevention or detection claims.
The lab number is never hardcoded: it is the `lab_contact` variable (env `MARKETING_CONTACT_PHONE`, set to the lab contact number as provided by the director).

## Existing, approved (do not resubmit)
| key | Mtalkz name | Category | Notes |
|---|---|---|---|
| `trend_reports` | `trend_reports` | confirm in Mtalkz (assumed Utility) | image header mandatory; quick replies Trend Report / Latest Report / Hi. Registry body is a reconstruction (middle of the text is elided in our notes): copy the exact text from Mtalkz. |
| `package_results` | Mtalkz name `package_patients` | confirm category | image header; quick reply Hi |

## New templates to submit (recommended order)
| # | key / name | Category | Why that category | Re-categorisation risk |
|---|---|---|---|---|
| 1 | `health_summary_link` / `sdrc_health_summary_link` | UTILITY | Info about the patient's own results, no offer. Offer lives on the landing page. | Medium for old visits: a "your results are available" for a visit a year+ old can be rejected as Utility or flipped to Marketing. Fine for recent visits. Any offer/booking wording or promotional image flips it. |
| 2 | `annual_checkup_reminder` / `sdrc_annual_checkup_reminder` | MARKETING | Encourages a new purchase | none |
| 3 | `reengage_we_miss_you` / `sdrc_we_miss_you` | MARKETING | Solicits future business; text only | none |
| 4 | `festival_offer` / `sdrc_festival_offer_<year>` (e.g. `sdrc_diwali_offer_2026`) | MARKETING | Offer, price, booking CTA | none; never submit as Utility |

(d) Utility report-ready / collection follow-ups were deliberately **not** added: `trend_reports`, `package_results` and the existing report-dispatch templates already cover them.

Why this order: (1) is the only new Utility one and the cheapest per message, so test it first on recent visitors; (2)-(3) are the evergreen Marketing sends; (4) depends on the actual offer and banner being finalised, so it goes last (one new submission per festival).
Meta review is usually minutes to 24 h; submit all at once, but do not pilot-send any until approved. Start every campaign with a small pilot batch and watch the quality rating and failure codes.

## Per-template submission checklist (Mtalkz / Meta Business Manager)
For each: name (lowercase, underscores), language `en`, category as above (do not "let Meta choose"), then
- [ ] Header: IMAGE with `trend-header.png` as the sample (festival: the banner), or none
- [ ] Body: paste the exact text from the registry, add the **sample values** below (Meta rejects variables without examples)
- [ ] Footer (Marketing ones): `Reply STOP to opt out`
- [ ] Buttons exactly as in the registry; quick-reply text <= 25 chars
- [ ] Body does not start or end with a variable and has no adjacent variables (tested)
- [ ] No unfilled `[BRACKETS]` (festival template: fill offer, date and landing page URL first)
- [ ] Pathologist sign-off on wording

Sample values (fake): `{{1}}` Rahul; `{{2}}` 12 Mar 2025 (health_summary_link, we_miss_you) or Full Body Checkup (annual_checkup_reminder); `{{3}}` 04000000000 (health_summary_link, we_miss_you) or 12 Mar 2025 (annual_checkup_reminder); `{{4}}` 04000000000 (annual_checkup_reminder).
URL button on `sdrc_health_summary_link`: `https://app.sdrc.in/s/{{1}}`, sample suffix `Kq7Zx2mPa9LdW4tRbN8vYcE1sH`. Submitted to Meta 2026-10-28 (pending); needs the nginx rule for `app.sdrc.in/s/`. The domain/route must be live and token-gated before sending (the existing campaign button mechanism is `{summary_token}`, see `docs/marketing-campaigns.md`; that doc's example uses `app.sdrc.in`, so confirm which domain is canonical).

## Cost notes
- The Rs 0.88 per message figure is an **assumption, to be verified against the Mtalkz rate card** (Meta's India per-message rates, plus the Mtalkz markup, change on Meta's schedule; Oct 2026 per-message pricing applies).
- Utility messages are priced lower than Marketing in India, and Utility sent inside an open 24 h customer-service window can be free; Marketing is always charged. A mis-categorised-to-Marketing template therefore costs more per message: that is the real cost of the re-categorisation risk above.
- The campaign dry run's cost estimate (`estimateCost`) uses the configured rate; set it from the verified rate card, not the assumption.

## Meta classification rules (honest summary)
- Anything promotional (offer, discount, "book now", reminder to buy again) is Marketing. Putting it in a Utility template gets it re-categorised, and repeated mis-categorisation harms the account.
- Utility must be tied to a specific transaction the user did. A "records are ready" message for a year-old visit is no longer a timely transaction update and may be rejected or re-categorised; use the Marketing templates for old-visit audiences.
- Marketing messages need an easy opt-out (STOP button here) and are subject to Meta's per-user marketing frequency limits, which can silently drop sends.
