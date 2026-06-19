# SDRC Report Enqueue & Dispatch System

**Context for Neosoft:** This explains how labit-py uses the data you provide to manage automatic report delivery. Certain fields you return are critical for this to work.

---

## System Overview

**Workflow:**
```
1. Report becomes ready in Neosoft
2. labit-py polls for new requisitions (via requisitions-by-date API)
3. For each requisition, fetch status (via report-status API)
4. Check: Is it ready? Is it eligible for same-day delivery? Any holds?
5. If ready + eligible: Enqueue for WhatsApp delivery
6. Delivery engine sends PDF to patient
7. Update delivery status in Neosoft
8. Track sent/failed for retry logic
```

---

## Key Decision Points (Depend on Neosoft Data)

### 1. Is the Report Ready?
**Requires from Neosoft:**
- `APPROVEDFLG` (per test) — Is test approved? (0 = pending, 1 = approved)
- `REPORT_STATUS` (per test) — Status code (LAB_READY, RADIOLOGY_READY, PENDING, etc.)

**labit-py Logic:**
```
IF APPROVEDFLG = 1 AND REPORT_STATUS IN ('LAB_READY', 'RADIOLOGY_READY')
  → Mark test as ready
ELSE
  → Mark test as pending (hold delivery)
```

**Impact:** If these fields are wrong/missing, labit-py might send incomplete reports or hold complete ones.

---

### 2. Can We Send Same-Day? (CRITICAL)
**Requires from Neosoft:**
- `SAMEDAYREPORT` — Can this test be delivered same-day? (0 = no, 1 = yes)

**What "same-day" means:**
- Test is approved + ready + not waiting for admin review
- Can be sent immediately to patient (no cool-off period)

**labit-py Logic:**
```
IF SAMEDAYREPORT = 1 AND APPROVEDFLG = 1
  → Enqueue for immediate delivery
ELSE IF SAMEDAYREPORT = 0
  → Apply cool-off period (24-48 hours) before enqueue
ELSE (field missing)
  → FAIL: Cannot determine if safe to send
```

**Current Problem:** 
Your Excel shows `SAMEDAYREPORT` as **always empty**, which means:
- labit-py can't determine which tests are safe to send same-day
- Every test gets held (to avoid sending prematurely)
- Defeats the purpose of automated delivery

**Action Needed:** Populate this field with 0 or 1 based on your clinical rules.

---

### 3. Is There a Cool-Off Period?
**Configuration (in labit-py):**
```ini
[enqueue]
cooloff_hours = 24          # Hold tests for 24 hours after approval
sameday_skip_cooloff = 1    # Unless marked SAMEDAYREPORT=1
critical_tests_no_cooloff = EMERGENCY, CRITICAL  # Certain tests skip cool-off
```

**OR via environment variables:**
```bash
REPORT_COOLOFF_HOURS=24
SAMEDAY_SKIP_COOLOFF=1
CRITICAL_TEST_CODES=EMERGENCY,CRITICAL
```

**Why Cool-Off?**
- Allows doctors to review/correct reports before patient sees them
- Prevents accidental delivery of incomplete reports
- Can be bypassed for same-day eligible tests

**Depends on Neosoft:**
- If you don't populate `SAMEDAYREPORT`, cool-off is always applied
- If you populate it, labit-py respects your clinical judgment

---

### 4. Is This Test Outsourced?
**Requires from Neosoft:**
- `REPORT_STATUS = 'OUTSOURCED'` OR `OUTSOURCE = 1` OR `DEPTID = 'DPT00033'`
- `GROUPID` (to distinguish lab vs radiology outsource)

**labit-py Logic:**
```
IF REPORT_STATUS = 'OUTSOURCED'
  → Route to outsourced report handler
  → Check if PDF is available (transcribed, attached, QR-code)
  → Send via appropriate channel
ELSE
  → Include in combined lab/radiology PDF
```

**Impact:** Missing this field = outsourced reports get mixed into combined PDFs (wrong output).

---

### 5. Should This Test Be Held (Manual Review)?
**Requires from Neosoft:**
- Any flag indicating "pending doctor review", "needs approval", "flagged for verification"

**labit-py currently checks:**
- `APPROVEDFLG` — if 0, test is held
- Future: custom hold codes (pending implementation)

**Desired:** 
More granular hold reasons:
- `hold_reason = "PENDING_VERIFICATION"` — waiting for doctor sign-off
- `hold_reason = "MANUAL_REVIEW_REQUIRED"` — flagged for QA
- Etc.

---

## Event-Driven vs Polling Architecture

**Current Approach (Polling):**
```
labit-py every 5 minutes:
  → GET /requisitions-by-date?date=today
  → GET /report-status?reqno=XXX
  → Check for changes
  → If ready: Enqueue
  
Problem: Lag (up to 5 minutes before we notice a test is ready)
Benefit: Simple, works offline, no dependency on Neosoft events
```

**Alternative: Real-Time Events (Webhooks)**
```
Neosoft publishes events → labit-py receives immediately:
  - event: "requisition_created"
    payload: { reqno, reqid, patient_phone, ... }
  - event: "test_approved"
    payload: { reqno, testid, report_status, approveddt, ... }
  - event: "status_changed"
    payload: { reqno, testid, old_status, new_status, ... }

Benefit: Real-time delivery (seconds instead of minutes)
Problem: Requires Neosoft webhook/event infrastructure
```

### Question for Neosoft

**Do you support any of these?**
- [ ] **Webhooks** — You POST to our endpoint when something changes
  - Event types: `requisition.created`, `test.approved`, `status.changed`, `report.ready`
  - We provide you a callback URL (e.g., `https://sdrc.io/webhooks/neosoft`)
  - You send JSON payload when events occur
  
- [ ] **Message Queue/Stream** — You publish events to a Kafka/RabbitMQ topic
  - We subscribe and consume events in real-time
  - More scalable than webhooks
  
- [ ] **Change Data Capture (CDC)** — You stream database changes to us
  - Raw: requisition_changed, test_changed, status_changed
  - We parse and react
  
- [ ] **None** — Stick with polling (current approach)

### Our Recommendation

**For MVP (Phase 1):** Stick with polling
- Simpler integration (no webhook infra needed)
- Works offline
- No dependency on Neosoft event reliability
- Lag of 5 minutes is acceptable for most cases

**For Phase 2 (Scale):** Implement webhooks IF available
- Real-time delivery (critical for same-day reports)
- Reduces API load on both sides
- Better user experience ("Report is ready NOW")

---

## Configuration Options

### Cool-Off Period
```ini
[enqueue]
# Default: hold all reports for 24 hours after approval
cooloff_hours = 24

# Exception: if SAMEDAYREPORT=1, skip cool-off
sameday_skip_cooloff = 1

# Exception: these test codes skip cool-off regardless
critical_tests_no_cooloff = EMERGENCY, CRITICAL, URGENT
```

### Dispatch Timing
```ini
[enqueue]
# Check for new requisitions every X seconds
check_interval_seconds = 300

# Max concurrent deliveries
max_concurrent_deliveries = 10

# Retry failed deliveries this many times
max_retry_attempts = 3
retry_delay_minutes = 15
```

### Source-Based Filtering
```ini
[dispatch_policy]
# Don't send reports from these sources
do_not_send_source_ids = CONFIDENTIAL_DR, PRIVATE_CASE, HOLD_FOR_REVIEW
```

---

## Delivery Channels & Status Tracking

### Supported Channels
- `WHATSAPP` — Primary (sends PDF via WhatsApp)
- `SMS` — Fallback (sends download link)
- `EMAIL` — Alternative (sends PDF as attachment)

### Delivery Status Values
```
Status    | Meaning
----------|----------------------------------
SENT      | Successfully delivered to patient
PENDING   | Enqueued, waiting to send
FAILED    | Delivery failed, needs retry
HOLD      | Held per dispatch policy
DELIVERED | Confirmed delivery receipt
BOUNCED   | Invalid phone/delivery failed
```

**Neosoft Integration:** After sending, labit-py updates delivery status in your system via `update_delivery_status()` API.

---

## Retry Logic

**When Delivery Fails:**
```
Attempt 1: Immediate send
  ↓ (fails)
Attempt 2: Retry after 15 minutes
  ↓ (fails)
Attempt 3: Retry after 30 minutes
  ↓ (fails)
Flag: Manual intervention required
  → Alert staff to investigate
```

**Configurable:**
```ini
[whatsapp]
max_retry_attempts = 3
retry_delay_minutes = 15
retry_backoff = 1.5   # exponential backoff: 15, 22.5, 33.75 min
```

---

## Example: Report Approval → Delivery Flow

### Scenario 1: Same-Day Eligible Test
```
13:00 — Test approved (APPROVEDDT=today, SAMEDAYREPORT=1, APPROVEDFLG=1)
13:05 — labit-py fetches status, sees SAMEDAYREPORT=1
13:10 — Enqueue immediately (no cool-off)
13:15 — Send PDF to patient via WhatsApp
13:16 — Update delivery_status in Neosoft: status='SENT'
```

### Scenario 2: Test Requiring Cool-Off
```
14:00 — Test approved (APPROVEDDT=today, SAMEDAYREPORT=0, APPROVEDFLG=1)
14:05 — labit-py fetches status, sees SAMEDAYREPORT=0
14:10 — Hold for cool-off period (24 hours)
14:00+24h — Next day 14:00: Cool-off expires
14:05 — Check status again, still approved
14:10 — Enqueue for delivery
14:15 — Send PDF
14:16 — Update Neosoft
```

### Scenario 3: Outsourced Test
```
15:00 — Test marked REPORT_STATUS='OUTSOURCED'
15:05 — lafit-py routes to outsourced handler
15:10 — Check: Is PDF available? (transcribed/attached/QR-code)
15:15 — If available: Send to patient
15:16 — If not available: Flag for staff review
```

---

## What Neosoft MUST Provide

### For Basic Delivery (Required)
- ✅ `APPROVEDFLG` — test approval status
- ✅ `SAMEDAYREPORT` — same-day eligible? (CRITICAL — currently empty in your API)
- ✅ `REPORT_STATUS` — current status code
- ✅ `GROUPID` — lab vs radiology
- ✅ `TESTID` — unique test ID
- ✅ `SOURCEID` / `SOURCENM` — referrer (for dispatch policy)

### For Outsourced Handling (If Applicable)
- ✅ `OUTSOURCE` flag OR `REPORT_STATUS = 'OUTSOURCED'`
- ✅ Availability status (transcribed/attached/etc.)
- ✅ Document URL (if available)

### For Audit/Tracking
- ✅ `APPROVEDDT` / `APPROVEDTM` — when was it approved?
- ✅ Approval chain info (who approved?)

---

## Current Issue: SAMEDAYREPORT Field

**In your API response (Excel sample):**
```json
{
  "SAMEDAYREPORT": "",    // ← EMPTY!
  "APPROVEDFLG": "0",
  "REPORT_STATUS": "LAB_PENDING"
}
```

**Why this breaks labit-py:**
1. Can't determine if test is safe to send same-day
2. Defaults to holding all tests (safe but defeats automation)
3. Enqueue system becomes manual-dependent

**What we need:**
```json
{
  "SAMEDAYREPORT": "1",    // ← POPULATED
  "APPROVEDFLG": "1",
  "REPORT_STATUS": "LAB_READY"
}
```

**Your Decision Needed:**
- How do you determine if a test is "same-day" eligible?
- Is it based on test type? Urgency? Doctor rules?
- Can you compute this in your system and return it?

---

## Summary for Neosoft Integration

**Without these fields working correctly:**
- ❌ labit-py cannot automate delivery
- ❌ Every test goes into manual hold
- ❌ Cool-off logic doesn't work
- ❌ Outsourced tests mix into combined PDFs

**With these fields populated:**
- ✅ Full automation works
- ✅ Same-day tests send immediately
- ✅ Cool-off respects clinical timelines
- ✅ Outsourced/in-house routing works correctly

This is why SAMEDAYREPORT (currently empty) is one of the most critical fields for the new integration.
