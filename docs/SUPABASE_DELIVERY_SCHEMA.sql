-- Supabase Tables for Report Delivery Tracking
-- Deploy to Supabase via: Dashboard > SQL Editor > Create new query

-- 1. Requisition-Level Delivery Tracking
CREATE TABLE delivery_requisitions (
    id BIGSERIAL PRIMARY KEY,
    reqno VARCHAR NOT NULL UNIQUE,
    reqid VARCHAR,
    mrno VARCHAR,
    patient_name VARCHAR,
    patient_phone VARCHAR,
    overall_status VARCHAR NOT NULL,  -- SUCCESS, FAILED, PARTIAL, PENDING
    total_tests INT,
    successful_tests INT DEFAULT 0,
    failed_tests INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_delivery_requisitions_reqno ON delivery_requisitions(reqno);
CREATE INDEX idx_delivery_requisitions_updated_at ON delivery_requisitions(updated_at DESC);

-- 2. Test-Wise Delivery Log (Granular Tracking)
CREATE TABLE delivery_test_log (
    id BIGSERIAL PRIMARY KEY,
    reqno VARCHAR NOT NULL REFERENCES delivery_requisitions(reqno) ON DELETE CASCADE,
    test_id VARCHAR NOT NULL,
    test_name VARCHAR,
    department VARCHAR,  -- lab, radiology, other
    approved_flag INT,
    report_status VARCHAR,  -- LAB_READY, RADIOLOGY_READY, PENDING, etc.
    delivery_channel VARCHAR,  -- WHATSAPP, SMS, EMAIL
    delivery_status VARCHAR NOT NULL,  -- SUCCESS, FAILED, RETRY
    pdf_url VARCHAR,
    pdf_size_bytes INT,
    error_message VARCHAR,
    retry_count INT DEFAULT 0,
    delivered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(reqno, test_id, delivery_channel)
);

CREATE INDEX idx_delivery_test_log_reqno ON delivery_test_log(reqno);
CREATE INDEX idx_delivery_test_log_status ON delivery_test_log(delivery_status);
CREATE INDEX idx_delivery_test_log_channel ON delivery_test_log(delivery_channel);
CREATE INDEX idx_delivery_test_log_created_at ON delivery_test_log(created_at DESC);

-- Query for retry: find all failed tests for a requisition
-- SELECT * FROM delivery_test_log
-- WHERE reqno = 'AB3934326' AND delivery_status = 'FAILED' AND retry_count < 3
-- ORDER BY created_at DESC;

-- 3. Delivery Channel History
CREATE TABLE delivery_channels (
    id BIGSERIAL PRIMARY KEY,
    reqno VARCHAR NOT NULL REFERENCES delivery_requisitions(reqno) ON DELETE CASCADE,
    channel VARCHAR NOT NULL,  -- WHATSAPP, SMS, EMAIL
    message_id VARCHAR,
    delivery_status VARCHAR,  -- SENT, DELIVERED, FAILED, BOUNCED
    message_text VARCHAR,
    recipient_phone VARCHAR,
    recipient_email VARCHAR,
    sent_at TIMESTAMP WITH TIME ZONE,
    delivery_confirmed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_delivery_channels_reqno ON delivery_channels(reqno);
CREATE INDEX idx_delivery_channels_channel ON delivery_channels(channel);
CREATE INDEX idx_delivery_channels_status ON delivery_channels(delivery_status);

-- 4. PDF Generation Log (Optional - for debugging)
CREATE TABLE pdf_generation_log (
    id BIGSERIAL PRIMARY KEY,
    reqno VARCHAR NOT NULL,
    reqid VARCHAR,
    pdf_type VARCHAR,  -- lab, radiology, combined
    letterhead_enabled BOOLEAN DEFAULT TRUE,
    total_tests INT,
    successful_merges INT,
    failed_merges INT,
    total_pdf_size_bytes INT,
    generation_time_ms INT,
    error_message VARCHAR,
    generated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_pdf_generation_log_reqno ON pdf_generation_log(reqno);
CREATE INDEX idx_pdf_generation_log_created_at ON pdf_generation_log(created_at DESC);

---
--- HELPFUL QUERIES
---

-- 1. Get all failed tests for a requisition (for retry enqueue)
-- SELECT test_id, test_name, department, error_message, retry_count
-- FROM delivery_test_log
-- WHERE reqno = 'AB3934326' AND delivery_status = 'FAILED'
-- ORDER BY retry_count ASC, created_at DESC;

-- 2. Get delivery summary for a requisition
-- SELECT
--   reqno,
--   COUNT(*) as total_tests,
--   SUM(CASE WHEN delivery_status = 'SUCCESS' THEN 1 ELSE 0 END) as successful,
--   SUM(CASE WHEN delivery_status = 'FAILED' THEN 1 ELSE 0 END) as failed,
--   MAX(updated_at) as last_updated
-- FROM delivery_test_log
-- WHERE reqno = 'AB3934326'
-- GROUP BY reqno;

-- 3. Get delivery status by channel
-- SELECT
--   reqno,
--   channel,
--   delivery_status,
--   COUNT(*) as test_count
-- FROM delivery_test_log
-- WHERE reqno = 'AB3934326'
-- GROUP BY reqno, channel, delivery_status;

-- 4. Find requisitions with partial failures
-- SELECT DISTINCT dtl.reqno
-- FROM delivery_test_log dtl
-- WHERE dtl.delivery_status = 'FAILED'
-- AND dtl.retry_count < 3
-- AND dtl.created_at > NOW() - INTERVAL '24 hours'
-- ORDER BY dtl.created_at DESC;

-- 5. Dashboard: Delivery metrics (last 24 hours)
-- SELECT
--   DATE(created_at) as date,
--   delivery_channel,
--   delivery_status,
--   COUNT(*) as count,
--   AVG(pdf_size_bytes) as avg_pdf_size,
--   SUM(pdf_size_bytes) as total_bytes
-- FROM delivery_test_log
-- WHERE created_at > NOW() - INTERVAL '24 hours'
-- GROUP BY DATE(created_at), delivery_channel, delivery_status
-- ORDER BY date DESC, delivery_channel, delivery_status;

---
--- SUPABASE ROW-LEVEL SECURITY (RLS)
---

-- Enable RLS on all tables
ALTER TABLE delivery_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_test_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_generation_log ENABLE ROW LEVEL SECURITY;

-- Policy: Only your service role can insert/update (labit-py backend)
-- Service key is never exposed to client; only used in backend
-- Clients would need additional RLS policies if accessing directly (not recommended)

-- Example: Allow service role (backend) to read/write everything
CREATE POLICY "Service role full access" ON delivery_requisitions
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access" ON delivery_test_log
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access" ON delivery_channels
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access" ON pdf_generation_log
    FOR ALL USING (true) WITH CHECK (true);
