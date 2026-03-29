# Trend Reports Plan

This document defines the rollout plan for personalized Smart Reports and targeted follow-up communication based on patient lab trends.

## Goal

Build a clinically safe, scalable system that:

- detects meaningful parameter trends
- delivers personalized patient-friendly guidance
- recommends packages and follow-up tests
- offers home visit/lab appointment booking
- schedules reminders across 3-month to 12-month windows

## Product Vision

### Near-Term Outcome (MVP)

Send relevant promotional/support messaging when flagged parameters are detected (for example diabetes-risk related flags), with clear next-step actions.

### Long-Term Outcome (Smart Reports)

Generate personalized reports after health checkups using trend-aware rules and recommendations, with embedded follow-up CTAs and reminders.

## Scope

### In Scope

- Rule-based trend detection for key parameters
- Trigger-based content generation (message + recommendation + package)
- Smart Report generation framework (v1)
- Reminder schedules by risk level
- Home visit / lab appointment CTA flow
- Campaign and delivery tracking

### Out of Scope (Initial)

- AI-only clinical interpretation without rule guardrails
- Diagnosis language in patient-facing content
- Full multi-specialty expansion in first release

## Rollout Phases

### Phase 1: Triggered Messaging MVP

Objective: deliver high-signal, clinically reviewed patient nudges tied to key abnormal or worsening trends.

Deliverables:

- Top trigger library (5 to 10 conditions)
- Patient content templates (SMS/WhatsApp/banner)
- Recommendation mapping (what next, when to retest)
- Offer mapping (packages/home collection)
- Eligibility flags and suppression rules

Exit Criteria:

- Messages go only to eligible patients with valid consent
- Clinical team approves all templates
- Delivery and engagement telemetry visible

### Phase 2: Smart Reports v1

Objective: deliver personalized, structured reports for health checkup patients.

Report structure:

- What changed (trend summary)
- What it may indicate (non-diagnostic guidance)
- What to do next (time-bound action)
- Recommended package/follow-up
- Book now CTA (home visit/lab)

Trend windows:

- 3 months
- 6 months
- 12 months

Exit Criteria:

- Report generated reliably for selected parameter groups
- Recommendations are time-bound and auditable
- Booking links and reminder workflows active

### Phase 3: Automation + Optimization

Objective: increase conversion and adherence while preserving safety.

Deliverables:

- Risk-based reminder cadence optimization
- A/B testing on message framing and CTA placement
- Expanded parameter coverage
- Basic effectiveness scoring per report/trigger

## v1 Trigger Matrix

### 1) High Diabetes Risk

- Trigger: HbA1c above threshold or rising trend
- Patient message: Sugar trend needs attention; early action helps prevent complications
- Action: physician consult + retest in 3 months
- Offer: diabetes monitoring package + home sample collection
- Reminders: day 30, day 60, day 90

### 2) Prediabetes Watch

- Trigger: HbA1c in prediabetes band with upward movement
- Patient message: borderline sugar trend; lifestyle action can reduce risk
- Action: diet/activity guidance + retest in 3 to 6 months
- Offer: preventive metabolic package
- Reminders: day 45, day 90

### 3) Thyroid Concern

- Trigger: TSH outside range or worsening trend
- Patient message: thyroid marker shifted and needs review
- Action: endocrine follow-up + repeat panel in 3 months
- Offer: thyroid follow-up package
- Reminders: day 30, day 90

### 4) Anemia / Deficiency Pattern

- Trigger: hemoglobin/ferritin low or declining
- Patient message: markers suggest possible deficiency and follow-up is advised
- Action: clinician review + nutrition guidance + retest in 2 to 3 months
- Offer: anemia profile package
- Reminders: day 30, day 75

### 5) Kidney Function Watch

- Trigger: creatinine/eGFR trend worsening
- Patient message: kidney-related values need closer follow-up
- Action: physician review + kidney profile in 3 months
- Offer: renal monitoring package + home visit option
- Reminders: day 30, day 60, day 90

### 6) Lipid / Cardiac Risk

- Trigger: LDL/TG elevated or worsening trend
- Patient message: cholesterol trend suggests increased cardiovascular risk
- Action: lifestyle and clinician review + retest in 3 to 6 months
- Offer: cardiac risk package
- Reminders: day 45, day 120

## Clinical and Compliance Guardrails

- All recommendations are advisory, not diagnostic
- Include medical disclaimer in every patient-facing smart report/message
- Separate consent handling:
  - transactional/health communication consent
  - promotional marketing consent
- Maintain clinician approval workflow for every trigger template
- Log report version, rule version, and message version for auditability

## Local LLM Advisory Layer (Non-Diagnostic)

Purpose: improve readability and personalization while keeping rule outputs clinically safe.

Architecture:

- Rules engine remains source of truth for flags, risk tier, and follow-up timelines.
- Local LLM rewrites approved facts into patient-friendly language.
- Policy guard blocks diagnosis, prescription, and definitive medical claims.
- If LLM output fails policy checks, system falls back to approved static template.

Prompt constraints:

- Use only provided structured facts from trends/rules.
- Do not infer diseases or provide diagnosis.
- Use advisory wording: may, could, consider.
- Keep recommendations time-bound and aligned to approved playbooks.
- Append mandatory disclaimer in every output.

Mandatory disclaimer:

- This summary is AI-assisted and may be inaccurate.
- This is not a diagnosis or treatment advice.
- Please consult a qualified doctor for medical decisions.

Audit requirements:

- Persist `facts_payload`, `prompt_version`, `model_version`, and `llm_output`.
- Track `policy_check_status` and fallback reason where applicable.
- Enable clinician review mode for high-risk categories.

## Data Model (Proposed)

### Core Entities

- `smart_report_rules`
  - id, parameter_key, trend_window, condition_json, severity, active
- `smart_report_templates`
  - id, trigger_key, channel, language, message_body, disclaimer, active
- `patient_flags`
  - patient_id, trigger_key, first_seen_at, last_seen_at, status
- `smart_reports`
  - id, patient_id, visit_id, report_payload_json, risk_level, generated_at
- `smart_report_actions`
  - smart_report_id, action_type, due_date, status, completed_at
- `smart_report_reminders`
  - smart_report_id, remind_at, channel, status, attempts

### Reuse Existing Platform Pieces

- campaign run and recipient tracking (`campaigns`, `campaign_recipients`)
- WhatsApp delivery flow in current internal messaging APIs
- package catalog and health package mapping for offer recommendations

## Delivery Channels

- Smart report in app/PDF link
- WhatsApp template messages
- SMS fallback
- Admin dashboard banner/widget for follow-up lists

## Measurement Framework

Primary KPIs:

- Follow-up booking conversion rate
- Repeat checkup completion (3 to 12 months)
- Message delivery and open/click rate
- Offer-to-booking conversion

Quality KPIs:

- Clinical team acceptance score
- Report helpfulness feedback
- False positive/low-value message rate

## Execution Plan (90-Day)

### Sprint 1 (Weeks 1 to 2)

- Finalize trigger definitions and thresholds
- Draft and clinically review template copy
- Create rules/templates tables and seed v1 triggers

### Sprint 2 (Weeks 3 to 4)

- Implement flagging pipeline and eligibility filtering
- Integrate WhatsApp/SMS/banner delivery
- Add basic campaign telemetry and suppression controls

### Sprint 3 (Weeks 5 to 8)

- Build Smart Report v1 renderer
- Add recommendations + package mapping + booking CTA
- Release reminders scheduler for v1 risk categories

### Sprint 4 (Weeks 9 to 12)

- Expand parameter coverage
- Run A/B tests on framing and CTA
- Tune reminder cadence using performance data

## Risks and Mitigations

- Risk: over-messaging causes fatigue
  - Mitigation: suppression windows, cap frequency, priority ranking
- Risk: clinically ambiguous messaging
  - Mitigation: mandatory clinician sign-off and strict non-diagnostic language
- Risk: low conversion despite high delivery
  - Mitigation: improve CTA clarity, personalize timing, optimize package fit

## Decisions Needed

- Initial threshold set per parameter (lab-specific vs global)
- Consent policy behavior when one consent type is missing
- Primary channel priority (WhatsApp-first vs app-first)
- Owner mapping: Product, Clinical, Engineering, Operations

## Next Build Items

1. Create SQL migration for Smart Reports entities.
2. Define rules JSON schema and validator.
3. Add `POST /api/smart-reports/generate` endpoint.
4. Add reminder scheduler job and campaign integration hooks.
5. Create admin page for trigger/template management.

## Implementation Reference

- See detailed execution architecture: [trend-reports-architecture-next-week.md](/Users/pav/projects/Labbit/labbit-main/docs/trend-reports-architecture-next-week.md)
