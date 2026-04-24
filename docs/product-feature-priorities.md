# Product Feature Priorities (Pre-Freeze Window)

## Context
- Security + tenancy hardening is intentionally deferred until product freeze.
- Current sprint focus: standout patient/staff features with measurable adoption + conversion impact.
- Bot direction: hybrid schema+UI, multi-tenant configurable by lab.

## P0 (Build Now)

### 0) ClickUp Closed-Loop Operations (Write + Readback)
- Current gap: tasks are pushed to ClickUp but product workflows do not consume task status/ownership/SLA signals.
- Build:
  - map task intents to canonical task types (`quickbook`, `report_request`, `whatsapp_followup`, `doctors_connect`)
  - persist ClickUp task IDs in app DB for traceability
  - pull task status/assignee/due-date back into admin/WhatsApp workspace
  - show actionable badges (open, overdue, blocked, done) in-chat and on admin dashboards
  - support one-click transitions from app (re-open, close, escalate)
- Success metric:
  - % tasks with visible status in app
  - follow-up SLA compliance
  - reduced duplicate manual follow-ups

### 1) Cardiac Risk Assessment in Bot Flow
- Source: existing ready Python logic from external agent.
- Entry: WhatsApp main menu item (`CARDIAC_RISK_ASSESSMENT`).
- Flow:
  - guided Q&A
  - compute risk band (low/moderate/high)
  - return concise summary + disclaimer
  - CTA: book follow-up/home visit
- Tenant config:
  - enable/disable per lab
  - copy/disclaimer per lab
- Success metric:
  - completion rate
  - follow-up booking conversion

### 2) Report Concierge (Unified Reports Flow)
- One guided flow for:
  - latest report
  - trend report
  - specific test summary label
  - authorized recipient resend
- Include strict authorization checkpoint + reason capture.
- Success metric:
  - reduced manual agent interventions
  - higher successful first-attempt report delivery

### 3) Smart Rebooking + Follow-up Nudges
- Trigger from report patterns / elapsed time rules.
- One-tap booking CTA via WhatsApp.
- Success metric:
  - repeat booking uplift
  - reduced dormant patients

### 4) Failed/Missed Collection Rescue
- Automatic recovery options:
  - reschedule slot
  - alternate branch
  - callback request
- Success metric:
  - recovery rate from failed pickups

## P1 (Build Next)

### 5) Doctor Share Pack
- One-tap packet:
  - latest PDF
  - trend snapshot
  - key abnormalities summary
- Success metric:
  - share usage frequency
  - reduced support requests

### 6) Family / Dependent Vault
- Manage multiple patients under one primary number with consent logging.
- Success metric:
  - multi-patient account adoption

### 7) Patient Health Timeline
- Unified event stream:
  - visits, reports, flags, actions, WhatsApp interactions
- Success metric:
  - repeat engagement in timeline views

### 8) Home Visit ETA + Live Status
- Real-time status updates + delay handling.
- Success metric:
  - fewer "where is my phlebo" contacts

## P2 (After Freeze / Premium + Ops)

### 9) Abnormal Result Explainer
- Plain-language interpretation + next-action window.
- Success metric:
  - improved report comprehension feedback

### 10) Care Plans (Subscription)
- Periodic reminders + trend insights + priority assistance.
- Success metric:
  - subscription conversion / retention

### 11) Ops Control Tower Automation
- Auto incidents for SLA breaches and service degradations.
- Success metric:
  - MTTR reduction

### 12) WhatsApp Lead Capture Automation
- Convert high-intent queries to structured leads + assisted conversion.
- Success metric:
  - lead-to-booking conversion uplift

## Bot Platform Direction (Multi-Tenant)

### Decision
Adopt **Hybrid Schema + UI**.

### Why
- Keeps current `labs_apis.templates` runtime stable.
- Enables per-lab customization safely.
- Avoids complexity/risk of a full node-graph builder now.

### Build Scope
1. Schema-versioned flow config in DB (`flow_version`, `updated_by`, `updated_at`).
2. Admin UI for:
   - menu nodes
   - prompt text
   - template mapping
   - enable/disable flags
   - per-lab overrides
3. Draft / Publish workflow with rollback to prior version.
4. Simulator preview before publish.
5. Validation rules:
   - missing template refs
   - orphan nodes
   - invalid transitions
   - required disclaimers

## Notes for Implementation (Post-Freeze)
- Add new bot flow IDs: `CARDIAC_RISK_ASSESSMENT`, `REPORT_CONCIERGE`.
- Define cardiac execution contract:
  - input payload
  - adapter response schema (`risk_level`, `score`, `summary`, `disclaimer`, `cta`)
- Extend WhatsApp settings/admin to manage per-lab flow toggles and flow versions.
- Add simulator tests for both new flows and fallback behavior.
- Add ClickUp sync contract:
  - outbound: `task_type`, `lab_id`, `patient_phone`, `source_ref`, `priority`, `due_at`
  - inbound/readback: `task_id`, `status`, `assignees`, `priority`, `due_date`, `updated_at`
  - retry + idempotency keys to avoid duplicate tasks.
