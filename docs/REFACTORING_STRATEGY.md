# Labit-py Refactoring Strategy: Neosoft Cloud Upgrade

**Purpose:** Plan code changes for labit-py to integrate Neosoft's new cloud APIs  
**Status:** Pending Neosoft responses to NEOSOFT_API_GAPS_AND_CLARIFICATIONS.md  
**Scope:** Flask/FastAPI adapter layer between SDRC endpoints and Neosoft APIs

---

## Current Architecture (Baseline)

```
labit-py (FastAPI)
  ├── main.py (23 endpoints)
  │   ├── /lookup/{phone} → req_lookup.py
  │   ├── /report-status/{reqno} → report_status.py
  │   ├── /reports/{reqid} → report_fetcher.py (combined lab PDF)
  │   ├── /radiologyreport/{reqid} → radiology_fetcher.py
  │   ├── /trend-report/{mrno} → trend_report_fetcher.py
  │   ├── /trend-data/{mrno} → trends_data_api.py
  │   ├── /delivery/requisitions-by-date/{date} → delivery_api.py
  │   ├── /delivery/status/{reqno} → delivery_api.py
  │   ├── /delivery/status/update → delivery_api.py
  │   ├── /shivam/demographics/{mrno} → shivam_tools.py
  │   └── [10+ more endpoints]
  │
  └── Neosoft Old API (direct DB queries via WebForms)
```

---

## Post-Upgrade Architecture (Target)

```
labit-py (FastAPI) — UNCHANGED endpoints
  ├── main.py (same 23 endpoints — no breaking changes)
  │
  ├── Neosoft Adapter Layer (NEW/REFACTORED)
  │   ├── neosoft_client.py (wrapper for all Neosoft APIs)
  │   │   ├── NeoSoftAPI class
  │   │   │   ├── patient_latest(phone)
  │   │   │   ├── report_status(reqno)
  │   │   │   ├── report_status_by_reqid(reqid)
  │   │   │   ├── get_test_list(fromdate, todate, servicetype)
  │   │   │   ├── requisitions_by_date(date)
  │   │   │   ├── update_delivery_status(reqno, status, channel, message)
  │   │   │   ├── get_delivery_status(reqno)
  │   │   │   ├── get_demographics(mrno)
  │   │   │   ├── put_demographics(mrno, data)
  │   │   │   └── department_list(socid)
  │   │   └── _call(webformid, body) [base HTTP caller]
  │   │
  │   ├── req_lookup.py (REFACTOR → use patient_latest)
  │   ├── report_status.py (REFACTOR → use report_status/by_reqid)
  │   ├── report_fetcher.py (REFACTOR → iterate test-wise PDFs, merge, log to Supabase)
  │   ├── radiology_fetcher.py (REFACTOR → get radiology tests from Get_test_list)
  │   ├── trends_data_api.py (AWAITING NEOSOFT endpoint)
  │   ├── trend_report_fetcher.py (AWAITING NEOSOFT endpoint)
  │   └── [other modules adjusted as needed]
  │
  ├── Supabase Integration (NEW) — Report Tracking
  │   ├── supabase_client.py (client library)
  │   │   └── DeliveryTracker class
  │   │       ├── log_test_delivery(reqno, test_id, status, pdf_url, error)
  │   │       ├── log_requisition_delivery(reqno, overall_status, channel)
  │   │       ├── get_delivery_status(reqno)
  │   │       └── get_failed_tests(reqno) [for retry enqueue]
  │   │
  │   ├── delivery_engine.py (REFACTOR — use Supabase for all tracking)
  │   │   └── Returns: combined PDF + test_delivery_log
  │   │
  │   └── Supabase Tables
  │       ├── delivery_requisitions
  │       ├── delivery_test_log
  │       └── delivery_channels
  │
  └── Upstream Services
      ├── Neosoft Cloud API (TApiQuery with webformids)
      └── Enqueue System (retry logic, handled separately)
```

---

## Refactoring Phases

### Phase 1: Setup & Core Adapter (Weeks 1-2)

**Files to Create:**
1. `app/neosoft_client.py` — Main wrapper class for all Neosoft APIs
   - Base HTTP client with GROUPHSPTLID injection
   - Methods for each endpoint (patient_latest, report_status, etc.)
   - Error handling & retry logic
   - Response normalization (Neosoft field names → SDRC field names)

2. `config.ini` additions
   ```ini
   [neosoft_cloud]
   base_url = https://neosoftlite.xyz/swd/TApiQuery
   grouphospitalid = GH000095
   terminal_id = 183.82.126.219
   
   [neosoft_cloud_endpoints]
   patient_latest_webformid = wf5820
   report_status_webformid = wf5824
   report_status_reqid_webformid = wf5825
   requisitions_by_date_webformid = wf5826
   get_test_list_webformid = wf5834
   # ... etc
   ```

**Files to Update:**
- `main.py` — No endpoint signature changes; just swap internal calls

**Testing:**
- Unit tests for neosoft_client.py (mock HTTP responses)
- Integration tests against NeoSoft UAT (if available)

---

### Phase 2: Endpoint Refactoring (Weeks 2-3)

**Priority: HIGH (Blocking)**

#### 2.1 Patient Lookup
- **File:** `req_lookup.py`
- **Change:** Old API → `patient_latest(phone)`
- **Risk:** Field name mapping (REQID vs BILLID, REQNO vs LOCBILLNO, etc.)
- **Effort:** Low (simple 1:1 replacement)

#### 2.2 Report Status
- **Files:** `report_status.py`
- **Change:** Old API → `report_status(reqno)` + `report_status_by_reqid(reqid)`
- **Risk:** Test array structure unclear; need Neosoft sample response
- **Effort:** Medium (field mapping + test array normalization)

#### 2.3 Lab Report PDF (Test-Wise Iteration)
- **Files:** `report_fetcher.py`, `delivery_engine.py`
- **Design Decision:** ✅ Iterate through test IDs from status API, fetch individual PDFs, merge + track
- **Implementation:**
  1. Call `report_status(reqno)` → get test array
  2. For each test: fetch PDF via `get_test_list()` filtering
  3. Merge PDFs using pypdf
  4. Log delivery per test to Supabase (not Neosoft's delivery API)
  5. Return combined PDF + test delivery log
- **Benefits:**
  - Granular tracking: which tests sent ✅, which failed ❌
  - Smart retry: resend only failed tests
  - Decoupled from Neosoft's PDF endpoint availability
  - Test-wise audit trail in Supabase
- **Effort:** Medium (filtering + merging + Supabase logging)

#### 2.4 Radiology Report PDF
- **Files:** `radiology_fetcher.py`
- **Change:** Old API → `get_test_list()` with `DEPT_TYPE=19` filtering
- **Risk:** MAJOR — No dedicated radiology endpoint confirmed
- **Workaround (if endpoint missing):**
  - Same as Lab (2.3), but filter by DEPT_TYPE=19
- **Effort:** High (same complexity as Lab)

#### 2.5 Combined Report PDF
- **Files:** `report_fetcher.py` (new function `get_combined_report()`)
- **Change:** Old combined endpoint → Merge lab + radiology test PDFs
- **Risk:** MAJOR — No endpoint; requires client-side merge
- **Implementation:**
  1. Fetch lab PDFs (via 2.3 workaround)
  2. Fetch radiology PDFs (via 2.4 workaround)
  3. Merge using pypdf + return combined file
- **Effort:** High (complex merge logic)

#### 2.6 Delivery Status (Supabase-Backed)
- **Files:** `delivery_api.py`, `delivery_engine.py`, `supabase_client.py` (NEW)
- **Design Decision:** ✅ Track all delivery in Supabase, not Neosoft's delivery update API
- **Implementation:**
  1. Maintain Supabase tables for:
     - `delivery_requisitions` — requisition-level tracking
     - `delivery_test_log` — test-wise delivery (which tests sent, which failed)
     - `delivery_channels` — per-channel tracking (WHATSAPP, SMS, EMAIL, etc.)
  2. On PDF generation → log test-wise delivery to Supabase
  3. On channel send → update delivery status in Supabase
  4. Optionally sync to Neosoft's `update_delivery_status()` for their records
  5. Retry logic handled in separate enqueue system (not this module)
- **Letterhead:** Per-endpoint flag (all tests in one PDF get same letterhead setting)
- **Effort:** Medium (Supabase schema + client library)

---

### Phase 3: Awaiting Neosoft Endpoints (Weeks TBD)

**Blockers — Cannot start until Neosoft provides:**
1. Trend Report PDF endpoint
2. Trend Data JSON endpoint

**For now:**
- Stub out `trend_report_fetcher.py` and `trends_data_api.py` with 501 (Not Implemented) responses
- Plan refactoring once endpoints arrive

---

### Phase 4: Testing & Validation (Weeks 3-4)

1. **Unit Tests**
   - Mock neosoft_client responses
   - Test field mapping (Neosoft → SDRC field names)
   - Test error handling

2. **Integration Tests (Against NeoSoft UAT)**
   - Test all 10 Neosoft APIs with real responses
   - Validate PDF downloads + merging
   - Test delivery status read/update workflows

3. **End-to-End Bot Simulator**
   - Validate all 4 flows from contract Section 8:
     - Flow A: Patient asks for latest report
     - Flow B: Patient selects older report
     - Flow C: Patient asks for trend report (once endpoint available)
     - Flow D: Internal user dispatch/print workflow

4. **Regression Tests**
   - Ensure existing endpoints still work
   - Validate no breaking changes to external API consumers

---

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| PDF endpoints missing (lab/rad/combined/trend) | **CRITICAL** | Implement client-side merge (slower); request endpoints from Neosoft |
| `Get_test_list` requires date range (no direct reqid query) | **HIGH** | Use report_status → extract dates → call Get_test_list → filter |
| Letterhead control not available | **HIGH** | Accept pre-generated PDFs; store both with/without variants if available |
| Field name mismatches (BILLID vs REQID, etc.) | **MEDIUM** | Comprehensive mapping layer in neosoft_client.py |
| Delivery status code format (numeric vs string) | **MEDIUM** | Clarify with Neosoft; normalize on SDRC side |
| Report status test array structure unclear | **MEDIUM** | Get sample response; test with UAT data |

---

## Effort Estimate

| Phase | Effort | Duration | Status |
|---|---|---|---|
| Phase 1: Core Adapter | 40 hours | Week 1-2 | Ready to start |
| Phase 2.1-2.2: Lookup + Status | 20 hours | Week 2 | Ready to start |
| Phase 2.3-2.5: PDF endpoints | 60 hours | Week 2-3 | **Blocked on Neosoft clarifications** |
| Phase 2.6: Delivery Status | 16 hours | Week 3 | Ready to start |
| Phase 3: Trend endpoints | 40 hours | TBD | **Blocked on Neosoft providing endpoints** |
| Phase 4: Testing + UAT | 50 hours | Week 3-4 | Parallel with Phase 2-3 |
| **Total** | ~226 hours | **4-5 weeks** | Depends on Neosoft responses |

**Timeline:** Can be compressed if Neosoft responds quickly to clarifications (next 1-2 weeks).

---

## Breaking Changes & API Compatibility

**Good News:** ✅ NO breaking changes to labit-py's external endpoints
- All 23 endpoints keep same URL structure
- Response formats unchanged
- Clients don't need updates

**Internal Changes (only affect code, not API):**
- Field names internally (BILLID → REQID internally, but returned as REQID to clients)
- PDF handling (test-wise PDFs instead of requisition-wise)

---

## Deployment Checklist

**NeoSoft Integration:**
- [ ] GROUPHSPTLID configured in config.ini (per environment)
- [ ] NeoSoft base URL + webformids in config.ini
- [ ] NeoSoft UAT credentials/IP whitelisting confirmed
- [ ] All 10 Neosoft APIs tested in UAT
- [ ] Trend endpoints available (or alternate approach confirmed)

**Supabase Setup:**
- [ ] Supabase project created (or verified existing)
- [ ] Supabase credentials in config/env (API URL + key)
- [ ] Tables created: `delivery_requisitions`, `delivery_test_log`, `delivery_channels`
- [ ] Row-level security (RLS) policies configured
- [ ] Supabase client library integration tested

**Functionality Testing:**
- [ ] PDF merging tested (lab + radiology combinations)
- [ ] Test-wise delivery logging to Supabase verified
- [ ] Letterhead flag working per-endpoint (not per-test)
- [ ] Delivery status read/update workflows validated (via Supabase)
- [ ] Failed test queries working (for enqueue retry system)
- [ ] Bot simulator passes all 4 flows
- [ ] Regression tests pass (old tests still work)

**Performance & Scaling:**
- [ ] PDF download + merge latency acceptable (SLA: <3s for combined PDF)
- [ ] Supabase query performance tested (bulk inserts, large test arrays)
- [ ] Database indexing configured (reqno, test_id, delivery_channel)
- [ ] Load testing: concurrent deliveries to Supabase

**Go-Live Readiness:**
- [ ] Supabase backup/disaster recovery plan confirmed
- [ ] Monitoring alerts set up (PDF generation failures, Supabase connection errors)
- [ ] Data migration: any legacy delivery records to Supabase?
- [ ] Rollback plan: fallback to old APIs if Neosoft integration fails
- [ ] Go-live readiness sign-off

---

## Next Steps

1. **Send NEOSOFT_API_GAPS_AND_CLARIFICATIONS.md to Neosoft** ✅
2. **Wait for responses** (~1-2 weeks expected)
3. **Once responses received:**
   - Finalize neosoft_client.py design
   - Create detailed field mapping
   - Start Phase 1 implementation
4. **UAT coordination with Neosoft** (provide test credentials, endpoint validation)

---

## Questions for SDRC Product/Ops Team

1. **Go-live date target?** (affects priority + parallel workstreams)
2. **Rollback plan:** If Neosoft endpoints don't work, keep old API as fallback?
3. **Performance SLA:** Max acceptable latency for PDF download + merge?
4. **Monitoring/logging:** What metrics to track (API call count, latency, errors)?
5. **Trend endpoints:** If Neosoft can't provide, will we build them in-house?
