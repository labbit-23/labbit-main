# NeoSoft Cloud Upgrade: Report & Chatbot Integration Contract

Last updated: 2026-04-09

## 1) Purpose

This document defines the **API contract required from NeoSoft Cloud (new version)** so patient services continue with minimal change:

- Report list for a patient

- Report status (lab + radiology)

- Report PDF download (lab / radiology / combined)

- Internal report dispatch workflows

- Trend report PDF

- Smart/trend report data JSON

## 2) What We Need From Shivam

Please share endpoint details in this format for each capability:

1. Endpoint URL

2. HTTP method

3. Required input fields/query parameters

4. Optional input fields/query parameters

5. Success response format (`application/pdf` or JSON schema)

6. Error response format and status codes

7. Business status values (for example: report ready / patient not found / no pending report)

## 3) Mandatory Functional Capabilities

## 3.1 Patient Report Lookup (last reports list)

### Required Input

- `phone` (10-digit or standardized mobile)

### Required Output (JSON)

```
{      
  "latest_reports": [      
    {      
      "reqid": "string",      
      "reqno": "string",      
      "patient_name": "string",      
      "mrno": "string",      
      "reqdt": "YYYY-MM-DD or datetime"      
    }      
  ]      
}
```

### Required Error/Feedback

- `PATIENT_NOT_FOUND` (or empty `latest_reports`)

- `INVALID_PHONE`

- `UPSTREAM_ERROR`

## 3.1B Latest Report by Phone (Direct PDF - Recommended)

To keep migration low-code, please provide a direct latest-report document endpoint by phone.

### Required Input

- `phone`

### Required Output

- Success: `application/pdf` (latest combined report)

### Required Error/Feedback

- `PATIENT_NOT_FOUND`

- `LATEST_REPORT_NOT_AVAILABLE`

- `UPSTREAM_ERROR`

## 3.2 Report Status by Requisition

### Required Input

- By reqno: `reqno`

- By reqid: `reqid`

### Required Output (JSON)

```
{      
  "reqno": "string",      
  "reqid": "string",      
  "overall_status": "FULL_REPORT | PARTIAL_REPORT | NO_REPORT | NO_LAB_TESTS",      
  "lab_total": 0,      
  "lab_ready": 0,      
  "radiology_total": 0,      
  "radiology_ready": 0,      
  "patient_name": "string",      
  "mrno": "string",      
  "patient_phone": "string",      
  "test_date": "string",      
  "tests": [      
    {      
      "test_id": "string",      
      "test_name": "string",      
      "group_id": "GDEP0001|GDEP0002|...",      
      "department": "lab|radiology|other",      
      "approved_flag": "0|1",      
      "report_status": "LAB_READY|RADIOLOGY_READY|PENDING|...",      
      "ready": true      
    }      
  ]      
}
```

Test-level expectation (mandatory):

- Even when `overall_status` is `FULL_REPORT` or `PARTIAL_REPORT`, API must return **test-wise rows** in `tests[]`.

- `PARTIAL_REPORT` must allow us to identify which tests are ready vs pending from test-level fields.

- Stable identifiers per test are required (`test_id` preferred; `test_name` fallback).

### Required Error/Feedback

- `REQ_NOT_FOUND`

- `INVALID_REQNO_OR_REQID`

- `UPSTREAM_ERROR`

## 3.3 Lab Report PDF

### Required Input

- `reqid` (required)

- `reqno` (optional but recommended)

- `printtype` (`1` normal, `0` pending-only dispatch mode)

- letterhead flags (see Section 4)

### Required Output

- Success: `application/pdf`

- Failure: JSON error with code/message

### Required Error/Feedback

- `NO_PENDING_REPORTS` (especially for `printtype=0`)

- `LAB_REPORT_NOT_AVAILABLE`

- `PENDING_REPORT_NOT_AVAILABLE`

- `REQ_NOT_FOUND`

## 3.4 Radiology Report PDF

### Required Input

- `reqid` (required)

- letterhead flags (see Section 4)

### Required Output

- Success: `application/pdf` (single or merged radiology document)

- Failure: JSON error with code/message

### Required Error/Feedback

- `NO_RADIOLOGY_TESTS`

- `RADIOLOGY_REPORT_NOT_READY`

- `REQ_NOT_FOUND`

## 3.5 Combined Report PDF (Lab + Radiology)

### Required Input

- `reqid` (required)

- `reqno` (optional)

- `printtype` (`1` or `0`)

- letterhead flags (see Section 4)

### Required Output

- Success: `application/pdf`

- Behavior expectation:

  - return combined PDF if both available

  - return available side if only one side exists

- Failure: JSON error with code/message

### Required Error/Feedback

- `NO_REPORTS_AVAILABLE`

- `REQ_NOT_FOUND`

## 3.6 Trend Report PDF

### Required Input

- `mrno`

### Required Output

- Success: `application/pdf`

### Required Error/Feedback

- `MRNO_NOT_FOUND`

- `TREND_REPORT_NOT_AVAILABLE`

## 3.7 Trend Data JSON (for advanced/smart rendering)

### Required Input

- `mrno`

- Optional:
  - `from_date` / `to_date` (if supported)
  - any source-side filters supported by NeoSoft Cloud

### Required Output (JSON)

Important: We do **not** require NeoSoft to return our internal `standardized` structure.  
We only need raw trend data in one of these accepted JSON shapes:

1. `table` shape

```json
{
  "table": {
    "columns": [{ "name": "COMPID" }, { "name": "TESTCOMPONENT" }, { "name": "REQDT" }, { "name": "RESULTVALUE" }],
    "rows": [{ "values": ["...", "...", "...", "..."] }]
  }
}
```

2. Row-array shape

```json
[
  {
    "COMPID": "string",
    "TESTCOMPONENT": "string",
    "UNITS": "string",
    "REQDT": "YYYY-MM-DD or datetime",
    "RESULTVALUE": "number|string",
    "MINVAL": "number|string|null",
    "MAXVAL": "number|string|null",
    "LETTYPE": "string|null",
    "PSYNTAX": "string|null",
    "PATIENTNM": "string|null",
    "AGE": "string|number|null",
    "SEX": "string|null",
    "MOBILENO": "string|null"
  }
]
```

3. Wrapper shape with raw data under `data`

```json
{
  "mrno": "string",
  "row_count": 12,
  "data": { "table": { "columns": [], "rows": [] } }
}
```

Minimum row fields expected for reliable smart/trend rendering:

- `TESTCOMPONENT` (or equivalent test/parameter name)
- `REQDT` (test date)
- `RESULTVALUE` (result value)
- reference range fields when available (`MINVAL`, `MAXVAL`)
- unit when available (`UNITS`)

### Required Error/Feedback

- `NO_TREND_DATA`

- `MRNO_NOT_FOUND`

- `UPSTREAM_ERROR`

## 3.8 Delivery/Dispatch Status APIs (internal users)

### A) Requisitions by Date

Input: `date`  
Output JSON:

```
{      
  "date": "YYYY-MM-DD",      
  "requisitions": [      
    {      
      "reqno": "string",      
      "reqid": "string",      
      "mrno": "string",      
      "patient_name": "string",      
      "phoneno": "string"      
    }      
  ]      
}
```

### B) Delivery Status by reqno

Input: `reqno`  
Output JSON:

```
{      
  "reqno": "string",      
  "status": "string",      
  "channel": "string",      
  "message": "string",      
  "delivery_date": "string"      
}
```

### C) Delivery Status Update

Input JSON:

```
{      
  "reqno": "string",      
  "status": "string",      
  "channel": "WHATSAPP|SMS|EMAIL|...",      
  "message": "OK|PARTIAL REPORT|DOWNLOAD FAILED|..."      
}
```

Output JSON:

```
{      
  "ok": true      
}
```

Required feedback:

- `REQ_NOT_FOUND`

- `INVALID_STATUS_PAYLOAD`

- `UPDATE_FAILED`

## 4) Letterhead / Without Letterhead Contract (Mandatory)

New cloud must support both outputs for report PDFs:

1. **With letterhead**

2. **Without letterhead**

Accepted controls should include at least one of:

- `header_mode=default|plain`

- `chkrephead=1|0`

- `without_header_background=true|false`

If new cloud uses different parameter names, please provide exact mapping.

## 5) Required Business Status/Feedback Matrix

Please confirm exact values/messages for these conditions:

1. Patient not found for phone lookup

2. Requisition not found

3. Report not ready yet

4. Partial report ready

5. Full report ready

6. No lab tests in requisition

7. No radiology tests in requisition

8. No pending report in pending-print mode

9. Trend data unavailable

10. Trend PDF unavailable

Each should return:

- stable `error_code` (machine-readable)

- `message` (human-readable)

- suitable HTTP status code

## 6) Minimal-Change Switchover Requirement

For smooth migration, Shivam Cloud should provide equivalent capabilities for:

1. patient report list

2. latest report direct PDF by phone (recommended)

3. report status

4. lab/radiology/combined PDF

5. trend PDF + trend data JSON

6. delivery status read/update

7. requisitions by date

8. letterhead and plain output options

If any capability cannot be matched exactly, please mark:

- not supported

- partially supported

- supported with parameter changes

and share the exact alternative contract.

## 7) Suggested UAT Test Cases

1. Lookup with valid phone -> returns recent requisitions.

2. Lookup with invalid phone -> deterministic `PATIENT_NOT_FOUND` response.

3. Status by reqno where all tests ready -> `FULL_REPORT`.

4. Status by reqno where some tests pending -> `PARTIAL_REPORT`.

5. Lab PDF with letterhead and plain mode both return valid PDFs.

6. Radiology PDF with letterhead and plain mode both return valid PDFs.

7. Combined PDF returns merged/available report correctly.

8. Pending-print mode returns clear `NO_PENDING_REPORTS` when none.

9. Trend PDF by MRNO returns valid PDF.

10. Trend data by MRNO returns JSON in one accepted raw shape (`table`, row-array, or wrapper with `data`).

## 8) Demo Bot Flow (Where Each API Is Used)

This section is only to show usage sequence, so Shivam can suggest equivalent/alternative APIs if needed.

### Flow A: Patient asks for latest report

1. Bot receives patient phone.

2. Call patient lookup API (`phone`) to fetch latest requisitions.

3. Pick latest `reqid/reqno`.

4. Call report status API to build status message (full/partial + test-wise pending).

5. Call combined report PDF API (`reqid`, optional `reqno`, letterhead/plain choice).

6. Send PDF to patient.

### Flow B: Patient selects older report from list

1. Bot shows list from lookup API.

2. Patient selects one requisition.

3. Call combined report PDF API for selected `reqid`.

4. If needed, call status API for selected `reqno` and share readiness details.

### Flow C: Patient asks for trend report

1. Bot obtains `mrno` from latest lookup/status.

2. Call trend report PDF API (`mrno`) and send PDF.

3. Smart mode: call trend data JSON API (`mrno`) and render advanced report output.

### Flow D: Internal user dispatch/print flow ***(Used for Report Dispatch and collection centre logins)***

1. Internal user picks date -> call requisitions-by-date API.

2. For selected requisition, call status API (`reqno/reqid`) to get:

   - overall readiness

   - test-wise readiness

3. Print normal (`printtype=1`) or pending-only (`printtype=0`) PDF.

4. Update delivery status via delivery update API with channel/message.

## 9) Alternative Endpoint Mapping Sheet (to be filled by Shivam)

Please fill this table for minimal-code replacement planning.

| Capability | Current Input/Output Expectation | Shivam New Endpoint | Same Contract? (Y/N) | If N, What Changes? |
| - | - | - | - | - |
| Patient report lookup | input `phone`, output `latest_reports[]` |  |  |  |
| Latest report direct PDF | input `phone`, output latest report PDF |  |  |  |
| Report status by reqno | input `reqno`, output totals + `tests[]` |  |  |  |
| Report status by reqid | input `reqid`, output totals + `tests[]` |  |  |  |
| Lab PDF | input `reqid` (+flags), output PDF |  |  |  |
| Radiology PDF | input `reqid` (+flags), output PDF |  |  |  |
| Combined PDF | input `reqid` (+flags), output PDF |  |  |  |
| Trend PDF | input `mrno`, output PDF |  |  |  |
| Trend data JSON | input `mrno`, output JSON schema |  |  |  |
| Requisitions by date | input `date`, output requisitions[] |  |  |  |
| Delivery status read | input `reqno`, output status JSON |  |  |  |
| Delivery status update | input status payload, output ack |  |  |  |
| Letterhead/plain control | flags + expected behavior |  |  |  |


## 10) Bot Simulator & Pre-Go-Live Validation

Before production rollout, we will run these APIs through our **bot simulator** to validate full patient and internal-user journeys end-to-end.

Shivam team is requested to provide:

1. UAT/base URL endpoints for all capabilities in this document.

2. Test credentials/authorization method (if any).

3. At least 3 test datasets:

   - one `FULL_REPORT` case

   - one `PARTIAL_REPORT` case with test-wise pending rows

   - one trend-enabled patient (`mrno`) with trend PDF + trend JSON

4. Confirmed error samples for:

   - patient not found

   - requisition not found

   - report not ready / no pending report

   - trend not available

5. Rate limits/timeouts expected on UAT and production.

Go-live readiness expectation:

- All demo bot flows in Section 8 must pass in simulator against Shivam UAT.

- Letterhead and plain PDF outputs must be validated in simulator before cutover.

- Error/status mapping must be stable so bot/user messaging remains unchanged.

Scope clarification:

- This contract covers all report-related bot flows and internal dispatch flows.

- Non-report bot modules (for example booking/location/package flows) are outside this NeoSoft report API contract.

## 11) Other Integrations (Planned Soon)

These are additional upcoming integrations we WILL implement shortly. Please confirm feasibility and DB/API support now so we avoid future endpoint changes.

### 11.1 Endpoint Contract Status

- The APIs and behaviors listed in this document are currently implemented and in use.

- If any additional/new APIs are required, they will be notified during implementation and acceptance testing (UAT) phase with complete input/output/error mapping.

### 11.2 Collection Centre Login (Logistics Dashboard) by Source Name

Requirement:

- Collection-centre/logistics users should see report/requisition data scoped to their source.

- We need source-level filtering support so records can be fetched by source context.

Requested fields/capabilities:

1. Source identity fields in report/requisition/status responses:

   - `source_name` (mandatory)

   - `source_code` (recommended)

   - `collection_centre_id` or equivalent (recommended)

2. Filter support in relevant APIs:

   - `source_name` (mandatory filter)

   - `source_code` (optional filter)

   - date + source combined filters for dispatch queues

3. Consistent source mapping:

   - same source identifiers across lookup, requisitions-by-date, status, and dispatch-related APIs.

### 11.3 Template-Driven Delivery + QR/Artifact Metadata (Future-ready)

Since the new cloud version supports template-based delivery and QR workflows, please provide or confirm:

1. Delivery metadata in response payloads (where applicable):

   - `template_name`

   - `delivery_source`

   - `public_url`

   - `message_id`

   - `sent_at`

2. QR/document metadata support:

   - `qr_applied` (true/false)

   - `artifact_url` (final delivered file URL)

   - `artifact_version` or equivalent

### 11.4 Delivery Event/Callback Support (Optional but Preferred)

If available, share callback/event endpoint spec for final delivery outcomes:

- success/failure event payload

- requisition identifiers (`reqno`, `reqid`, `mrno`)

- final status code/message

- delivered file metadata (`public_url`, `message_id`, timestamp)

This helps us keep delivery status and internal dashboards synchronized without polling-only logic.

## 12) No Future DB Access Assumption

We are planning under the assumption that we will **not have direct DB access** in future.

Therefore, all required data must be available via stable APIs, including:

1. Patient/report lookup and identifiers (`reqid`, `reqno`, `mrno`, phone).

2. Full report status including test-wise rows and readiness flags.

3. Source-level attributes (`source_name`, source identifiers) for logistics dashboards.

4. Delivery/dispatch state read + update APIs.

5. Trend data and trend report artifact APIs.

6. Delivery metadata (`message_id`, `public_url`, timestamps, template/source info) where applicable.

API-only operating requirement:

- No implementation should depend on direct table reads/writes in NeoSoft DB.
- Any field currently expected from DB must be explicitly exposed in API response schemas.
- Backward-compatible API versioning/deprecation notice is required before changes.

## 13) Sample Data (Reference for UAT)

Use these as example payloads for endpoint testing and contract alignment.

### 13.1 Patient Lookup Sample Response

```json
{
  "latest_reports": [
    {
      "reqid": "P1600422",
      "reqno": "202604080123",
      "patient_name": "RAVI KUMAR",
      "mrno": "1444",
      "reqdt": "2026-04-08"
    },
    {
      "reqid": "P1600117",
      "reqno": "202603150011",
      "patient_name": "RAVI KUMAR",
      "mrno": "1444",
      "reqdt": "2026-03-15"
    }
  ]
}
```

### 13.2 Report Status Sample Response (`PARTIAL_REPORT`)

```json
{
  "reqno": "202604080123",
  "reqid": "P1600422",
  "overall_status": "PARTIAL_REPORT",
  "lab_total": 4,
  "lab_ready": 2,
  "radiology_total": 1,
  "radiology_ready": 0,
  "patient_name": "RAVI KUMAR",
  "mrno": "1444",
  "patient_phone": "9949099249",
  "test_date": "2026-04-08",
  "tests": [
    {
      "test_id": "T001",
      "test_name": "HbA1c",
      "group_id": "GDEP0001",
      "department": "lab",
      "approved_flag": "1",
      "report_status": "LAB_READY",
      "ready": true
    },
    {
      "test_id": "T002",
      "test_name": "Fasting Glucose",
      "group_id": "GDEP0001",
      "department": "lab",
      "approved_flag": "0",
      "report_status": "PENDING",
      "ready": false
    },
    {
      "test_id": "XR01",
      "test_name": "Chest X-Ray",
      "group_id": "GDEP0002",
      "department": "radiology",
      "approved_flag": "0",
      "report_status": "PENDING",
      "ready": false
    }
  ]
}
```

### 13.3 Requisitions-by-Date Sample Response

```json
{
  "date": "2026-04-09",
  "requisitions": [
    {
      "reqno": "202604090001",
      "reqid": "P1600550",
      "mrno": "1882",
      "patient_name": "ANJALI REDDY",
      "phoneno": "9988776655"
    },
    {
      "reqno": "202604090002",
      "reqid": "P1600551",
      "mrno": "1883",
      "patient_name": "SATISH RAO",
      "phoneno": "9123456780"
    }
  ]
}
```

### 13.4 Delivery Status Update Sample Request/Response

Request:

```json
{
  "reqno": "202604090001",
  "status": "S",
  "channel": "WHATSAPP",
  "message": "OK"
}
```

Response:

```json
{
  "ok": true
}
```

### 13.5 Report PDF Call Samples

With letterhead:

```http
GET /report/{reqid}?reqno={reqno}&printtype=1&header_mode=default&chkrephead=1
```

Without letterhead:

```http
GET /report/{reqid}?reqno={reqno}&printtype=1&header_mode=plain&chkrephead=0&without_header_background=true
```

Pending-only print mode:

```http
GET /reports/{reqid}?reqno={reqno}&printtype=0&header_mode=plain&chkrephead=0
```

### 13.6 Trend Data Sample (`table` shape)

```json
{
  "table": {
    "columns": [
      { "name": "COMPID" },
      { "name": "TESTCOMPONENT" },
      { "name": "UNITS" },
      { "name": "REQDT" },
      { "name": "RESULTVALUE" },
      { "name": "MINVAL" },
      { "name": "MAXVAL" }
    ],
    "rows": [
      { "values": ["C001", "HbA1c", "%", "2025-12-01", "6.8", "4.0", "5.6"] },
      { "values": ["C001", "HbA1c", "%", "2026-03-20", "7.1", "4.0", "5.6"] }
    ]
  }
}
```

### 13.7 Trend Data Sample (row-array shape)

```json
[
  {
    "COMPID": "C001",
    "TESTCOMPONENT": "HbA1c",
    "UNITS": "%",
    "REQDT": "2025-12-01",
    "RESULTVALUE": "6.8",
    "MINVAL": "4.0",
    "MAXVAL": "5.6",
    "LETTYPE": "H",
    "PSYNTAX": "1",
    "PATIENTNM": "RAVI KUMAR",
    "AGE": "49",
    "SEX": "M",
    "MOBILENO": "9949099249"
  },
  {
    "COMPID": "C001",
    "TESTCOMPONENT": "HbA1c",
    "UNITS": "%",
    "REQDT": "2026-03-20",
    "RESULTVALUE": "7.1",
    "MINVAL": "4.0",
    "MAXVAL": "5.6",
    "LETTYPE": "H",
    "PSYNTAX": "1",
    "PATIENTNM": "RAVI KUMAR",
    "AGE": "49",
    "SEX": "M",
    "MOBILENO": "9949099249"
  }
]
```
