# Bonvoice IVR — Phase 1 Build Outline

Corrected against the real `labbit-23/labbit-main` codebase (verified live,
2026-09-16), not the generic assumptions in `SDRC_Bonvoice_Full_Spec.md`
(which references `labit_ops`/`labit_reports`/`labit_analytics` schemas
and a standalone FastAPI backend for this piece — neither exists; the real
send-path is `labit-main`'s own Next.js API routes). This doc answers the
spec's own Section 14 "Open Questions for Claude Code to Answer" with real
facts, then gives a corrected build outline for Phase 1 only. Phase 2
(Voice AI) is a separate, much later effort — not scoped here.

## Section 14 answers (real facts, verified)

1. **WhatsApp provider**: a Meta Cloud API relay/bridge at
   `messaginghub.solutions` (`public.labs_apis.base_url` for
   `api_name='whatsapp_outbound'`), not a named BSP like Gupshup/Twilio.
   Auth is a per-lab API key stored in `labs_apis.auth_details.api_key`.
2. **Outbound WhatsApp send function**: `lib/whatsapp/sender.js`
   (`sendTemplateMessage`/`sendDocumentMessage`/`sendTextMessage`), already
   used everywhere in the app (bot replies, report dispatch, campaigns).
   For document/report sends specifically, `app/api/internal/whatsapp/
   report-template-send/route.js` is the real, current pipeline (fixed
   2026-09-13 to use the new Trends v2 renderer, not the legacy one).
3. **Patient identified by phone**: `public.patients.phone` (primary,
   ~7,295 rows) is checked first; `labit_core.patient.phone` (47,182 rows
   migrated from Shivam, 99.4% phone-populated, live-verified) as the
   fallback via `app/api/internal/patients/search` (built 2026-09-14,
   reuses `labit_core`'s own `patient_phone.normalize_phone10`/
   `patient_ids_for_phone`).
4. **Supabase table for patient phone**: `public.patients.phone` +
   `public.patient_external_keys` (per-lab external identity linkage) +
   `labit_core.patient.phone` as above. No `labit_ops`/`labit_reports`
   schema exists anywhere in this stack.
5. **Phone format expected**: canonical 10-digit India mobile, no `+91`/`91`
   prefix, via `lib/phone.js`'s `toCanonicalIndiaPhone()` — already the
   standard normalizer used across the bot, quickbook, and campaigns code.
   Do not write a new normalizer (spec's proposed `PhoneNormaliserUtil`) —
   import and reuse this one.
6. **Bot session/state management**: `lib/whatsapp/engine.js`'s state
   machine (`processMessage()`), backed by the `chat_sessions` table
   (`patient_id`, `lab_id`, state). The IVR flow does NOT need to touch
   this at all — it's a parallel, stateless webhook, not a bot conversation.
7. **Auth pattern for new internal endpoints**: this app has two, pick the
   one that fits — iron-session (`getSessionUser`, for staff-facing pages)
   or a per-integration shared-secret header (`X-Internal-Token`, e.g.
   `DELIVER_INTERNAL_TOKEN`, `PATIENT_LOOKUP_INTERNAL_TOKEN` — "one
   compromised integration should not hand over every other one" is the
   established convention here). Bonvoice's webhook has no such header
   today — see "Auth" below for the real recommendation.
8. **Existing logging pattern**: `whatsapp_messages` (direction=inbound/
   outbound/status, already the source of truth for delivery tracking
   across the whole app) plus `writeAuditLog()` (`lib/audit/logger.js`)
   for staff-attributable actions. A new `ivr_call_log` table (spec's
   Section 5) is reasonable and additive — doesn't conflict with anything.

## Corrected architecture

The spec assumes a separate FastAPI service. **Build this as a Next.js API
route in `labit-main` instead** — every dependency it needs (WhatsApp send,
patient/phone lookup, phone normalization) already lives there as
JS/TS code; routing it through a second backend would mean re-implementing
or HTTP-hopping to logic that's already local. If a Python/FastAPI service
turns out to be preferred for organizational reasons, that's a call to make
explicitly, not a default to inherit from a generic spec.

```
POST /api/webhooks/bonvoice-ivr   (new, app/api/webhooks/bonvoice-ivr/route.js)
  -> validate DataSource/callType/Direction, return 200 immediately
  -> normalize SourceNumber via lib/phone.js::toCanonicalIndiaPhone
  -> route by DTMF (same table as the spec's Section 3)
  -> "1,1" -> look up patient by phone (app/api/internal/patients/search
     pattern), resolve latest report, call report-template-send
  -> "1,2" -> same lookup, call the Trends v2 send path
  -> "1,3" -> NEW: query a schedule table (see below), send a WhatsApp
     text via sendTextMessage
  -> "1,0" / "2,0" -> sendTextMessage to front desk staff number, include
     caller's SourceNumber
  -> "2" -> log only
  -> insert one row into a new ivr_call_log table regardless of branch
```

**Real constraint the spec doesn't mention**: sending a report to "whoever
is calling" needs the same phone-ownership check already built into the
bot's `buildReportByReqnoResponse` (2026-09-13) — a caller's phone must
resolve to a real, matching patient record before anything gets sent. If
the number isn't recognized, the correct behavior is the same as the bot's
own fallback: log it, don't guess, maybe route to front desk instead of
silently failing.

## New table (matches spec's Section 5, corrected schema)

```sql
create table if not exists public.ivr_call_log (
  id uuid primary key default gen_random_uuid(),
  call_id text,
  source_number text,
  dtmf text,
  action_taken text,
  whatsapp_status text,
  bonvoice_payload jsonb,
  created_at timestamptz not null default now()
);
```
(`public`, not `labit_ops` — matches every other operational table in this
app; `labit_ops` doesn't exist here.)

## Schedule table (only needed for DTMF option "1,3")

The spec's `labit_ops.sdrc_schedule` (Section 8) is real, needed work, but
it's genuinely new — nothing today tracks doctor/test schedules in a
queryable form. Scope it as `public.sdrc_schedule`, same shape as the
spec proposes, plus a small admin screen. This is the one piece of Phase 1
that's actually new data modeling, not "call something that already
exists" — budget real time for it, not "just wire it up."

## Auth for the webhook

Bonvoice's DTMF webhook has no signature/token mechanism of its own per
the spec. IP-allowlist (spec's own suggestion) is reasonable as a first
gate; consider also accepting a shared query-string token as defense in
depth, matching this app's existing per-integration-token convention,
since IP allowlisting alone has failed to be a suffient control anywhere
else in this codebase's history (worth being consistent).

## What NOT to build (matches spec's Section 13, unchanged)

Confirmed nothing here touches the existing WhatsApp bot state machine,
report-sending pipeline, or auth. This is a new, isolated, stateless
webhook + a handful of calls into already-existing send functions.

## Sequencing

1. `ivr_call_log` table + the webhook route + DTMF routing (options 1,1 /
   1,2 / 1,0 / 2,0 / 2) — everything that calls code that already exists.
   Ship this first, it's most of the value with the least new surface.
2. `sdrc_schedule` table + admin screen + DTMF option 1,3 — the one
   genuinely new piece, sequence it second since it's not blocking the
   rest.
3. Send the IVR menu text (below) to Bonvoice support in parallel with
   either — it's their side to configure, not blocked by this app's build.
