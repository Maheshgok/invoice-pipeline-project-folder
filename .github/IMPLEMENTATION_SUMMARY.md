# Safe Fail Mechanism Implementation Summary

**Date**: January 19, 2026  
**Status**: ✅ Complete  
**Issue**: Job DD7-D7E218-C5FD got stuck with 0 line items extracted  

## Problem Statement

The job DD7-D7E218-C5FD extracted 0 line items from an invoice image, but:
1. ❌ The pipeline continued processing as if successful
2. ❌ No retry mechanism existed for transient failures
3. ❌ Hard errors (like invalid files) weren't distinguished from soft errors (like unreadable content)
4. ❌ Job status was determined per-line-item instead of at full-invoice level
5. ❌ User saw blank results instead of clear error status

## Solution Implemented

### 1. **Safe Fail Handler Module** (`shared/safe_fail_handler.py`)
A circuit breaker pattern implementation that:
- Classifies errors into **soft** (retryable) vs **hard** (terminal) categories
- Implements exponential backoff retry strategy: 5s → 15s → 45s
- Limits retries to 3 attempts maximum
- Tracks retry attempts and scheduled retry times
- Provides circuit breaker to prevent cascading failures

### 2. **Data Extractor V2 Updates** (`data-extractor-v2/main.py`)
```python
# Check for zero items (soft error)
if line_items_count == 0:
    should_retry, reason = SafeFailHandler.should_retry(job_data, ErrorType.ZERO_ITEMS)
    if should_retry:
        → Status: RETRYING (will be retried after delay)
    else:
        → Status: ERROR (max retries exceeded)
```

### 3. **Enrichment Worker Updates** (`enrichment-worker/main.py`)
```python
# Check if extraction resulted in zero enriched items (soft error)
if len(enriched_items) == 0 and len(line_items) > 0:
    # Soft error: will retry
    → Status: RETRYING
```

### 4. **Orchestrator Service Enhancements** (`orchestrator-service/main.py`)
- **New endpoint**: `POST /jobs/<job_id>/retry`
  - Manually trigger retry for a job
  - Validates retry scheduling time has passed
  
- **New endpoint**: `POST /process-retries`
  - Called every minute by Cloud Scheduler
  - Finds all jobs in RETRYING status with `retry_scheduled_for <= now()`
  - Automatically triggers extraction retry for eligible jobs

### 5. **Job Schema Updates**
Jobs now include retry tracking:
```json
{
  "status": "RETRYING",
  "retry_count": 1,
  "last_error_type": "zero_items",
  "last_error_msg": "No line items extracted",
  "retry_scheduled_for": "2026-01-19T08:00:25Z"
}
```

On ERROR status:
```json
{
  "status": "ERROR",
  "error_type": "zero_items",
  "error_message": "No items after 3 retries",
  "failed_at": "2026-01-19T08:00:20Z",
  "retry_attempts": 3
}
```

### 6. **Cloud Scheduler Setup** (`orchestrator-service/setup-scheduler.sh`)
Automated script to:
- Create Cloud Scheduler job: `invoice-retry-processor`
- Runs every 1 minute
- Calls `orchestrator-service /process-retries`
- Processes all retryable jobs

## Error Classification

### Soft Errors (Retryable)
| Error | Cause | Action |
|-------|-------|--------|
| `ZERO_ITEMS` | No line items extracted | Retry with exponential backoff |
| `UNREADABLE_CONTENT` | Can't read invoice | Retry after delay |
| `EXTRACTION_EMPTY` | Extraction produced no data | Retry after delay |

### Hard Errors (Terminal)
| Error | Cause | Action |
|-------|-------|--------|
| `INVALID_FILETYPE` | Unsupported format | Mark ERROR immediately |
| `FILE_CORRUPTED` | Cannot process file | Mark ERROR immediately |
| `UNAUTHORIZED` | Auth failure | Mark ERROR immediately |
| `SERVER_ERROR` | 5xx errors | Mark ERROR immediately |
| `OPENAI_ERROR` | OpenAI API failure | Mark ERROR immediately |
| `INVALID_REQUEST` | 400 errors | Mark ERROR immediately |

## User Experience Impact

### Before
```
Job uploaded → 0 items extracted → Continues silently
                → Enrichment: 0 items → Standardizer never called
                → data-combiner never called
                → Result: Blank invoice, no error message
                → User sees nothing processed
```

### After
```
Job uploaded → 0 items extracted
  → Status: RETRYING (attempt 1/3)
  → Scheduled retry: 5 seconds
  → [Auto-retry kicks in]
  → [If still 0 items after 3 attempts]
  → Status: ERROR
  → Error Type: ZERO_ITEMS
  → Error Message: "No line items extracted - max retries exceeded"
  → User sees clear error with retry option
```

## Files Modified

1. ✅ `shared/safe_fail_handler.py` - **NEW** Circuit breaker implementation
2. ✅ `shared/job_schema_migration.py` - **NEW** Schema migration guide
3. ✅ `data-extractor-v2/main.py` - Added zero items check + retry logic
4. ✅ `enrichment-worker/main.py` - Added empty enrichment check + retry logic
5. ✅ `orchestrator-service/main.py` - Added `/jobs/<id>/retry` & `/process-retries` endpoints
6. ✅ `orchestrator-service/setup-scheduler.sh` - **NEW** Cloud Scheduler setup script
7. ✅ `.github/SAFE_FAIL_MECHANISM.md` - **NEW** Detailed documentation
8. ✅ `.github/AI_AGENT_GUIDE.md` - Updated with safe fail rules
9. ✅ `.github/copilot-instructions.md` - Updated with safe fail summary

## Deployment Steps

### 1. Deploy shared modules
```bash
# No deployment needed - used by Cloud Run services via import
```

### 2. Deploy updated services
```bash
# Deploy data-extractor-v2 with retry logic
gcloud run deploy data-extractor-v2 --source=data-extractor-v2 --region=asia-south1 --project=watch-mail-trial

# Deploy enrichment-worker with retry logic
gcloud run deploy enrichment-worker --source=enrichment-worker --region=asia-south1 --project=watch-mail-trial

# Deploy orchestrator-service with retry endpoints
gcloud run deploy orchestrator-service --source=orchestrator-service --region=asia-south1 --project=watch-mail-trial
```

### 3. Setup Cloud Scheduler
```bash
bash orchestrator-service/setup-scheduler.sh
```

### 4. Create Firestore composite index (optional but recommended)
For efficient retry job queries:
```bash
gcloud firestore indexes composite create \
  --collection-group=jobs \
  --field-config field-path=status,order=ascending \
  --field-config field-path=retry_scheduled_for,order=ascending \
  --project=watch-mail-trial
```

## Testing Job DD7-D7E218-C5FD

The original job that failed can now:

1. **Manual retry** (immediately):
   ```bash
   curl -X POST https://orchestrator/jobs/DD7-D7E218-C5FD/retry \
     -H "Authorization: Bearer <token>" \
     -H "X-Tenant-ID: gYJ1KMiMyGcWXzv61vINKruX0ix1"
   ```

2. **Auto-retry** (via Cloud Scheduler):
   - Job marked RETRYING with `retry_scheduled_for: 2026-01-19T08:00:25Z`
   - Cloud Scheduler triggers at 08:00:26Z
   - Extraction re-runs automatically

3. **Result**:
   - If image is valid on retry: Job completes successfully
   - If still 0 items after 3 retries: Job marked ERROR with clear message

## Monitoring & Logs

### View job status
```bash
gcloud firestore documents get --document='tenants/tenant123/jobs/DD7-D7E218-C5FD'
```

### View retry logs
```bash
gcloud run services logs read data-extractor-v2 --region=asia-south1 --limit=50 | grep "DD7-D7E218-C5FD"
```

### Check scheduler execution
```bash
gcloud scheduler jobs describe invoice-retry-processor --location=asia-south1 --project=watch-mail-trial
```

## Backward Compatibility

✅ **Fully backward compatible**
- Old jobs without retry fields: `retry_count` defaults to 0
- Existing statuses (EXTRACTED, ENRICHED) continue to work
- New statuses (RETRYING, ERROR) are additions only
- No data migration required

## Future Enhancements

1. **Adaptive retry delays** - Based on error type and time of day
2. **Dead Letter Queue** - Archive permanently failed jobs
3. **Metrics & Alerts** - Track retry success rate, error types
4. **User notifications** - Email/SMS when job is retrying/failed
5. **Manual override** - Admin can force ERROR → COMPLETED
6. **Webhook callbacks** - Notify external systems of status changes

---

**Implementation Complete** ✅  
**Ready for deployment to production**
