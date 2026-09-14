# Labit Platform — Scoping Plan

Written 2026-09-14, from a director-level architecture conversation about
building a new, independently-branded "Labit" patient app/platform — not an
evolution of `labit-patient` (which stays as SDRC's own branded app), a new
repo, new identity (purple, `#8a6ba3`, labit-ui's own primary — not SDRC's
teal), aiming for as much of the patient journey (menu → booking →
requisitioning → payment → home-visit assignment → report delivery →
review) to run without staff intervention as is actually safe to automate.

Same director also gave the identical starting prompt to a separate agent
session in parallel, for comparison. This document reflects only this
session's own independent research and conclusions — no visibility into,
or influence from, that other session's output.

## 1. Architecture (settled this conversation)

- **labit-main** = the one shared, multi-tenant hub. Owns everything that
  is tenant-agnostic at the point of capture, and everything inherently
  cross-tenant: patient identity, booking intake, visits/dispatch,
  WhatsApp, CTO/ops, the `labs` table, `patient_external_keys`,
  `patient_addresses` (lat/lng, already built).
- **labit_core** stops being "the platform's shared backend" and becomes a
  **per-lab, self-hostable product**. SDRC's instance is the first/
  reference one, not privileged architecturally. Any new "decent sized"
  lab joining gets their own self-hosted instance of the same codebase.
  Owns what's genuinely specific to one lab's own clinical/financial
  operation once requisitioning has actually happened: catalog, billing,
  results.
- **Shivam-wrapper pattern** (`shivam-archive` + `labit_core`'s
  `patient_archive_service.py`) stays operational, generalized as the
  *lightweight* integration tier for labs that bring their own existing
  legacy system instead of standing up a fresh self-hosted core instance.
  Proven in production already (this is exactly how SDRC's own
  pre-cutover Shivam/Oracle history is served today).
- **New Labit app** = new repo. Independent of `labit-ui` and
  `labit-patient` specifically (both are consumer-facing skins for other
  tenants/products, not foundation). Depends on labit-main, and on
  whichever backend a given patient's tenant resolves to.
- **Multi-tenancy is not a gap anywhere in this stack** — it's a proven,
  already-used pattern spanning labit-main *and* labit_core through the
  shared `public.labs` id space (`labit_core.branch(kind='lab')` already
  references `public.labs(id)`; at least one other real lab, "YAPHY", is
  referenced by name in labit_core's own schema comments).

## 2. The six real gaps

Everything else audited this session (menu/catalog intake, payment-link
generation, home-visit geo data, location-confirmation UX, report
delivery, multi-tenancy itself) is mature and already built *somewhere*
in the org. These six are the actual net-new/incomplete work, each
already homed in the repo it belongs to under the architecture above —
not a stale single-core assumption:

| # | Gap | Repo | Notes |
|---|---|---|---|
| 1 | **Catalog curation** | labit_core (per-tenant) | `test`/`package` data is real, live, current (NOT the stale side — labit-main's own catalog is the Shivam-derived, legacy one). Just needs `patient_visible` set — confirmed live, 0 of 185 packages curated as of this session. Per-tenant, stays in each lab's own core instance. |
| 2 | **Booking (address + intake)** | **labit-main** | Booking happens before a tenant/backend is necessarily resolved, so it can't live inside any one lab's `labit_core`. Reuse the already-built `patient_addresses` (lat/lng, `is_default`) directly — do not add a new address field to `labit_core.patient_booking_request` (that table is itself a leftover from labit-patient's single-tenant-only scope, not the platform's real home for booking going forward). |
| 3 | **Payment confirmation** | labit_core (per-tenant) | QR/link *generation* exists and is patient-facing already (`order_service.render_upi_qr_data_uri`, `get_quote_upi_payment_link`). Confirmation that a payment actually landed is 100% manual today — zero webhook/reconciliation code anywhere (checked: no Razorpay, no generic webhook, no reconcile/verify pattern in labit_core). Billing stays with the tenant, so this stays per-instance. |
| 4 | **Proximity-matching algorithm** | labit-main | The data and UX are NOT gaps — `patient_addresses` has real lat/lng, and `YourDayView.js` already does live GPS capture + a confirmation modal on arrival. What's missing is narrow: nothing server-side ranks available phlebos by distance. Today's "priority" = workflow-status + time-slot only; assignment is a self-service claim-from-pool model, not system-computed. Needs an external geocoding/distance provider (none currently integrated anywhere in the org). |
| 5 | **Canonical adapter contract + tenant→backend resolver** | labit-main (or a new thin gateway) | The one item with no precedent, only an *informal* version of it (the Shivam-wrapper pair happens to agree on a shape because one team built both sides together, not because a documented contract exists). Needed because every UI/app that talks to a backend today hardcodes a single `LABIT_CORE_API_URL` env var (confirmed: 15+ files in labit-ui alone, same pattern in labit-patient) — no app currently resolves "which backend for this tenant" at request time. This is the one piece that actually needs building from nothing. |
| 6 | **Nomenclature cleanup** | labit-main | `psyntax`/`lettype` (raw Oracle/Neosoft column names) leak past internal code all the way into a patient-facing API's own response shape (`app/api/patient/portal/route.js` returns `lettype` directly) and a public query parameter (`psyntax_mode` in `app/api/smart-reports/trend-data/route.js`). Contained to 4 files in the trend-reports pipeline, not systemic — but not actually contained in effect, since it reaches a public API surface. **Going forward, the new Labit app's own code/contracts must never use vendor proper nouns (`Neosoft`, `Shivam`) as identifiers** — history can live in a comment, never in a class/file/field name. `archive:<reqno>` (the ID prefix already used throughout `patient_archive_service.py` and labit-patient) is the existing precedent for doing this right — vendor-neutral, plainly descriptive. |

## 3. Who does what, per stage (today vs. revised)

| Stage | Today | Revised |
|---|---|---|
| Menu/catalog | Patient, self-serve | Unchanged (curation, item #1, is a one-time staff task) |
| Booking | Patient submits; no address field to confirm location | Patient, self-serve, once #2 lands |
| Requisitioning | **Staff**, manually, by explicit design (permission-gated, `website_enquiry_service.py`'s own docstring: "no auto-decision happens in here") | **Still staff** — see §4, this is a policy decision, not a build |
| Payment (generate link) | Patient, self-serve | Unchanged |
| Payment (confirm landed) | **Staff**, manually checks their UPI app | System-automated once #3 lands — a clean automation, not a policy question |
| Home-visit assignment | **Phlebotomist**, self-claims from a shared unassigned pool (first-come, not distance-ranked) | Could become system-suggested/auto-ranked by proximity once #4 lands — whether the phlebo still confirms/can decline is a real design choice, not something to silently remove |
| Location confirmation | **Phlebotomist**, live GPS capture on arrival (already built, labit-main `YourDayView.js`) | Unchanged — already correct with a human confirming |
| Report delivery | System-automated already (labit-py + py_utils `report_sender`) | Unchanged — the one stage already running with no human in the loop |
| Review | Nobody — `report_feedback` (1-5 star, WhatsApp-bot/kiosk-fed) exists in labit-main but has zero connection to any patient app | Patient, self-serve, once wired up — cheap win, not on the critical path |

## 4. Not engineering — a decision still owed

Unattended requisitioning (booking → real order with zero staff review)
is gated behind a real permission today, on purpose, confirmed via an
explicit docstring in `website_enquiry_service.py`. Automating it is a
clinical/billing liability call for the director to make deliberately,
stage by stage — not a default to build toward just because "no human
intervention" was the original framing. Same instinct applies to home-
visit assignment (§3): moving from phlebo-claims to system-assigns
changes who acts, but shouldn't necessarily remove the phlebo's own
confirmation step, the same way GPS location confirmation correctly
stays human-in-the-loop today.

## 5. Explicitly not gaps (verified, not assumed)

- Home-visit address/geo data — mature, in labit-main.
- Home-visit location confirmation UX — already built, labit-main.
- Multi-tenancy — proven pattern, spans labit-main and labit_core.
- Report delivery — mature, already autonomous.
- Review/feedback *system* — already built (labit-main `report_feedback`);
  the gap is only that nothing patient-facing is wired to it yet.
