# CTO Events Cleanup - May 29, 2026

## Problem
The CTO events list was flooded with noise from overly-sensitive worker log monitoring:
- **1000+ "worker_log_error_spike" events** - logged for ANY actionable error (even 1-2)
- All marked as **severity "high"** and status **"down"** 
- Example: "actionable_errors=2" triggered a high-severity event
- Made it impossible to identify real issues

## Root Cause
In `cto-collector/collector.py`, the worker log monitor was checking:
```python
if err_signal.get("actionable_total", 0) > 0:  # ANY error triggers event
    status = "down"
    severity = "high"
```

This caused events for transient, single-error occurrences that don't represent real problems.

## Solution

### 1. Code Changes (collector.py)
Added a threshold to filter noise:
```python
MIN_ACTIONABLE_ERRORS_FOR_EVENT = 10  # Only log meaningful spikes
```

Changed event logging logic:
```python
if err_signal.get("actionable_total", 0) >= MIN_ACTIONABLE_ERRORS_FOR_EVENT:
    status = "degraded"  # Changed from "down" to "degraded"
    severity = "medium"  # Changed from "high" to "medium"
```

**Rationale**: 
- 10+ errors in recent logs represents a real issue worth alerting
- 1-2 errors are transient and expected in any system
- Reduced severity/status since these are operational blips, not infrastructure failures

### 2. Database Cleanup
Deleted all 1000 noise events from `cto_events` table:
- Removed all `worker_log_error_spike` events with actionable_errors < 10
- Freed up the event list for real issues

## Results

**Events Before Cleanup:**
- 1000+ worker_log_error_spike (noise)
- A few real events buried in noise
- Total events: 1000+

**Events After Cleanup:**
- 43 pm2_restart_storm_24h (real infrastructure issues)
- 8 pm2_restart_storm (temporary spikes)
- 3 pm2_process_down (real failures)
- 1 customer_complaint (real user issue)
- **Total events: 55 (95% noise removed)**

## Impact

✓ **Signal-to-noise ratio improved 18x**
✓ **CTOs can now see real issues at a glance**
✓ **Future logs will only report meaningful error spikes (10+)**
✓ **Severity levels are now accurate and actionable**

## Monitoring Going Forward

Worker log health is still visible in:
- Service status dashboard (shows individual error counts)
- Detailed service inspection (full error logs)
- Only generates CTO events when actionable_errors >= 10

This keeps infrastructure engineers aware of transient issues without flooding decision-makers with noise.
