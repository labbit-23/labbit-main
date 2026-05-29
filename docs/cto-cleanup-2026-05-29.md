# CTO Dashboard Cleanup - May 29, 2026

## Problem Statement
The CTO diagnostics page had significant data quality issues:
- **42 stale services** (>24 hours old, many 30+ days old)
- **Downtime metric bug**: VPS showed "Downtime 00:00" due to overly strict threshold (99.9%)
- **Dead services**: Collectors for old infrastructure no longer sending data
- **Data accuracy**: Difficult to distinguish real outages from stale/old data

## Changes Made

### 1. Database Cleanup
Removed 42 stale service records from `cto_service_latest` table that hadn't been updated in >30 days:

**Deleted services (dead collectors):**
- `dicom_worker__local` (1404h old)
- `ecg_sender__local` (1404h old)
- `machine_bridge__local` and `__vps` (1404-1428h old)
- `local_delivery_engine__vps` (1428h old)
- `monitoring_agent__vps` (1428h old)
- `tailscale_mirth` (1726h old / 71 days)
- Various old VPS services (910-1485h old): funnel_mirth_health, docker_supabase_* (old vps), labbit_health, oracle_db, etc.

**Result**: Reduced from 77 services → 35 active services, all with fresh data

### 2. Code Fixes

#### Downtime Calculation Bug (CtoDashboardPage.js:1499)
**Before:**
```javascript
const downBuckets = valid.filter((point) => Number(point?.healthy_rate) < 0.999).length;
```
This counted ANY bucket with <99.9% health as downtime, causing white noise from minor fluctuations.

**After:**
```javascript
const downBuckets = valid.filter((point) => Number(point?.healthy_rate) < 0.8).length;
```
Now only meaningful degradations (real outages, <80% uptime) are counted as downtime.

#### Removed Dead Service from Configuration
Removed `tailscale_mirth` from:
- `keySystems` list in CtoDashboardPage.js
- Service categorization functions (domainTitleForService, iconForService in both dashboard and trends API)

### 3. Remaining Services (All Fresh)

| Service Group | Status | Last Update |
|---|---|---|
| Core Platform | ✓ Healthy | 0m |
| Supabase (vps2) | ✓ Healthy | 0m |
| WhatsApp Bot | ✓ Healthy | Integrated metrics |
| Mirth (dicom, lab) | ✓ Healthy | 0m |
| Tomcat | ✓ Healthy | 0m |
| Orthanc | ✓ Healthy | 1m |
| Report Services | ✓ Healthy | 0m |
| Database (Oracle) | ✓ Healthy | 0m |
| VPS Host Metrics | ✓ Healthy | 0m |

All active services now have current data (0-1 minutes old).

## Benefits

1. **Accurate Monitoring**: No more stale data cluttering the dashboard
2. **Meaningful Downtime**: Only real outages (>20% impact) count as downtime, eliminating white noise
3. **Clean UI**: Removed dead services that couldn't be monitored
4. **Better Signal**: CTOs can now distinguish between actual issues and data artifacts

## Notes

- Old service data remains in `cto_service_logs` for historical analysis if needed
- Daily digest table (`cto_service_daily_digest`) may still contain historical entries but won't be queried by fresh services
- If any service monitoring becomes inactive in future, stale entries will auto-cleanup after 30 days
