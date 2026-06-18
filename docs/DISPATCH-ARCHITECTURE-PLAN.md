# Unified Report Dispatch Architecture - Future Plan

## Current State (Fragmented)
```
BMD System → PDF folder (manual sync?)
ECG System → Email inbox (manual sync?)
Regular Reports → py_utils dispatch
                      ↓
                  report-sender (vps1 only)
```

**Problems:**
- Code duplication across systems
- Manual synchronization required
- Reports sent separately (multiple emails)
- Enqueue logic only on vps1

## Proposed Unified Architecture

```
BMD System (enqueue-watcher)
  ↓ folder monitor → /opt/py_utils/workers/report_sender/
  
ECG System (enqueue-watcher)
  ↓ email/folder monitor → /opt/py_utils/workers/report_sender/
  
Regular Reports → /opt/py_utils/workers/report_sender/
  
All three sources ↓
  report-enqueue-watch (unified, single source of truth)
        ↓ combines all reports
  report-sender (sends all PDFs together in one dispatch)
```

## Implementation Plan

### Phase 1: Deploy Enqueue Worker to BMD & ECG Systems
- Copy `/opt/py_utils` to BMD system
- Copy `/opt/py_utils` to ECG system
- Configure each with their own `.env`:
  - BMD: `CTO_SOURCE=bmd-lab-1`, monitor PDF folder
  - ECG: `CTO_SOURCE=ecg-lab-1`, monitor email/folder
- Start report-enqueue-watch on both systems

### Phase 2: Add Folder Watchers
**BMD report watcher (new module):**
```python
# workers/report_sender/bmd_folder_watcher.py
- Monitor /mnt/bmd/reports/ for new PDFs
- Extract requisition number from filename
- Insert job into report_auto_dispatch_jobs with:
  - service_key: "bmd_pdf_watcher"
  - attached_pdf_path: actual file path
  - metadata: { source: "bmd", folder_monitor: true }
```

**ECG report watcher (new module):**
```python
# workers/report_sender/ecg_email_reader.py
- Monitor ECG email inbox (IMAP/folder)
- Extract report attachment + requisition
- Insert job into report_auto_dispatch_jobs with:
  - service_key: "ecg_email_watcher"
  - attached_pdf_path: extracted/saved path
  - metadata: { source: "ecg", email_monitor: true }
```

### Phase 3: Unified Report Bundling
**Consolidate in report_sender_worker.py:**
```python
def _bundle_all_reports_for_requisition(self, reqno: str):
    """Gather all available reports for a single send"""
    reports = {
        "regular": None,      # From neosoft_api
        "bmd_pdf": None,      # From BMD folder
        "ecg_email": None,    # From ECG inbox
    }
    
    # Fetch from respective sources
    # Combine into single PDF or multi-attachment send
    # Return bundled report payload
```

## Benefits

✓ **No code duplication** - single enqueue/sender codebase on all systems
✓ **Automated detection** - folder/email watches trigger immediately
✓ **Unified dispatch** - single report-enqueue-watch orchestrates all sources
✓ **Combined sends** - one email with all PDFs (regular + BMD + ECG)
✓ **Easier maintenance** - updates deploy everywhere automatically
✓ **Scalable** - new report sources just add new watchers

## Configuration Needed

```json
{
  "enqueue": {
    "bmd_folder_enabled": true,
    "bmd_folder_path": "/mnt/bmd/reports",
    "bmd_poll_interval_seconds": 30,
    
    "ecg_email_enabled": true,
    "ecg_imap_host": "...",
    "ecg_email_poll_interval_seconds": 60,
    
    "bundle_reports": true,
    "attach_all_pdfs_to_single_send": true
  }
}
```

## Timeline Estimate
- Phase 1: 2-4 hours (deployment + config)
- Phase 2: 8-12 hours (write watchers, test)
- Phase 3: 4-6 hours (consolidate bundling logic)
- **Total: 14-22 hours of development + testing**

## Notes
- Reduces duplicate code across BMD/ECG/regular dispatch
- Creates single source of truth for report orchestration
- Enables future expansion (more report sources easily added)
- Integrates with existing py_utils pipeline seamlessly
- Can be done incrementally (Phase 1 alone adds monitoring capability)

## Next Steps
1. Review architecture with team
2. Estimate effort for each phase
3. Prioritize vs other work
4. Plan sprint for implementation
