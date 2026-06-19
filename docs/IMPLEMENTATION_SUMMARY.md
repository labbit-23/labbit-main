# Neosoft Cloud Upgrade: Implementation Summary

**Status:** Ready to send to Neosoft + Ready to code  
**Timeline:** 4-5 weeks (depends on Neosoft responses)  
**Team:** 1-2 engineers

---

## What We're Doing

### 1. Sending to Neosoft (This Week)
📧 **NEOSOFT_API_GAPS_AND_CLARIFICATIONS.md**
- List 5 critical gaps (PDF endpoints, trend APIs)
- Request clarifications (letterhead, test filtering, status codes)
- Set deadline for responses (~2 weeks)

---

### 2. Refactoring labit-py (4-5 Weeks)

#### Phase 1: Setup (Week 1)
- [ ] Create `neosoft_client.py` — wrapper for all Neosoft APIs
- [ ] Configure GROUPHSPTLID in `config.ini`
- [ ] Create `supabase_client.py` — wrapper for Supabase delivery tracking
- [ ] Set up Supabase tables (run `SUPABASE_DELIVERY_SCHEMA.sql`)

#### Phase 2: Refactor Endpoints (Week 2-3)
- [ ] `req_lookup.py` — swap to `patient_latest(phone)`
- [ ] `report_status.py` — swap to `report_status(reqno)` + `report_status_by_reqid(reqid)`
- [ ] **`report_fetcher.py`** — NEW DESIGN: iterate test-wise PDFs, merge, log to Supabase
- [ ] `radiology_fetcher.py` — fetch radiology tests from `Get_test_list(DEPT_TYPE=19)`
- [ ] `delivery_api.py` — log all delivery to Supabase (not Neosoft's API)
- [ ] `shivam_tools.py` — adapt demographics endpoints

#### Phase 3: Awaiting Neosoft (TBD)
- [ ] Trend Report PDF endpoint
- [ ] Trend Data JSON endpoint
- ⏸️ Don't block on these — stub with 501 for now

#### Phase 4: Testing & UAT (Week 3-4)
- [ ] Unit tests for neosoft_client + supabase_client
- [ ] Integration tests against Neosoft UAT
- [ ] End-to-end bot simulator tests (all 4 flows)
- [ ] Regression tests (old tests still pass)

---

## Key Design Decisions

### ✅ Test-Wise PDF Iteration
Instead of calling a combined PDF endpoint:
1. Get test array from `report_status(reqno)`
2. For each test: fetch individual PDF
3. Merge PDFs using pypdf
4. **Log each test delivery to Supabase** (not Neosoft's delivery API)

**Benefits:**
- Granular tracking: which tests sent ✅, which failed ❌
- Smart retry: only resend failed tests
- Decoupled from Neosoft's PDF endpoint design

### ✅ Supabase for Delivery Tracking
Instead of relying on Neosoft's delivery status API:
1. Log all delivery events to Supabase
2. Track test-wise (not just requisition-level)
3. Query failed tests for retry enqueue
4. Own audit trail, independent of Neosoft

**Tables:**
- `delivery_requisitions` — requisition-level summary
- `delivery_test_log` — test-wise tracking (which tests sent, failed, retried)
- `delivery_channels` — channel-specific events (WHATSAPP, SMS, EMAIL)
- `pdf_generation_log` — PDF generation metrics

### ✅ Per-Endpoint Letterhead Flag
Letterhead control applied to entire PDF (all tests), not per-test.
- `GET /reports/{reqid}?letterhead=true` — all tests with letterhead
- `GET /reports/{reqid}?letterhead=false` — all tests without letterhead
- Simpler to implement, faster to process

---

## Files Created/Updated

### New Files
```
labit-main/docs/
├── NEOSOFT_API_GAPS_AND_CLARIFICATIONS.md (send to Neosoft)
├── REFACTORING_STRATEGY.md (internal roadmap)
├── SUPABASE_DELIVERY_SCHEMA.sql (Supabase setup)
└── IMPLEMENTATION_SUMMARY.md (this file)

labit-py/app/
├── neosoft_client.py (NEW — Neosoft API wrapper)
└── supabase_client.py (NEW — Supabase delivery tracker)
```

### Modified Files
```
labit-py/
├── config.ini (add neosoft_cloud + supabase sections)
└── app/
    ├── main.py (minimal changes)
    ├── req_lookup.py (refactor)
    ├── report_status.py (refactor)
    ├── report_fetcher.py (major refactor — test-wise iteration)
    ├── radiology_fetcher.py (refactor)
    ├── delivery_api.py (refactor — use Supabase)
    ├── delivery_engine.py (update for test-wise logging)
    ├── shivam_tools.py (minor updates)
    └── [other modules — minimal changes]
```

---

## External Dependencies

### Neosoft Cloud APIs
- ✅ 10 APIs documented in Excel
- ❌ 5 gaps to clarify (see NEOSOFT_API_GAPS_AND_CLARIFICATIONS.md)
- 🔄 Waiting for responses (~2 weeks)

### Supabase
- ✅ Account already set up (or will be)
- ✅ Tables defined (SUPABASE_DELIVERY_SCHEMA.sql)
- Minimal setup: just run SQL + configure API credentials

### Python Libraries
- ✅ `pypdf` — already in `requirements.txt` (PDF merging)
- ✅ `supabase` or `supabase-py` — add to `requirements.txt`
- ✅ `requests` — already used for Neosoft API calls

---

## No Breaking Changes

✅ **All 23 labit-py endpoints remain unchanged:**
- Same URL structure
- Same request/response formats
- No client-side changes needed

**Only internal implementation changes:**
- Old Neosoft API → New Neosoft API
- Test-wise PDF iteration + merging
- Supabase for delivery tracking

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Neosoft delays responses | Start Phase 1 setup in parallel; unblocked work |
| PDF merging performance | Test with large test arrays; optimize pypdf usage |
| Supabase connection issues | Implement retry logic + fallback to cache |
| Missing trend endpoints | Stub with 501; plan in-house solution later |
| Partial PDF generation | Log each test failure; retry failed tests via enqueue |

---

## Success Criteria

✅ **Go-Live Ready When:**
1. All 10 Neosoft APIs working in UAT
2. Test-wise PDF merging validated (lab + radiology)
3. Supabase delivery log fully operational
4. Bot simulator passes all 4 flows
5. Failed test query working (for retry enqueue)
6. Regression tests pass
7. Performance meets SLA (<3s for combined PDF)

---

## Next Steps (In Order)

1. **This week:** Send `NEOSOFT_API_GAPS_AND_CLARIFICATIONS.md` to Neosoft
2. **Week 1:** Start Phase 1 (create neosoft_client + supabase_client)
3. **Week 2-3:** Implement Phase 2 (refactor endpoints)
4. **Week 2-4:** Testing in parallel with Phase 2
5. **Week 4-5:** UAT validation + go-live prep
6. **Anytime (Neosoft allows):** Phase 3 (trend endpoints)

---

## Contact/Escalation

**For Neosoft clarifications:**
- Send: NEOSOFT_API_GAPS_AND_CLARIFICATIONS.md
- Follow up: 2 weeks if no response
- Escalate: If critical gaps not addressed, plan workarounds

**For implementation blockers:**
- Chat: Engineering team lead
- Document: Update REFACTORING_STRATEGY.md as issues arise

---

## Questions Before We Start?

1. Are you ready to send the Neosoft document this week?
2. Do you have Supabase project set up already?
3. Any existing delivery tracking data to migrate to Supabase?
4. Performance SLA for PDF download + merge? (assume <3s per combined PDF)
5. Retry enqueue system — separate service, or in labit-py?

Let me know and we can kick off Phase 1! 🚀
