# NeoSoft Cloud API - Gaps & Clarifications Required

**From:** SDRC  
**Re:** Upgrade Readiness - Endpoint Coverage Analysis  
**Date:** 2026-06-06

---

## Executive Summary

We've mapped your provided APIs (wf5820–wf5836) against our agreed contract (neosoft-cloud-report-integration-contract.md).

**Bottom Line:**
- ✅ Most of your APIs map well to our contract
- 🚨 **ONE BLOCKING ISSUE:** Per-requisition filtering in `Get_test_list` (blocks lab/radiology/combined PDFs)
- ❌ **TWO TRUE GAPS:** Trend Report PDF + Trend Data JSON endpoints missing
- ✅ **SIX CLARIFICATIONS** needed (including bot/API choice, iReports, WhatsApp sender, etc.)

**SDRC will handle:** All PDF merging, test-wise PDF iterations, delivery tracking via Supabase

**We need from you:** Fix the core issue + clarify the gaps + confirm you support our bot/user-login approach (or provide all required APIs if pure-API only)

---

## PREREQUISITE 0: Required Data Fields (CRITICAL for labit-py)

**These fields MUST be returned in your APIs, or labit-py cannot work:**

### Report Status APIs (Req_status, Req_status_by_reqid)
**Essential Fields:**
- [ ] `TESTID` / `testid` — Unique test identifier (required for enqueue + PDF selection)
- [ ] `TESTNM` / `testnm` — Test name (for patient messaging)
- [ ] `REPORT_STATUS` / `report_status` — Status per test (LAB_READY, RADIOLOGY_READY, PENDING, OUTSOURCED)
- [ ] `APPROVEDFLG` / `approvedflg` — Is test approved? (0/1, required for dispatch logic)
- [ ] `APPROVEDDT` / `approveddt` — Approval date (required for enqueue timing)
- [ ] `APPROVEDTM` / `approvedtm` — Approval time (required for enqueue timing)
- [ ] `GROUPID` / `groupid` — Department group (GDEP0001=lab, GDEP0002=radiology, required for PDF merging)
- [ ] `DEPTID` / `deptid` — Department ID (needed for outsourced vs in-house detection)
- [ ] `SOURCEID` / `sourceid` or `REFDOCTOR` — Referrer/Doctor ID (required for dispatch policy)
- [ ] `SOURCENM` / `sourcenm` or `DRNAME` — Referrer name (required for audit trail)

**CRITICAL MISSING FIELD:**
- [ ] `SAMEDAYREPORT` — **EMPTY in your Excel sample** — Is test eligible for same-day delivery?
  - **Why it matters:** labit-py enqueue system uses this to decide whether to send immediately or hold
  - **Without this field:** All tests get held indefinitely (defeats automation)
  - **Current problem:** You return this field but it's always empty
  - **Action needed:** Populate this with 0 (apply cool-off hold) or 1 (send same-day)
  - **Detailed explanation:** See [NEOSOFT_INTEGRATION_ENQUEUE_LOGIC.md](NEOSOFT_INTEGRATION_ENQUEUE_LOGIC.md) for full context on how this field drives automated delivery

**Optional but Important:**
- [ ] `OUTSOURCE` / `outsource` — Is this an outsourced test? (0/1)
- [ ] Test-specific flags for pending transcription, QR codes, attachments

### Patient Lookup API (patient_latest)
**Must Return:**
- [ ] `reqid` — Requisition ID (primary lookup for all subsequent calls)
- [ ] `reqno` — Requisition number (alternate lookup, user-friendly)
- [ ] `patient_name`
- [ ] `mrno` — Medical record number
- [ ] `reqdt` — Requisition date (so we can sort/display newest first)

### Requisitions by Date API (Requisitions_by_date)
**Must Return:**
- [ ] `reqno` / `reqid`
- [ ] `mrno`
- [ ] `patient_name`
- [ ] `phoneno` / `mobileno` (for WhatsApp delivery)
- [ ] `source_id` / `source_name` (for dispatch policy)

---

## PREREQUISITE 1: Integration Approach (CRITICAL)

**Current Approach (Old Neosoft System):**
- Our bot logs in as a user to your system (in-memory browser automation)
- Bot navigates to Dispatch section → downloads reports as a user would
- Bot navigates to Reports section → downloads iReports, test data, etc.
- Bot assembles test ID—requisition ID sets, manages downloads

**Question for New Cloud:**
- [ ] Can we still use the **same user login approach** with your new cloud system?
  - If YES: Provide us the new user login mechanism (URL, credential method, UI changes)
  - If NO: We must switch to **pure API approach** (see below)

**IF You Require Pure API Approach:**
If you want us to abandon the bot/user-login approach and use **only APIs**, then:
- [ ] **EVERY endpoint we listed in `LABIT_PY_ENDPOINTS_CATALOG.md` must be available as an API**
- [ ] Specifically: Each API must return **the exact PDFs** we need for each patient request
- [ ] Example: `GET /test-list?reqid=ABC123` must return test PDFs directly, not date-range results

**Why This Matters:**
- User-login approach is proven, stable, low-latency
- Pure API approach requires you to expose every data access as an endpoint
- Hybrid approach (some APIs, some user-login) is NOT feasible — we need one consistent method

**Our Strong Preference:**
We prefer the **user-login/bot approach** (as you have now) because:
1. Simpler integration (no per-endpoint API design required)
2. More reliable (we control the flow, not dependent on API design)
3. Faster (direct access to reports without API versioning concerns)

**Decision Needed Before Migration:**
- [ ] Will new cloud support the same user-login/bot approach?
- [ ] Or do you require pure API-only integration?

Choose one, because the implementation path is completely different.


---

## Critical Gaps (Must Address)

### **🚨 CORE ISSUE: Per-Requisition Query Capability**

**Problem:** Your `Get_test_list` endpoint requires `FROMDATE`, `TODATE`, and `SERVICETYPE` — these are date-range filters, NOT per-requisition filters.

**Why This Breaks Our Workflow:**
```
Patient calls: "I want my latest report"
  1. GET /lookup/{phone} → returns [reqid1, reqid2, reqid3]
  2. Patient selects reqid1
  3. We need to fetch tests for reqid1 ONLY
  4. But Get_test_list requires FROMDATE + TODATE (we don't have these!)
  5. We'd have to guess date ranges and make multiple calls
     → INEFFICIENT, FRAGILE, UNRELIABLE
```

**Contract Requirement:** All APIs must support **direct lookup by `reqid` or `reqno`** (Section 3.2 of contract).

**ACTION REQUIRED (BLOCKING ALL OTHER GAPS):**
- [ ] **Can `Get_test_list` accept `reqid` or `reqno` as a primary filter?**
  - Example: `GET /test-list?reqid=AB3934326&GROUPHSPTLID=GH000095`
- [ ] **OR provide a dedicated endpoint:** `GET /tests-by-requisition?reqid={reqid}&GROUPHSPTLID={GROUPHSPTLID}`
- [ ] If not: How are we supposed to fetch tests for a specific requisition without knowing the date?

This is **NOT optional** — it's fundamental to the API contract. The date-range design doesn't support per-requisition queries.

---

### Gap 1: Lab Report PDF by Requisition
**Current Requirement:** Fetch all lab tests for a specific `reqid` (not a date range)  
**What You Provided:** `Get_test_list (wf5834)` with date-range filtering  
**Status:** ⏸️ **BLOCKED by Core Issue above**
- Once you fix the core issue (reqid filtering), we'll:
  - Call the fixed Get_test_list with `reqid` filter
  - Fetch individual lab test PDFs (DEPT_TYPE=18)
  - Merge them server-side
  - Return combined PDF
- **Note:** We accept test-wise PDFs (not requisition-wise) — this is the only expected drift

---

### Gap 2: Combined Report PDF (Lab + Radiology)
**Current Requirement:** Fetch all lab + radiology tests for a specific `reqid` and merge into one PDF  
**What You Provided:** Single `Get_test_list` endpoint (with date-range filtering)  
**Status:** ✅ **NOT A GAP** — Same as lab/radiology separately
- Lab tests: `Get_test_list` with `DEPT_TYPE=18`
- Radiology tests: `Get_test_list` with `DEPT_TYPE=19`
- Merge both into single PDF
- **No additional endpoint needed** — just fix the reqid filtering (see Core Issue above)

---

### Gap 3: Trend Report PDF
**Current Requirement:** `GET /trend-report/{mrno}` → returns trend analysis PDF  
**What You Provided:** Not found in Excel  
**Clarification Needed:**
- [ ] In your existing Shivam system, trend reports are available as **iReports**. Does your new cloud version support iReports?
- [ ] If yes: What is the API endpoint to fetch iReports by `mrno`?
- [ ] If no: Can you create an iReport in the new system, similar to existing setup?
- We currently fetch iReports using the same mechanism as your old system — we can adapt to the new endpoint.

---

### Gap 4: Trend Data JSON (for Smart Rendering)
**Current Requirement:** `GET /trend-data/{mrno}` → returns raw trend data in one of 3 JSON shapes (table, row-array, or wrapper)  
**What You Provided:** Not found in Excel  
**Issue:** No endpoint for trend data.
- **Action Needed:** Provide Trend Data JSON endpoint (by mrno, optional date range filters)
- Please return one of these formats:
  ```json
  // Option 1: Row-array (preferred)
  [
    { "TESTCOMPONENT": "HbA1c", "REQDT": "2026-03-20", "RESULTVALUE": "7.1", "MINVAL": "4.0", "MAXVAL": "5.6" }
  ]
  
  // Option 2: Table shape
  { "table": { "columns": [...], "rows": [...] } }
  ```

---

## High-Priority Clarifications

### 1. Letterhead / Plain Mode Control
**Current Requirement:** PDFs should support both letterhead and plain (no header) versions  
**What You Provided:** Pre-generated PDFs in Get_test_list (no control flags shown)  
**Clarification Needed:**
- [ ] Can we control letterhead via query params when downloading from LoadReports endpoint?
  - E.g., `GET /LoadReports/{pdf_id}?header_mode=plain` ?
- [ ] OR are PDFs pre-generated in one format only?
- If not: Can you generate both versions and provide both URLs in the response?

---

### 2. Get_test_list - Filtering by Requisition
**Current API:** Requires `FROMDATE`, `TODATE`, `SERVICETYPE`  
**Our Need:** Fetch **all tests for a single requisition** (not date range)  
**Clarification Needed:**
- [ ] Can Get_test_list accept `reqid` or `reqno` instead of date range?
- [ ] OR should we call Req_status (wf5824) to get the test list, then fetch PDFs separately?
- If test-wise PDFs are the only option: please confirm the recommended workflow

---

### 3. Delivery Status Update & WhatsApp Sender Integration
**Current API:** Update_delivery_status (wf5828) expects `status`, `channel`, `message`  
**Sample From Excel:** `"status": "S", "channel": 1, "message": 1`  
**Clarification Needed:**
- [ ] Are these fields specifically for your **automated WhatsApp Sender** (which we know exists in your current system)?
- [ ] Does your new cloud version have a scalable, built-in WhatsApp Sender we can use directly?
- [ ] If yes: What are the APIs to integrate with it (send message, get delivery status, retry failed messages)?
- **Why:** If your WhatsApp sender is production-ready, we may not need to build our own enqueue/retry logic
- Otherwise: Please provide field format reference (data types, valid values for status/channel/message)

---

### 4. Source Filtering (Multi-Tenant)
**Current Requirement:** Support filtering by source/collection centre for internal dispatch workflows  
**What You Provided:** `department_list` takes `SOCID`; `Requisitions_by_date` doesn't show source params  
**Clarification Needed:**
- [ ] Does Requisitions_by_date (wf5826) support filtering by `SOCID` or source name?
- [ ] Can Req_status (wf5824) return source information so we can filter/scope results?
- [ ] Should we use SOCID or is there a source_name/source_id equivalent?

---

### 5. Report Status API - Response Structure
**Current APIs:** Req_status (wf5824) and Req_status_reqid (wf5825)  
**Important Clarification:**
- [ ] Your response returns **individual test rows** (flat array), NOT a nested structure, correct?
  - E.g., one API call returns multiple rows, each representing one test
- [ ] SDRC will compute `overall_status` (FULL_REPORT, PARTIAL_REPORT, NO_REPORT) and per-test `report_status` fields on our side
  - We do NOT expect this structure from your API
- [ ] Please provide a **complete sample response** showing all fields for a requisition with multiple tests (lab + radiology)

---

### 6. Patient Lookup - Latest Reports Structure
**Current API:** patient_latest (wf5820)  
**Our Expectation:** Returns `latest_reports[]` array with fields: `reqid`, `reqno`, `patient_name`, `mrno`, `reqdt`  
**Clarification Needed:**
- [ ] Does the response match the structure? Please provide full sample response
- [ ] Is it a single "latest" or an array of recent reports?
- [ ] Confirm field names match our contract (Section 3.1B)

---

## Medium-Priority Items

### 1. Pending-Only Print Mode
- We currently support `printtype=0` (print pending tests only)
- Does your new PDF/test endpoint support pending-only filtering?
- **If not:** We'll filter on our side

### 2. Department Worklist by Date
- Old API: fetch by date range + department
- New API: `department_list` takes `SOCID` (source)
- Should we use a different endpoint or adjust our query?

---

## Summary: Gaps & Clarifications Status

**BLOCKING ISSUE:**
| Item | Priority | Status |
|---|---|---|
| **🚨 Per-Requisition Filtering in Get_test_list** | **CRITICAL** | ⏸️ **MUST FIX** — Can Get_test_list accept `reqid`/`reqno` instead of date range? |

**Dependent on Blocking Issue (RESOLVED ONCE CORE ISSUE FIXED):**
| Item | Priority | Status |
|---|---|---|
| **Lab PDF by reqid** | CRITICAL | ⏸️ **Blocked** — Get tests by DEPT_TYPE=18, merge PDFs |
| **Radiology PDF by reqid** | CRITICAL | ⏸️ **Blocked** — Get tests by DEPT_TYPE=19, merge PDFs (same call as lab) |
| **Combined PDF** | CRITICAL | ⏸️ **Blocked** — Merge lab (18) + radiology (19) tests from single Get_test_list call |

**True Gaps (Missing Entirely):**
| Item | Priority | Status |
|---|---|---|
| **Trend Report PDF** | CRITICAL | ❓ **Clarify iReport support** — does your new cloud have iReports? |
| **Trend Data JSON** | CRITICAL | ❓ **Awaiting new endpoint** |

**Additional Clarifications:**
| Item | Priority | Status |
|---|---|---|
| **Real-Time Event Notifications** | MEDIUM | ❓ Do you support webhooks/events when requisition/test status changes? (See NEOSOFT_INTEGRATION_ENQUEUE_LOGIC.md) |
| **Source Information (IMPORTANT)** | HIGH | ❓ Do all report/status APIs return `source_id` or `source_name`? (Required for dispatch policy) |
| **Letterhead control** | HIGH | ❓ Can we control letterhead on PDF downloads? |
| **WhatsApp Sender integration** | HIGH | ❓ Can we use your built-in sender instead of building our own? |
| **Source filtering** | HIGH | ❓ Can we filter requisitions-by-date by source/collection centre? |
| **Report Status structure** | HIGH | ❓ Does it return flat test rows (as expected, not nested array)? |
| **Patient lookup structure** | MEDIUM | ❓ Confirm field names match contract (Section 3.1B) |

---

## Next Steps

**URGENT (Blocking Migration):**
1. **Respond immediately to the Core Issue:**
   - Can `Get_test_list` accept `reqid` or `reqno` as filters?
   - If not, provide an alternative per-requisition endpoint
   - This blocks all other work

**Once Core Issue is Resolved:**
2. **Respond to remaining gaps/clarifications** with:
   - Sample request + response for each endpoint
   - Confirmation of radiology PDF availability (DEPT_TYPE=19)
   - iReport endpoint details
   - Trend data JSON endpoint details
   - WhatsApp sender API details (if available)

3. **Provide complete field mapping:**
   - All response field names
   - Valid values for delivery status codes
   - Date/time format specifications

4. **UAT Validation:**
   - Once gaps are addressed, we'll validate all flows in simulator before go-live

---

## What Neosoft Should Know

### 1. API Contract Expectation
- We sent you a **detailed, specific contract** (neosoft-cloud-report-integration-contract.md, Section 6)
- We expected your APIs to match that contract **almost exactly**
- The **only acceptable drift** was PDF generation being test-wise (not requisition-wise)
- All other endpoints should support direct per-requisition queries

### 2. Impact on Your API Load (CRITICAL)

**With Proper Per-Requisition Filtering (as contracted):**
```
Patient calls bot: "I want my latest report"
  
1 API CALL:   GET /lookup?phone=9949099249
              → Returns: [reqid1, reqid2, reqid3]
  
1 API CALL:   GET /report-status?reqid=P1600422
              → Returns: tests for that requisition
  
1 API CALL:   GET /test-list?reqid=P1600422
              → Returns: test PDFs for that requisition
  
TOTAL: 3 API calls per patient request
```

**With Your Current Date-Range Design (no reqid support):**
```
Patient calls bot: "I want my latest report"

1 API CALL:   GET /lookup?phone=9949099249
              → Returns: [reqid1, reqid2, reqid3] with REQDT="2026-04-08"
  
1 API CALL:   GET /report-status?reqid=P1600422
              → Returns: test dates (let's assume 2026-04-08)
  
N API CALLS:  GET /test-list?FROMDATE=2026-04-01&TODATE=2026-04-30&SERVICETYPE=18
              Then filter manually for P1600422 (INEFFICIENT)
              
              Maybe also need:
              GET /test-list?FROMDATE=2026-03-01&TODATE=2026-03-31&SERVICETYPE=18
              GET /test-list?FROMDATE=2026-02-01&TODATE=2026-02-28&SERVICETYPE=18
              (if patient has older reports)
  
TOTAL: 5-10+ API calls per patient request, with filtering on our side
```

**For Scale:** If you have 10,000 patients/month requesting reports:
- **Proper design:** 30,000 API calls → manageable
- **Current design:** 50,000-100,000 API calls → **excessive load, poor user experience**

### 3. The Specific Problem

The date-range filtering in `Get_test_list` is fundamentally incompatible with per-requisition queries. It forces us to:
1. Guess date ranges (fragile)
2. Make multiple calls (inefficient)
3. Filter results manually (slower response)
4. Overload your API (bad for both sides)

---

**Contact:** [SDRC PM/Tech Lead]  
**Escalation:** Please respond to the **Core Issue** by [DATE] — this is required before [TARGET GO-LIVE DATE]
