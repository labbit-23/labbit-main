# Neosoft Cloud API - Capability Mapping Table

**Instructions for Neosoft:** Please fill in all columns for each capability. If the endpoint is the same as current, mark "Y". If different, describe the changes.

| Capability | Current Input/Output Expectation | Shivam New Endpoint | Same Contract? (Y/N) | If N, What Changes? | Notes |
|---|---|---|---|---|---|
| **Patient Report Lookup** | input `phone`, output `latest_reports[]` | | | | Returns 9+ requisitions; we display 5 most recent |
| **Latest Report Direct PDF** | input `phone`, output latest report PDF | | | | Bypass list selection, go straight to latest PDF |
| **Report Status by reqno** | input `reqno`, output test array + totals | | | | CRITICAL: Must return individual test rows |
| **Report Status by reqid** | input `reqid`, output test array + totals | | | | CRITICAL: Must return individual test rows |
| **Lab PDF** | input `reqid` (+flags), output PDF | | | | BLOCKING: Requires per-requisition test list |
| **Radiology PDF** | input `reqid` (+flags), output PDF | | | | BLOCKING: Requires DEPT_TYPE=19 filtering |
| **Combined PDF** | input `reqid` (+flags), output PDF | | | | BLOCKING: Merge lab + radiology |
| **Trend Report PDF** | input `mrno`, output PDF | | | | MISSING: Do you have iReport capability? |
| **Trend Data JSON** | input `mrno`, output JSON (table/array) | | | | MISSING: For smart/advanced rendering |
| **Requisitions by Date** | input `date`, output requisitions[] | | | | For dispatch queue; support source filtering? |
| **Delivery Status Read** | input `reqno`, output status JSON | | | | Maps to our delivery tracking |
| **Delivery Status Update** | input status payload, output ack | | | | For syncing delivery confirmations |
| **Letterhead Control** | flags to control with/without header | | | | Can we pass params to PDF endpoints? |

---

## CRITICAL FIELDS (Required in All Status/Report APIs)

| Field Name | Purpose | Example | Currently Returned? |
|---|---|---|---|
| `TESTID` or `test_id` | Unique per-test identifier | "T001", "XR01" | ? |
| `SAMEDAYREPORT` | **CRITICAL:** Can test be sent same-day? | 0 or 1 | **EMPTY in your sample** |
| `APPROVEDFLG` | Test approval status | 0 or 1 | ✅ Provided |
| `APPROVEDDT` + `APPROVEDTM` | Approval timestamp | "2026-04-08", "14:30:00" | ✅ Provided |
| `REPORT_STATUS` | Status code | "LAB_READY", "PENDING", "OUTSOURCED" | ✅ Provided |
| `GROUPID` or `DEPT_TYPE` | Lab vs Radiology | "GDEP0001" or 18 (lab), 19 (radiology) | ✅ Provided |
| `SOURCEID` / `SOURCENM` | Referrer/Doctor ID + Name | "DR001", "Dr. ABC" | ? |
| `OUTSOURCE` | Outsourced test flag | 0 or 1 | ? |
| `DEPTID` | Department code | "DPT00033" or similar | ? |

---

## What We're Asking

1. **Fill in "Shivam New Endpoint"** — What's the new cloud endpoint/webform ID?
2. **Fill in "Same Contract?"** — Does it match what we asked for?
3. **Fill in "If N, What Changes?"** — How is it different?
4. **For Critical Fields** — Confirm all are returned and populated (especially SAMEDAYREPORT)

---

## Response Format

Return this table with all columns filled. Example:

| Capability | Current Input/Output | Shivam New Endpoint | Same? | Changes |
|---|---|---|---|---|
| Patient Report Lookup | input phone, output latest_reports[] | `patient_latest` (wf5820) | Y | None, same as before |
| Lab PDF | input reqid (+flags), output PDF | `Get_test_list` (wf5834) + merge | N | Now test-wise instead of requisition-wise; requires date range (blocking issue) |

---

## Blocking Issues to Address

🚨 **These MUST be clarified before we can proceed:**

1. **Per-Requisition Filtering** — How do we fetch tests for a single reqid without knowing the date range?
2. **SAMEDAYREPORT Field** — Currently empty; when will you populate this?
3. **Trend APIs** — Do you have endpoints for trend PDF + trend data JSON?
4. **Letterhead Control** — Can we pass flags to control PDF output format?
5. **Real-Time Events** — Do you support webhooks/events for requisition/test status changes?
