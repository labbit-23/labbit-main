# Labit Platform — Build Reference

Written 2026-09-14. Synthesizes two independent scoping passes —
`LABIT_PLATFORM_SCOPING_PLAN.md` (this repo) and `sdrc-website/docs/
labit-product-plan.md` (parallel session, same director prompt) — into one
buildable reference. Both source docs stay as-is; this is the reconciled
version to actually build against, not a replacement for either.

## 1. Roles (settled, both sessions agree)

Keep the existing repo names. Use these as **roles**, never rename the
repos themselves — the platform already has a rule (gap #6 below) against
letting vendor/proper nouns leak into identifiers, and swapping repo names
now (as one of the two source docs does — "Labit Core" / "SDRC Core") would
just create a second, competing vocabulary. Don't propagate that renaming
into code, docs, or comments.

| Role | Repo | Owns |
|---|---|---|
| **Tenant hub** | `labit-main` | Patient identity, booking intake, visits/dispatch, WhatsApp, CTO/ops, `labs` table, `patient_addresses`, `patient_external_keys` — everything tenant-agnostic at capture time or inherently cross-tenant. |
| **Provider core (reference impl.)** | `labit-core` | SDRC's own clinical/financial operation once requisitioning has happened: catalog, billing, requisitions, results, radiology, outsourcing, QC, machine integrations. Not architecturally privileged — the first instance of a pattern other labs will also run. |
| **Lightweight integration tier** | `shivam-archive` + `labit_core.patient_archive_service.py` | Proven pattern for labs bringing an existing legacy system instead of standing up a fresh provider core. Already in production (SDRC's own pre-cutover Shivam/Oracle history). |
| **New patient app** | new repo (not yet created) | Independent of `labit-ui` and `labit-patient` — both are skins for other tenants, not foundation. Purple brand (`#8a6ba3`, already labit-ui's primary — reuse, don't invent a new hex). Depends on the tenant hub, never calls a provider core directly. |
| **Workers** | `labit-py`, `py_utils` | Report delivery and shared worker patterns; must become tenant/provider-configurable rather than SDRC-hardcoded. |

```txt
Labit App
  -> Tenant hub (labit-main)
      -> Provider Adapter (contract, §2)
          -> Provider core (labit-core / SDRC first instance)
          -> Shivam-wrapper adapter
          -> future: lightweight provider core / external LIMS adapter
```

Multi-tenancy is not a gap — `labit_core.branch(kind='lab')` already
references `public.labs(id)`, and at least one other real lab ("YAPHY") is
already seeded. The gap is a documented contract at the boundary, not the
existence of tenancy itself.

## 2. Provider Contract v1 — the actual first artifact to build

Both sessions independently converge on this being the right thing to
write *before* any app code. Build it as a versioned interface (not
necessarily gRPC/OpenAPI on day one — a typed TS/Python interface both
sides import is enough to start), covering:

- tenant/provider metadata + capability flags (declared, not assumed —
  e.g. one provider supports direct payment confirmation, another only
  manual UPI reconciliation)
- catalog export/search, package export/search, price estimate
- create order/requisition
- acknowledge or reconcile payment
- get visit/order status, get sample status, get report status, get
  report document
- cancel/reschedule when allowed
- delivery event writeback

Provider identity mapping (lives in the tenant hub, not duplicated into
the patient app):

```txt
labit_patient_id
tenant_id
provider_id
provider_patient_id / MRN
verified_link_status
consent_scope
```

Canonical event vocabulary adapters translate their provider-specific
status strings into: `booking_created`, `estimate_ready`,
`payment_pending`, `payment_confirmed`, `visit_confirmed`,
`visit_assigned`, `collector_en_route`, `sample_collected`,
`sample_received`, `processing`, `report_ready`, `report_delivered`,
`review_submitted`.

Do not collapse home visit / order / requisition into one object — a
visit can exist before a requisition, a requisition without a visit, and
a booking can be paid before collection. The tenant hub owns the
patient-facing timeline that stitches these together; a provider core
never needs to know about visit-side concepts it doesn't have.

## 3. The real backlog — verified against code, not assumed

Six items, each already homed in the repo it belongs to under the
architecture above. This is the actual scope; treat any other "gap"
either source doc mentioned (menu/catalog UX, home-visit geo, location
confirmation, report delivery, tenancy) as already mature — verified, not
missing.

| # | Gap | Repo | Evidence |
|---|---|---|---|
| 1 | **Catalog curation** | `labit_core` (per-tenant) | `test`/`package` data is real and current — just needs `patient_visible` set. 0 of 185 packages curated as of 2026-09-14. One-time staff task per tenant, not engineering. |
| 2 | **Booking (address + intake)** | `labit-main` | Booking happens before a tenant/backend resolves, so it can't live in any one provider core. Reuse the already-built `patient_addresses` (lat/lng, `is_default`) — do **not** add a new address field to `labit_core.patient_booking_request` (a leftover from labit-patient's single-tenant scope). |
| 3 | **Payment confirmation** | `labit_core` (per-tenant) | QR/link generation exists and works today (`order_service.render_upi_qr_data_uri`, `get_quote_upi_payment_link`). Confirmation is 100% manual — no Razorpay, no generic webhook, no reconcile/verify pattern anywhere in `labit_core`. Billing stays with the tenant, so this is per-instance work. |
| 4 | **Proximity-matching for home-visit assignment** | `labit-main` | Data and UX are *not* gaps — `patient_addresses` has real lat/lng, `YourDayView.js` already does live GPS capture + arrival confirmation. What's missing is narrow: nothing server-side ranks available phlebos by distance. Today's model is self-service claim-from-pool. Needs an external geocoding/distance provider (none integrated anywhere in the org yet). |
| 5 | **Canonical adapter contract + tenant→backend resolver** | `labit-main` (or a new thin gateway) | The one piece with zero precedent — the Shivam-wrapper pair only agrees on a shape because one team built both sides together, not because a documented contract exists. Every current app hardcodes a single `LABIT_CORE_API_URL` (15+ files in `labit-ui` alone, same pattern in `labit-patient`) — nothing resolves "which backend for this tenant" at request time. This *is* §2 above. |
| 6 | **Nomenclature cleanup** | `labit-main` | `psyntax`/`lettype` (raw Oracle/Neosoft column names) leak into a patient-facing API response (`app/api/patient/portal/route.js` returns `lettype` directly) and a public query param (`psyntax_mode` in `app/api/smart-reports/trend-data/route.js`). Contained to 4 files today, but reaches a public surface. **Rule going forward:** the new app's code/contracts must never use vendor proper nouns (`Neosoft`, `Shivam`) as identifiers — history can live in a comment, never in a class/file/field name. `archive:<reqno>` (already used throughout `patient_archive_service.py` and labit-patient) is the existing precedent for doing this right. |

## 4. Decisions owed before building Phases 3–4 — not engineering tickets

Two items are blocked on a director call, not on code. Don't let a sprint
plan silently resolve either by default just because "zero human
intervention" was the original framing:

- **Unattended requisitioning.** Booking → real order with zero staff
  review is gated behind a real permission today, on purpose — confirmed
  via an explicit docstring in `website_enquiry_service.py`: *"no
  auto-decision happens in here."* Automating it is a clinical/billing
  liability call, decided stage-by-stage, not a default.
- **Home-visit assignment.** Moving from phlebo-claims-from-pool to
  system-assigns-by-proximity changes *who acts*, but shouldn't
  necessarily remove the phlebo's own confirmation step — same reasoning
  that keeps GPS arrival confirmation human-in-the-loop today. Decide
  whether system-ranked suggestions still require phlebo accept/decline.

Everything else in §3 is a clean automation (payment confirmation,
adapter contract, nomenclature) — build those without waiting on a
policy call.

## 5. Sequencing

Size against the verified backlog in §3, not a generic phase template —
neither source doc's week-count should be treated as a commitment; both
are speculative and pre-date the Provider Contract even existing.

1. **Provider Contract v1** (§2) — blocks everything downstream that
   talks to a provider core. Smallest possible version: request/response
   shapes, capability flags, event vocabulary, provider identity mapping.
   No app code before this exists.
2. **Booking address/intake** (gap #2) — reuse `patient_addresses`
   directly; this is the first real patient-app-facing surface and has no
   policy dependency.
3. **Catalog curation** (gap #1) — one-time staff task, can run in
   parallel with #1–2, not sequential.
4. **Payment confirmation automation** (gap #3) — clean automation, no
   policy blocker, but needs a payment-gateway/webhook decision per
   tenant (UPI-manual vs. gateway-webhook) declared as a capability flag
   in the contract from step 1.
5. **Proximity-ranked assignment** (gap #4) — needs an external
   geocoding/distance provider chosen first (none exist in the org today);
   ship as system-*suggested* ranking with phlebo accept/decline until §4's
   decision says otherwise.
6. **Nomenclature cleanup** (gap #6) — low-risk, can be done any time;
   do it before the new app's first contract version ships so the public
   surface doesn't inherit `psyntax`/`lettype`-style leaks.
7. **Requisition automation policy** (§4) — director decision point, not
   a build step; resolve before building whatever Phase 4-equivalent
   ("provider requisition bridge") work depends on the answer.

## 6. Explicitly not gaps (verified, don't re-audit)

- Home-visit address/geo data — mature, in `labit-main`.
- Home-visit location confirmation UX — already built (`YourDayView.js`).
- Multi-tenancy — proven pattern, spans `labit-main` and `labit_core`.
- Report delivery — mature, already autonomous (`labit-py` + `py_utils`
  `report_sender`).
- Review/feedback *system* — already built (`labit-main`
  `report_feedback`, WhatsApp-bot/kiosk-fed); the gap is only that
  nothing patient-facing is wired to it yet — a cheap win, not on any
  critical path.
