# Labit App — Consumer Marketplace Scoping

Written 2026-09-20, director prompt: "what we need is scoping out labit
app for general population to use, not just SDRC clients. Thats the big
one." Builds on `LABIT_BUILD_REFERENCE.md` (2026-09-14) rather than
replacing it — that doc's roles table, Provider Contract v1 shape, and
gap list all still apply. This doc covers what changes when the target
shifts from "SDRC + a few more onboarded labs" (B2B multi-tenant, patient
already belongs to a tenant) to **a marketplace**: a patient with no
prior relationship to any lab opens the app, discovers/compares labs and
tests, and books — confirmed director framing, 2026-09-20 ("Consumer
marketplace, any patient picks any lab").

Platform: director, 2026-09-20: "I personally prefer apps to be
available as an option between a web app and a proper download from the
App/Play Stores" -- then, once native-vs-web sequencing was proposed:
"Can the webapp not run in a container wrapper from the app store and
keep things simple so we push features equally in all tree [three]
directions?" Settled on **one web app codebase, wrapped via Capacitor
(or equivalent) into real iOS/Android binaries**, not a separate native
rewrite and not a bare WebView-pointed-at-a-URL wrapper either:

- Capacitor bundles the built web assets INTO the native binary (not a
  live remote URL in a WebView) and bridges native APIs -- push
  notifications, GPS, camera -- through plugins. This is what lets it
  pass App Store review as a genuine app (Apple's "minimum functionality"
  guideline rejects thin website wrappers; a Capacitor app with real
  native touches like push notifications clears that bar routinely).
- Because it's one codebase, there is no "web first, native later"
  phase -- every feature ships to web/iOS/Android together. The Provider
  Contract and backend still need to stay platform-agnostic (no
  browser-only assumptions), but that was already true for other
  reasons (§1).
- Native plugin surface worth planning for early since it changes what's
  possible: push notifications (a second channel alongside WhatsApp for
  status updates -- report_ready, collector_en_route, etc.), camera
  (prescription photo upload, already a web feature per
  `patient_catalog_service.py`'s search-autocomplete note -- becomes
  higher-quality via native camera access), and GPS (home-visit
  flows, gap D below, get more reliable native geolocation than a
  mobile browser's).
- Next.js specifically: Capacitor wraps a static/bundled export, not a
  live server-rendered app -- needs the patient-app's pages built as a
  static-exportable bundle (API calls still hit the tenant hub over the
  network same as today; only page rendering needs to be static-
  exportable). Worth confirming early since it constrains some Next.js
  patterns (no server components that require a live Node server at
  request time for the wrapped pages).

## 1. What the reference doc already gives us for free

The architecture in `LABIT_BUILD_REFERENCE.md` §1-2 was built assuming
multi-tenancy, not single-tenant — it turns out to need very little
rework for a marketplace:

- **Provider identity mapping** (§2) already models one patient linking
  to *multiple* providers (`labit_patient_id` / `tenant_id` /
  `provider_id` / `provider_patient_id` / `verified_link_status` /
  `consent_scope`) — this was designed for exactly the marketplace case,
  even though it was written under a B2B framing.
- **Provider Contract v1** (§2) — catalog/package export+search, price
  estimate, order/requisition create, payment ack/reconcile, status
  reads, delivery writeback, capability flags, canonical event
  vocabulary — is the same interface a marketplace needs to talk to N
  independent labs, not just SDRC. Nothing about it assumes a single
  provider.
- **Roles** (§1): tenant hub (`labit-main`) / provider core
  (`labit-core`, not privileged) / new patient app (new repo) — this
  separation is exactly what lets the patient app stay lab-agnostic.

So the Provider Contract v1 is *more* load-bearing for a marketplace than
it was for the original B2B plan, not less — it's the only thing standing
between the patient app and N differently-built lab backends. Build it
first, same as §5 already said, but now every design choice in it should
be checked against "does this still work with 5 unrelated labs, not just
SDRC + YAPHY."

## 2. What's genuinely new (not in the 2026-09-14 reference doc)

| # | Gap | Why it's new | Rough shape |
|---|---|---|---|
| A | **Lab/provider directory + discovery** | Nothing today lists "which labs are on the platform" as a patient-facing concept — tenants are resolved internally, never browsed. | A `providers` (or reuse/extend `labs`) table exposed read-only to the patient app: name, service area (geo), capability flags, active status. Backing API in the tenant hub. |
| B | **Cross-provider catalog search/comparison** | Provider Contract's catalog export is per-provider by design (§2) — a marketplace needs to fan out to every provider a patient can reach, merge, and let them compare price/turnaround for the same test. | A tenant-hub-side aggregator: fan-out + merge + cache (catalog data doesn't change per-request), not a change to the contract itself. |
| C | **Tenant-agnostic patient identity from day one** | B2B assumed a patient starts inside one tenant's flow. Marketplace patients sign up on the platform *before* choosing any lab. | Patient auth/profile must live fully in `labit-main` (already mostly true) with zero required provider link at signup — provider links attach later, per the identity-mapping table in §2. |
| D | **Geographic reach per provider** | §3 gap #4 (proximity ranking) was scoped for *within one tenant's* home-visit assignment. Marketplace needs a *pre-filter*: which providers even serve this patient's location/test at all, before ranking anything. | Extend the provider directory (A) with a service-area shape (radius, pincode list, or polygon); filter providers before catalog search (B) runs. |
| E | **Trust/quality signals** | A B2B patient trusts "their" lab by default; a marketplace patient is choosing among strangers. | Out of scope for v1 — flag only. Likely needs certifications/accreditation display and eventually reviews, but don't build ahead of the core booking flow. |
| F | **Scalable provider onboarding** | SDRC + YAPHY were both onboarded by hand. A marketplace that wants real "general population" reach needs onboarding that doesn't require a bespoke engineering pass per lab. | Not v1. Note it as a real future requirement so the Provider Contract is versioned/documented well enough that a new lab's engineering team (not this one) could implement an adapter from the spec alone. |
| G | **Neutral platform branding** | §3 gap #6 already bans vendor proper nouns in identifiers — extend the same principle to the *product surface*: the marketplace app can't look like it's "SDRC's app" with other labs bolted on, or no lab will trust it as neutral. | Design/brand decision, not engineering — flag for the director, don't default it. |

## 3. Decisions still owed (director calls, not engineering tickets)

Same posture as reference doc §4 — don't let a sprint plan silently
resolve these:

- **Payment/settlement model across providers.** If a marketplace patient
  pays through the platform (not directly to the lab), someone needs to
  decide the money-movement model (platform-as-merchant-of-record vs.
  pass-through) before Provider Contract v1's payment-ack shape is
  finalized. This changes the contract, so it blocks §5 step 1, not a
  later step.
- **How "general population" reach actually happens.** Marketplace with
  only SDRC+YAPHY on it isn't yet a marketplace in practice — is the plan
  to actively sell other labs on joining, or build the platform capacity
  and grow tenant count opportunistically? Doesn't block engineering, but
  should shape how much to invest in gap F (scalable onboarding) now vs.
  later.
- **Brand identity for the new app** (gap G above) — name, visual
  identity, whether it references SDRC at all in any lab-neutral context
  (e.g. footer, about page).

## 4. Revised sequencing (supersedes reference doc §5 for the new repo)

1. **Provider Contract v1**, re-checked against the marketplace case
   (§1-2 above) — same as reference doc step 1, higher stakes now.
   Platform-agnostic: no assumption the caller is a browser (so native
   can consume the same contract later without a rewrite).
2. **New repo scaffold** — one Next.js codebase, built static-exportable
   from the start (so the later Capacitor wrap isn't a retrofit),
   patient signup/auth with zero required provider link (gap C), talks
   only to the tenant hub, never a provider core directly (already the
   rule in §1's diagram).
3. **Capacitor wrap, early** — get the iOS/Android shells building and
   store-submittable (even near-empty) as soon as the scaffold exists,
   not as a late add-on. Confirms the static-export constraint holds
   before real features accumulate on top of it, and means every step
   below ships to all three surfaces together, per director's "push
   features equally in all three directions."
4. **Provider directory + geographic reach** (gaps A, D) — lives in
   `labit-main`, needed before search means anything.
5. **Cross-provider catalog search/comparison** (gap B) — the first
   genuinely new patient-facing feature; this is the moment the app
   stops being "SDRC's app with a login screen" and starts being a real
   marketplace.
6. **Booking + payment** — reference doc gaps #2 (address/intake, reuse
   `patient_addresses` as already planned) and #3 (payment confirmation),
   now blocked on the payment/settlement decision in §3 above.
7. **Native-plugin features** (push notifications as a second status
   channel alongside WhatsApp, native camera for prescription upload,
   native GPS for home-visit flows) — layered on once the core flow
   (steps 4-6) works, since they enhance rather than gate the first
   working marketplace flow.
8. **Proximity-ranked home-visit assignment, nomenclature cleanup,
   requisition-automation policy** — unchanged from reference doc §5
   steps 5-7, just later in this sequence since they're not on the
   critical path to a first working marketplace flow.

Trust/quality signals (gap E) and scalable onboarding (gap F) stay
explicitly out of this sequence until the core flow (steps 1-5) is proven
— noted so they don't get silently skipped, not because they're
unimportant.

## 5. Immediate next step

Nothing in the new repo yet — director is creating it. Once it exists,
step 1 (Provider Contract v1, re-checked against §1-2 here) is the
concrete first deliverable: a versioned, platform-agnostic interface
definition, checked in before any UI code, same as the original reference
doc already concluded.
