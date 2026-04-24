# Security + Tenancy To-Do (Deferred Until Product Freeze)

## Status
- Decision: defer hardening implementation until feature freeze.
- Target: resume immediately after freeze with dedicated sprint.

## Current Risk Snapshot
- Estimated risk: 7/10 (inference, not external pentest).
- Main risks:
  - Inconsistent API auth/permission coverage.
  - Service-role usage in many routes.
  - Partial tenant enforcement.
  - RLS not yet fully rolled out.

## Table Classification

### Global (no `lab_id` needed)
- `labs`
- `visit_statuses`
- `visit_time_slots`
- `global_tests`
- `global_test_aliases`
- `stg_lab_tests_raw` (if staging-only)
- `stg_loinc_raw` (if staging-only)

### Tenant-scoped (add/use `lab_id` + enforce)
- `campaigns`
- `campaign_recipients`
- `campaign_short_links`
- `campaign_short_link_clicks`
- `quickbookings`
- `report_master` (or explicitly global with strict role guard)
- `report_run_log`
- `results`
- `visit_activity_log`
- `visit_details`
- `users` (if lab-scoped users)

### Tenant-scoped via parent relation (policy-by-join)
- `sample_pickups` (through `collection_centre.lab_id`)
- `executives_collection_centres` (through centre + membership)
- `patients`, `patient_addresses` (through visits/external keys/patient-lab map)

### System/global but sensitive
- `otp_codes` (strict API guard + rate limit required)

## Deferred Work Plan (Post-Freeze)

### P0 (first)
- Central API guard baseline: session + permission + lab-scope.
- Patch unguarded browser-facing routes.
- Remove direct browser reads for tenant-sensitive data.
- Ensure service-role routes enforce lab scope in code.

### P1
- Finish `lab_id` backfill and constraints for tenant tables.
- RLS phase 1: monitoring + WhatsApp operational tables.
- RLS phase 2: visits/patients/quickbookings and related tables.

### P2
- Observability, policy audit suite, rollout automation.
- Optional auth-model improvements (Supabase auth bridge or full migration).

## Definition of "Secure Enough to Go Live"
A table is considered tenant-secure only when all are true:
1. Correct tenant key model exists (`lab_id` or validated parent path).
2. RLS enabled.
3. Policies cover read + write paths correctly.
4. Browser never uses service-role.
5. Server endpoints enforce lab access deterministically.
6. Negative tests confirm cross-lab denial.

## Freeze Notes
- No security-schema migrations during active feature sprint.
- Keep collecting route inventory + gaps only (no behavioral changes).
- Cut a dedicated hardening branch after freeze.
