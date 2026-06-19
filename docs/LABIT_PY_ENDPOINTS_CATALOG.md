# labit-py API Endpoints Catalog

**Purpose:** List of all SDRC endpoints that patients and internal users call, with expected request/response formats.

**Why This Matters for Neosoft Integration:** These endpoints MUST continue to work exactly as-is after migration. They define what our bot, patients, and staff depend on.

---

## 1. Patient Lookup & Report Discovery

### `GET /lookup/{phone}`
**Purpose:** Get patient's report list (9 latest requisitions)  
**Used by:** Patient bot "Report List" screen

**Request:**
```
GET /py/lookup/9949099249
```

**Response (200 OK):**
```json
{
  "phone": "9949099249",
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
    },
    {
      "reqid": "P1600001",
      "reqno": "202602010001",
      "patient_name": "RAVI KUMAR",
      "mrno": "1444",
      "reqdt": "2026-02-01"
    }
  ]
}
```

**Bot Behavior:**
- Query returns **9 latest** requisitions
- Display **5 most recent** to patient
- Patient selects which report they want
- Then we fetch that report using `/report/{reqid}`

**Expected from Neosoft:** `patient_latest(phone)` → returns array of `{reqid, reqno, patient_name, mrno, reqdt}` (at least 9 records)

---

## 2. Report Status APIs

### `GET /report-status/{reqno}`
**Purpose:** Get report status and test-wise details by requisition number  
**Used by:** Patient bot (to show "Your report is ready", "Waiting for X tests", etc.)

**Request:**
```
GET /py/report-status/202604080123
```

**Response (200 OK):**
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
    }
  ],
  "dispatch_allowed": true,
  "dispatch_denial_code": null,
  "dispatch_denial_reason": null,
  "source_id": "DR001",
  "source_name": "Dr. ABC"
}
```

**Expected from Neosoft:** `report_status(reqno)` → returns individual test rows; labit-py computes `overall_status`, `lab_total`, `lab_ready`, etc.

---

### `GET /report-status-reqid/{reqid}`
**Purpose:** Get report status by requisition ID (alternate query)  
**Used by:** Internal workflows, dispatch engine

**Request:**
```
GET /py/report-status-reqid/P1600422
```

**Response:** Same structure as `/report-status/{reqno}` above

**Expected from Neosoft:** `report_status_by_reqid(reqid)` → same response format as by reqno

---

## 3. PDF Download APIs

### `GET /reports/{reqid}`
**Purpose:** Download lab report PDF (all lab tests for requisition, merged)  
**Used by:** Patient bot, internal dispatch users

**Request:**
```
GET /py/reports/P1600422?printtype=1&header_mode=default
```

**Query Parameters:**
- `reqno` (optional): Requisition number (for logging)
- `printtype` (optional, default="1"): 
  - `1` = All tests (default)
  - `0` = Pending tests only
- `header_mode` (optional, default="default"):
  - `default` = With letterhead/hospital header
  - `plain` = Without header background
- `chkrephead` (optional): Legacy flag for letterhead control
- `without_header_background` (optional): Legacy flag for plain mode

**Response (200 OK):**
```
Binary PDF file
Content-Type: application/pdf
Filename: lab_P1600422.pdf
```

**Response (Error 403 Forbidden):**
```json
{
  "dispatch_allowed": false,
  "code": "SOURCE_CONFIDENTIAL_DO_NOT_SEND",
  "reason": "source_confidential_do_not_send",
  "source_id": "CONFIDENTIAL_DR",
  "source_name": "Dr. Confidential"
}
```

**Expected from Neosoft:** 
- `report_status(reqno)` → get test list
- `get_test_list(reqid)` OR `get_test_list(reqno)` → get test PDF URLs
- Merge PDFs (SDRC will handle)

---

### `GET /radiologyreport/{reqid}`
**Purpose:** Download radiology report PDF (all radiology tests, merged)  
**Used by:** Patient bot, internal dispatch users

**Request:**
```
GET /py/radiologyreport/P1600422?header_mode=plain
```

**Query Parameters:** Same as `/reports/{reqid}` above

**Response (200 OK):**
```
Binary PDF file
Content-Type: application/pdf
Filename: radiology_P1600422.pdf
```

**Expected from Neosoft:** 
- Radiology tests in `get_test_list` with `DEPT_TYPE=19`
- SDRC merges them into single PDF

---

### `GET /report/{reqid}`
**Purpose:** Download combined report PDF (lab + radiology tests, merged)  
**Used by:** Patient bot, internal dispatch users

**Request:**
```
GET /py/report/P1600422?printtype=1&header_mode=default
```

**Query Parameters:** Same as `/reports/{reqid}` above

**Response (200 OK):**
```
Binary PDF file (combined lab + radiology)
Content-Type: application/pdf
Filename: combined_P1600422.pdf
```

**Expected from Neosoft:** 
- Lab tests via `get_test_list` with `DEPT_TYPE=18`
- Radiology tests via `get_test_list` with `DEPT_TYPE=19`
- SDRC merges both into single PDF

---

### `GET /latest-report/{phone}`
**Purpose:** Download patient's latest report PDF instantly (bypass "Report List" screen)  
**Used by:** Patient bot quick action (e.g., "Show me my latest report" button)

**Request:**
```
GET /py/latest-report/9949099249?header_mode=default
```

**Response (200 OK):**
```
Binary PDF file (latest combined report)
Content-Type: application/pdf
Filename: P1600422.pdf
```

**Response (No Reports):**
```json
{"error": "No reports found"}
```

**Internal Workflow:**
1. Call `/lookup/{phone}` → get 9 latest requisitions
2. Pick the **first one** (newest reqdt)
3. Call `/report/{reqid}` → get combined PDF
4. Return PDF directly to patient
5. Patient never sees the list — instant download

**Use Case:**
- Patient asks: "Just give me my latest report"
- vs. Patient asks: "Show me all my reports" → uses `/lookup/{phone}` to browse list

---

### `GET /latest-report-meta/{phone}`
**Purpose:** Get metadata about latest report (status, tests, readiness)  
**Used by:** Patient bot (to show "Your report is ready" message before downloading)

**Request:**
```
GET /py/latest-report-meta/9949099249
```

**Response (200 OK):**
```json
{
  "reqno": "202604080123",
  "reqid": "P1600422",
  "overall_status": "FULL_REPORT",
  "lab_total": 4,
  "lab_ready": 4,
  "radiology_total": 1,
  "radiology_ready": 1,
  "tests": [...],
  "dispatch_allowed": true,
  "source_id": "DR001",
  "source_name": "Dr. ABC"
}
```

---

### `GET /report-path/{reqid}`
**Purpose:** Get file path to report (internal use only)  
**Used by:** Internal logging, debugging

**Request:**
```
GET /py/report-path/P1600422
```

**Response (200 OK):**
```json
{
  "reqid": "P1600422",
  "path": "/tmp/reports/P1600422_lab.pdf"
}
```

---

## 4. Trend Reports

### `GET /trend-report/{mrno}`
**Purpose:** Download trend analysis PDF (historical lab trends)  
**Used by:** Patient bot (advanced flow: "Show me my health trends")

**Request:**
```
GET /py/trend-report/1444
```

**Response (200 OK):**
```
Binary PDF file (trend chart + analysis)
Content-Type: application/pdf
Filename: trend_1444.pdf
```

**Expected from Neosoft:** 
- Trend Report PDF endpoint (by mrno) OR
- iReport capability (like existing Shivam system)

---

### `GET /trend-data/{mrno}`
**Purpose:** Get raw trend data in JSON (for smart/advanced rendering)  
**Used by:** Patient bot (advanced flow: custom trend chart rendering)

**Request:**
```
GET /py/trend-data/1444?from_date=2025-01-01&to_date=2026-01-01
```

**Query Parameters:**
- `from_date` (optional): Filter from date (YYYY-MM-DD)
- `to_date` (optional): Filter to date (YYYY-MM-DD)

**Response (200 OK) — Row-Array Format:**
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
    "PATIENTNM": "RAVI KUMAR",
    "AGE": "49",
    "SEX": "M",
    "MOBILENO": "9949099249"
  }
]
```

**Expected from Neosoft:** 
- Trend Data JSON endpoint (by mrno, optional date range)
- Return one of 3 formats: row-array (preferred), table shape, or wrapper with data

---

## 5. Delivery & Dispatch Management (Internal)

### `GET /delivery/requisitions-by-date/{date}`
**Purpose:** Get all requisitions for a date (for dispatch queue)  
**Used by:** Internal dispatch users, batch processing

**Request:**
```
GET /py/delivery/requisitions-by-date/2026-04-09?org_id=ORG001
```

**Query Parameters:**
- `org_id` (optional): Filter by organization/source
- `org_ids` (optional): Filter by multiple org IDs (comma-separated)

**Response (200 OK):**
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

**Expected from Neosoft:** `requisitions_by_date(date, org_id)` → array of {reqno, reqid, mrno, patient_name, phoneno}

---

### `GET /delivery/status/{reqno}`
**Purpose:** Get delivery status for a requisition  
**Used by:** Dispatch team (to check "Was this report sent? When?")

**Request:**
```
GET /py/delivery/status/202604090001
```

**Response (200 OK):**
```json
{
  "reqno": "202604090001",
  "status": "S",
  "channel": "1",
  "message": "1",
  "delivery_date": "2026-05-06 17:27:03.0",
  "edituserid": "REPORTBOT"
}
```

**Expected from Neosoft:** `get_delivery_status(reqno)` → {status, channel, message, delivery_date}

---

### `POST /delivery/status/update`
**Purpose:** Update delivery status for a requisition  
**Used by:** Delivery engine (to mark "Report sent via WhatsApp on 2026-05-06 at 5:30 PM")

**Request Body:**
```json
{
  "reqno": "202604090001",
  "status": "S",
  "channel": "WHATSAPP",
  "message": "OK"
}
```

**Response (200 OK):**
```json
{
  "ok": true
}
```

**Expected from Neosoft:** `update_delivery_status(reqno, status, channel, message)` → {ok: true/false}

---

### `GET /delivery/department-worklist`
**Purpose:** Get worklist for a department/lab (internal dispatch)  
**Used by:** Department staff (to see "Which reports are ready to print?")

**Request:**
```
GET /py/delivery/department-worklist?fromreqdate=2026-04-01&toreqdate=2026-04-30&department=lab
```

**Query Parameters:**
- `fromreqdate` (optional): From date (YYYY-MM-DD)
- `toreqdate` (optional): To date (YYYY-MM-DD)
- `department` (optional): Filter by department (lab, radiology, etc.)
- `department_name` (optional): Alternative department filter

**Response (200 OK):**
```json
{
  "department": "lab",
  "date_range": {
    "from": "2026-04-01",
    "to": "2026-04-30"
  },
  "requisitions": [
    {
      "reqno": "202604010001",
      "reqid": "P1600100",
      "mrno": "100",
      "patient_name": "TEST PATIENT 1",
      "test_date": "2026-04-01",
      "status": "ready"
    }
  ]
}
```

---

### `POST /delivery/department-worklist`
**Purpose:** Get worklist with multiple filters (POST variant)  
**Used by:** Internal dispatch (complex filters)

**Request Body:**
```json
[
  {
    "fromreqdate": "2026-04-01",
    "toreqdate": "2026-04-30",
    "department": "lab"
  }
]
```

**Response (200 OK):**
```json
{
  "results": [...]
}
```

---

### `GET /dispatch-context/{reqno}`
**Purpose:** Get full context for dispatch (status + tests + source info)  
**Used by:** Dispatch engine (to make dispatch decisions)

**Request:**
```
GET /py/dispatch-context/202604090001
```

**Response (200 OK):**
```json
{
  "reqno": "202604090001",
  "reqid": "P1600550",
  "overall_status": "FULL_REPORT",
  "tests": [...],
  "dispatch_allowed": true,
  "source_id": "DR001",
  "source_name": "Dr. ABC"
}
```

---

## 6. Patient Demographics

### `GET /shivam/demographics/{mrno}`
**Purpose:** Get patient demographics (name, age, phone, email, etc.)  
**Used by:** Patient records, verification

**Request:**
```
GET /py/shivam/demographics/1444
```

**Response (200 OK):**
```json
{
  "mrno": "1444",
  "fname": "RAVI KUMAR",
  "phone": "9949099249",
  "pincode": "500001",
  "sex": "M",
  "dob": "1976-08-15",
  "age": 49,
  "email": "ravi@example.com",
  "ageyrs": 49,
  "agemonths": 0,
  "agedays": 11
}
```

**Expected from Neosoft:** `get_demographics(mrno)` → patient fields

---

### `POST /shivam/demographics` or `PUT /shivam/demographics`
**Purpose:** Update patient demographics  
**Used by:** Patient self-service updates

**Request Body:**
```json
{
  "mrno": "1444",
  "patient_name": "RAVI KUMAR",
  "mobile_no": "9949099249",
  "age": 49,
  "dob": "1976-08-15",
  "gender": "M",
  "email": "ravi@example.com",
  "pincode": "500001",
  "ageyrs": 49,
  "agemonths": 0,
  "agedays": 11
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "updated_fields": ["mobile_no", "email"]
}
```

**Expected from Neosoft:** `put_demographics(mrno, data)` → {ok: true}

---

### `GET /shivam/pricelist`
**Purpose:** Get lab test pricelist  
**Used by:** Pricing lookup, quotes

**Request:**
```
GET /py/shivam/pricelist?lab_id=LAB001
```

**Response (200 OK):**
```json
{
  "lab_id": "LAB001",
  "tests": [
    {
      "test_id": "TSH",
      "test_name": "Serum TSH",
      "price": 300,
      "unit": "INR"
    }
  ]
}
```

---

## 7. Outsourced Reports

### `GET /outsourced-report`
**Purpose:** Download outsourced/referred lab report PDF  
**Used by:** Patient bot (reports done at external labs)

**Request:**
```
GET /py/outsourced-report?reqid=P1600422&department=radiology
```

**Response (200 OK):**
```
Binary PDF file
Content-Type: application/pdf
```

---

### `GET /outsourced-report/classify`
**Purpose:** Classify if a report is from outsourced source  
**Used by:** Internal routing logic

**Request:**
```
GET /py/outsourced-report/classify?reqid=P1600422
```

**Response (200 OK):**
```json
{
  "reqid": "P1600422",
  "is_outsourced": true,
  "source": "Apollo Diagnostics",
  "classification": "radiology"
}
```

---

### `GET /outsourced-report/meta`
**Purpose:** Get metadata about outsourced report  
**Used by:** Status checking

**Request:**
```
GET /py/outsourced-report/meta?reqid=P1600422
```

**Response (200 OK):**
```json
{
  "reqid": "P1600422",
  "source": "Apollo Diagnostics",
  "received_date": "2026-04-08",
  "status": "ready"
}
```

---

### `GET /outsourced-attachment/meta`
**Purpose:** Get metadata about attachment (invoice, consent form, etc.)  
**Used by:** Document management

**Request:**
```
GET /py/outsourced-attachment/meta?reqid=P1600422&type=invoice
```

**Response (200 OK):**
```json
{
  "reqid": "P1600422",
  "type": "invoice",
  "file_name": "invoice_P1600422.pdf",
  "size_bytes": 15000
}
```

---

### `GET /outsourced-attachment`
**Purpose:** Download attachment (invoice, consent, etc.)  
**Used by:** Document retrieval

**Request:**
```
GET /py/outsourced-attachment?reqid=P1600422&type=invoice
```

**Response (200 OK):**
```
Binary PDF file
Content-Type: application/pdf
Filename: invoice_P1600422.pdf
```

---

## 8. Health & UI

### `GET /health`
**Purpose:** Health check (is service running?)  
**Used by:** Monitoring, load balancers

**Request:**
```
GET /py/health
```

**Response (200 OK):**
```json
{
  "status": "running"
}
```

---

### `GET /ui`
**Purpose:** Web UI dashboard  
**Used by:** Staff accessing via browser

**Request:**
```
GET /py/ui
```

**Response (200 OK):**
```
HTML page (dashboard/admin interface)
Content-Type: text/html
```

---

## Dispatch Policy: "Do Not Send" Sources

**Feature:** Certain sources (doctors/referrers) can be marked as confidential, blocking automatic patient report delivery.

**Configuration:**
```ini
[dispatch_policy]
do_not_send_source_ids = DR_CONFIDENTIAL, DR_SENSITIVE, PRIVATE_DR_001
```

OR via environment variable:
```bash
DO_NOT_SEND_SOURCE_IDS=DR_CONFIDENTIAL,DR_SENSITIVE,PRIVATE_DR_001
```

**Behavior:**
- When a report request comes in, labit-py checks if the source is in the deny list
- **If source is confidential:**
  - PDF endpoints return `403 Forbidden`
  - Status endpoints return `200` with `dispatch_allowed: false`
  - Report data is NOT delivered
- **If source is allowed:**
  - All endpoints return `200` with `dispatch_allowed: true`
  - Report/PDFs are delivered normally

**Endpoints That Check This:**
- `GET /reports/{reqid}` (lab PDF) → 403 if source denied
- `GET /report/{reqid}` (combined PDF) → 403 if source denied
- `GET /radiologyreport/{reqid}` (radiology PDF) → 403 if source denied
- `GET /latest-report/{phone}` (quick PDF) → 403 if source denied
- `GET /report-status/{reqno}` (status) → 200 with `dispatch_allowed: false`
- `GET /latest-report-meta/{phone}` (metadata) → 200 with `dispatch_allowed: false`
- `GET /dispatch-context/{reqno}` (dispatch data) → 200 with `dispatch_allowed: false`

**Response Example (Denied):**
```json
{
  "dispatch_allowed": false,
  "dispatch_denial_code": "SOURCE_CONFIDENTIAL_DO_NOT_SEND",
  "dispatch_denial_reason": "source_confidential_do_not_send",
  "source_id": "DR_CONFIDENTIAL",
  "source_name": "Dr. Private Case"
}
```

**Important for Neosoft Integration:**
- Neosoft APIs should return `source_id` or similar field in report status responses
- labit-py uses this to determine if dispatch is allowed
- This feature must continue working in new cloud

---

## Current Integration Approach (NOT Traditional APIs)

### How labit-py Currently Works

**Important:** labit-py does NOT call Neosoft APIs directly. Instead:

1. **Bot Login:** Our bot logs in as a user to Neosoft's system (in-memory browser automation)
2. **Navigation:** Bot navigates through Neosoft's UI sections:
   - **Dispatch section** → downloads reports (PDFs)
   - **Reports section** → downloads iReports, test data, trend data
   - **Requisition section** → gets test ID—requisition ID mappings
3. **Data Extraction:** Bot extracts PDFs, test sets, and other data as a user would
4. **Delivery:** labit-py assembles these into the 23+ endpoints listed above

### Why This Approach?
- Works with existing Neosoft UI (no special API design needed)
- Low latency (direct download, no API versioning)
- Reliable (we control the navigation flow)
- Proven in production for your old system

### For New Cloud Migration

**CRITICAL QUESTION:**
Does your new cloud system still support this **user-login/browser automation approach**?

- [ ] **YES** → Provide us the new user login mechanism for the bot to use
- [ ] **NO** → We must switch to pure APIs (see PREREQUISITE 0 in gaps document)

**If pure APIs required:** Each of the 23+ endpoints listed here must have a corresponding API that returns the exact data shown in the responses above.

---

## Summary: Required Neosoft APIs for Migration

| SDRC Endpoint | Neosoft API Required | Status |
|---|---|---|
| `/lookup/{phone}` | `patient_latest(phone)` | ✅ Provided |
| `/report-status/{reqno}` | `report_status(reqno)` | ✅ Provided |
| `/report-status-reqid/{reqid}` | `report_status_by_reqid(reqid)` | ✅ Provided |
| `/reports/{reqid}` | `get_test_list(reqid)` + merge | 🚨 **BLOCKING**: Needs reqid support |
| `/radiologyreport/{reqid}` | `get_test_list(reqid, DEPT_TYPE=19)` + merge | 🚨 **BLOCKING**: Needs reqid support |
| `/report/{reqid}` | Lab + Radiology merging | 🚨 **BLOCKING**: Needs reqid support |
| `/latest-report/{phone}` | Combo of above | 🚨 **BLOCKING**: Depends on above |
| `/trend-report/{mrno}` | `trend_report_pdf(mrno)` or iReport | ❌ Missing |
| `/trend-data/{mrno}` | `trend_data_json(mrno)` | ❌ Missing |
| `/delivery/requisitions-by-date/{date}` | `requisitions_by_date(date)` | ✅ Provided |
| `/delivery/status/{reqno}` | `get_delivery_status(reqno)` | ✅ Provided |
| `/delivery/status/update` | `update_delivery_status(reqno, ...)` | ✅ Provided |
| `/shivam/demographics/{mrno}` | `get_demographics(mrno)` | ✅ Provided |
| `/shivam/demographics` (PUT) | `put_demographics(mrno, ...)` | ✅ Provided |

---

## Key Insight

**Most of these endpoints depend on one thing: the ability to query tests by `reqid` directly.**

Without it, we can't:
- Return combined lab PDFs
- Return radiology PDFs
- Return combined PDFs
- Show report readiness to patients

This is why the **"Per-Requisition Filtering in Get_test_list"** issue is BLOCKING. Fix that, and 80% of the refactoring becomes straightforward.
