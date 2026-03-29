# Trend Reports Architecture (Next-Week Rollout)

## Purpose

This document defines the implementation architecture to roll out Trend Reports v1 in the week of **March 30, 2026 to April 5, 2026**.

It is designed for:

- NEOSOFT historical trend data as source input
- deterministic rule-based clinical logic
- local LLM advisory rewriting with strict safety guardrails
- PDF report generation in a style similar to the provided Smart Report sample
- reminder and follow-up orchestration

## Rollout Target (Next Week)

By **Sunday, April 5, 2026**, v1 should support:

- ingesting NEOSOFT trend data for selected patients
- computing top 5-6 trigger groups
- generating report JSON + PDF
- sending report links and reminder nudges via existing channels
- storing full audit logs for rules and LLM output

## Recommended Stack

- App/API: existing Next.js server routes (`app/api/...`)
- Rule Engine: TypeScript rule evaluator with JSON-configured rules
- PDF Rendering: HTML/CSS templates + Playwright `page.pdf()`
- Charts: SVG-based rendering (Recharts/ECharts server render)
- Local LLM: Ollama-hosted model for advisory text rewriting
- Queue/Scheduler: cron/BullMQ-style job runner for reminders
- Persistence: existing DB + new Smart Report tables
- Delivery: existing WhatsApp/internal send flows + app links

## High-Level System Flow

1. Pull trend data from NEOSOFT APIs.
2. Normalize to internal trend schema.
3. Compute derived date fields and trend deltas.
4. Run rules engine to produce trigger decisions and recommended actions.
5. Build canonical `report_facts` payload.
6. Generate advisory narrative via local LLM (guarded), or fallback to static templates.
7. Render report JSON to HTML template.
8. Generate PDF via Playwright.
9. Persist report metadata + artifacts + audit trail.
10. Queue reminders and optional campaign nudges.

## Data Contracts

### A) Normalized Trend Input

```json
{
  "patient_id": "string",
  "neosft_patient_id": "string",
  "first_recorded_at": "2021-07-14",
  "latest_recorded_at": "2026-03-20",
  "parameters": [
    {
      "key": "hba1c",
      "display_name": "Glycosylated Hemoglobin (HbA1c)",
      "unit": "%",
      "history": [
        { "date": "2025-09-21", "value": 6.1, "ref_low": 4.0, "ref_high": 5.6 },
        { "date": "2026-03-20", "value": 6.6, "ref_low": 4.0, "ref_high": 5.6 }
      ]
    }
  ]
}
```

### B) Derived Date and Tenure Fields

```json
{
  "first_registered_date": "2021-07-14",
  "last_test_date": "2026-03-20",
  "patient_tenure_days": 1711,
  "patient_tenure_years": 4.68,
  "days_since_last_test": 10,
  "recommended_followup_date": "2026-06-20"
}
```

### C) Rule Output Contract

```json
{
  "risk_level": "high",
  "triggers": [
    {
      "key": "diabetes_high_risk",
      "severity": "high",
      "evidence": ["hba1c_upward", "fasting_glucose_high"],
      "recommended_actions": [
        "Consult physician",
        "Repeat diabetes panel in 3 months"
      ],
      "offer_code": "pkg_diabetes_monitoring"
    }
  ]
}
```

### D) Report Facts Payload (LLM Input)

```json
{
  "patient_profile": {
    "name": "REDACTED",
    "age": 49,
    "gender": "M"
  },
  "timeline": {
    "first_recorded_at": "2021-07-14",
    "last_test_at": "2026-03-20",
    "days_since_last_test": 10
  },
  "clinical_flags": ["diabetes_high_risk"],
  "allowed_recommendations": [
    "Discuss results with your doctor",
    "Retest HbA1c in 3 months",
    "Consider lifestyle optimization"
  ],
  "disclaimer_required": true
}
```

## Rule Engine Design

- Source of truth for all medical logic: `smart_report_rules` only.
- Rules are deterministic and versioned.
- Rule evaluation should produce:
  - trigger key
  - severity
  - evidence used
  - follow-up interval
  - package recommendation code
- LLM cannot alter rule decisions.

Suggested evaluator sequence:

1. Validate trend input completeness.
2. Compute windows (`3m`, `6m`, `12m`).
3. Evaluate thresholds and directional changes.
4. Resolve severity and de-duplicate related triggers.
5. Rank top triggers for report surface.

## Local LLM Layer (Guarded)

### Allowed scope

- rewrite selected facts into patient-friendly language
- summarize why follow-up is important in non-diagnostic tone

### Disallowed scope

- diagnosis
- treatment plans or medication suggestions
- certainty claims ("you have X")

### Guard Pipeline

1. Build constrained prompt from `report_facts` only.
2. Generate output from local LLM.
3. Run policy checks for banned claims/phrases.
4. If policy fail: fallback to approved static narrative template.
5. Append mandatory disclaimer.

Mandatory disclaimer (always appended):

- "This summary is AI-assisted and may be inaccurate."
- "This is not a diagnosis or treatment advice."
- "Please consult a qualified doctor for medical decisions."

## PDF Rendering Architecture

### Approach

- Build one HTML template with print CSS and section blocks.
- Use data-driven rendering of repeated sections per trigger group.
- Generate final PDF via Playwright.

### Template Sections (matching attached style)

1. Header: patient name, ID, age/gender, test date, report ID
2. Page 1 summary grid: system groups with watchout/normal tags
3. Detailed pages per group:
  - marker cards (value, range, your value pointer)
  - short interpretation
  - actions and lifestyle tips
4. Normal-parameters table per group
5. Footer with disclaimer and page numbering

### Print CSS Essentials

- A4 portrait
- strict margin and page-break rules
- repeated header/footer
- keep table rows intact across page breaks where possible

## API Surface (v1)

### `POST /api/smart-reports/generate`

Input:

```json
{
  "patient_id": "...",
  "visit_id": "...",
  "source": "neosft",
  "force_regenerate": false
}
```

Output:

```json
{
  "success": true,
  "smart_report_id": "uuid",
  "risk_level": "high",
  "pdf_url": "https://...",
  "triggers": ["diabetes_high_risk"]
}
```

### `POST /api/smart-reports/reminders/schedule`

- Schedules reminders based on trigger cadence and consent.

### `GET /api/smart-reports/:id`

- Returns report metadata, trigger summary, artifact URLs, and audit status.

## Persistence (Minimum Tables)

- `smart_report_rules`
- `smart_report_templates`
- `smart_reports`
- `smart_report_actions`
- `smart_report_reminders`
- `smart_report_audit` (facts, prompt version, model, policy result)

## Auditing and Safety Logs

For each generated report persist:

- source trend payload hash
- applied rule version and decision trace
- llm prompt version and model identifier
- llm raw output and post-policy output
- disclaimer appended status
- generated PDF checksum

## Next-Week Execution Plan (Dates)

### Monday, March 30, 2026

- finalize v1 trigger thresholds and rule JSON schema
- finalize normalized NEOSOFT mapping contract

### Tuesday, March 31, 2026

- implement trend normalization + derived dates module
- implement deterministic rule evaluator

### Wednesday, April 1, 2026

- build report JSON assembler + LLM advisory wrapper + policy guard
- add fallback templates

### Thursday, April 2, 2026

- implement HTML/CSS template and Playwright PDF generator
- validate rendering against sample style

### Friday, April 3, 2026

- wire API routes and persistence
- integrate reminder scheduler + delivery hooks

### Saturday, April 4, 2026

- dry-run with anonymized historical patients
- clinical/content review and corrections

### Sunday, April 5, 2026

- controlled go-live for limited cohort
- monitoring and rollback readiness

## Go-Live Checklist

- rules reviewed and signed off by clinical owner
- disclaimers present in 100% generated reports
- policy guard blocks unsafe LLM outputs
- fallback template path tested
- PDF layout QA on desktop/mobile PDF viewers
- reminder consent checks validated
- telemetry dashboards available for generation/delivery failures

## Risks and Controls

- Risk: LLM unsafe claims
  - Control: hard policy filters + template fallback
- Risk: report layout breakage for long parameter sets
  - Control: print CSS page-break tests on worst-case payloads
- Risk: NEOSOFT field inconsistencies
  - Control: strict normalization and missing-field defaults
- Risk: reminder spam
  - Control: suppression window + daily cap

## Immediate Build Order

1. `lib/trendReports/normalizeNeosoft.js`
2. `lib/trendReports/ruleEngine.js`
3. `lib/trendReports/buildReportFacts.js`
4. `lib/trendReports/llmAdvisory.js`
5. `lib/trendReports/renderReportHtml.js`
6. `lib/trendReports/pdf/generatePdf.js`
7. `app/api/smart-reports/generate/route.js`
8. `app/api/smart-reports/reminders/schedule/route.js`
