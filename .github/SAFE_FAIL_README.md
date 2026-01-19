# Safe Fail Handler - Implementation Guide

## 📌 Quick Start

**Problem**: Job DD7-D7E218-C5FD extracted 0 line items, but pipeline treated it as success.

**Solution**: Implemented a circuit breaker pattern that:
- ✅ Retries soft errors (zero items, unreadable content) up to 3 times
- ✅ Fails hard errors (invalid files, server errors) immediately
- ✅ Determines job success/failure at FULL INVOICE level (not per line item)
- ✅ Provides clear status: `RETRYING`, `ERROR`, `COMPLETED`

---

## 📂 Files Structure

```
.github/
  ├── SAFE_FAIL_MECHANISM.md         ← Detailed documentation
  ├── IMPLEMENTATION_SUMMARY.md      ← What was implemented
  ├── validate-safe-fail.sh          ← Validation script
  ├── AI_AGENT_GUIDE.md              ← Updated guidelines
  └── copilot-instructions.md        ← Updated instructions

shared/
  ├── safe_fail_handler.py           ← Core circuit breaker
  ├── job_schema_migration.py        ← Schema migration guide
  └── SAFE_FAIL_QUICK_REFERENCE.py   ← Code examples

orchestrator-service/
  ├── main.py                        ← Updated with retry endpoints
  └── setup-scheduler.sh             ← Cloud Scheduler setup

data-extractor-v2/
  └── main.py                        ← Zero items detection + retry

enrichment-worker/
  └── main.py                        ← Empty enrichment check + retry
```

---

## 🚀 Deployment

### 1. Deploy Updated Services
```bash
# Deploy data-extractor-v2 with zero items check
gcloud run deploy data-extractor-v2 \
  --source=data-extractor-v2 \
  --region=asia-south1 \
  --project=watch-mail-trial

# Deploy enrichment-worker with empty enrichment check
gcloud run deploy enrichment-worker \
  --source=enrichment-worker \
  --region=asia-south1 \
  --project=watch-mail-trial

# Deploy orchestrator-service with retry endpoints
gcloud run deploy orchestrator-service \
  --source=orchestrator-service \
  --region=asia-south1 \
  --project=watch-mail-trial
```

### 2. Setup Cloud Scheduler
```bash
bash orchestrator-service/setup-scheduler.sh
```

This creates a scheduled job that:
- Runs every 1 minute
- Finds all jobs with `status=RETRYING` and `retry_scheduled_for <= now()`
- Automatically triggers retry for each

### 3. (Optional) Create Firestore Composite Index
```bash
gcloud firestore indexes composite create \
  --collection-group=jobs \
  --field-config field-path=status,order=ascending \
  --field-config field-path=retry_scheduled_for,order=ascending \
  --project=watch-mail-trial
```

---

## 🧪 Testing

### Test Case 1: Soft Error → Success on Retry
```bash
# 1. Upload image with no readable content
# 2. Observe job status: RETRYING (attempt 1/3)
# 3. Check job.retry_scheduled_for: Should be 5 seconds in future
# 4. After 5 seconds, Cloud Scheduler triggers retry
# 5. Upload same file (or fix it if possible)
# 6. If extraction succeeds on retry: job → COMPLETED
```

### Test Case 2: Soft Error → Hard Fail (Max Retries)
```bash
# 1. Upload image with no readable content
# 2. Observe job status: RETRYING (attempt 1/3)
# 3. Wait 5 seconds → RETRYING (attempt 2/3), retry_scheduled_for = 15s
# 4. Wait 15 seconds → RETRYING (attempt 3/3), retry_scheduled_for = 45s
# 5. Wait 45 seconds → job status: ERROR
# 6. Check error_type: zero_items, error_message: "No items after 3 retries"
```

### Test Case 3: Hard Error → Immediate Failure
```bash
# 1. Upload corrupted/invalid file
# 2. Observe job status: ERROR (no retrying)
# 3. Check error_type: file_corrupted or invalid_filetype
# 4. Verify error_message with details
```

### Validation Script
```bash
bash .github/validate-safe-fail.sh
```

---

## 📊 Job Status Flow

### Soft Error (Retryable)
```
EXTRACTING
    ↓ (0 items detected)
RETRYING (attempt 1/3, delay: 5s)
    ↓ (after 5s, Cloud Scheduler triggers)
EXTRACTING (retry #1)
    ↓ (if success)
EXTRACTED
    ↓ (continue pipeline)
COMPLETED

OR

EXTRACTING (retry #1)
    ↓ (if still 0 items)
RETRYING (attempt 2/3, delay: 15s)
    ↓ (after 15s)
EXTRACTING (retry #2)
    ↓ (if still 0 items)
RETRYING (attempt 3/3, delay: 45s)
    ↓ (after 45s)
EXTRACTING (retry #3)
    ↓ (if still 0 items - MAX RETRIES)
ERROR (error_type: zero_items)
```

### Hard Error (Terminal)
```
EXTRACTING
    ↓ (invalid file detected)
ERROR (error_type: invalid_filetype, no retry)
```

---

## 🔍 Monitoring

### Check Job Status
```bash
# View specific job
gcloud firestore documents get --document='tenants/TENANT_ID/jobs/JOB_ID'

# Example:
# {
#   "status": "RETRYING",
#   "retry_count": 1,
#   "last_error_type": "zero_items",
#   "last_error_msg": "No line items extracted",
#   "retry_scheduled_for": "2026-01-19T08:00:25Z"
# }
```

### View Service Logs
```bash
# Data extractor logs
gcloud run services logs read data-extractor-v2 \
  --region=asia-south1 \
  --limit=50 | grep -E "RETRYING|SOFT ERROR|HARD FAIL"

# Check for specific job
gcloud run services logs read data-extractor-v2 \
  --region=asia-south1 \
  --limit=100 | grep "JOB_ID"
```

### Monitor Cloud Scheduler
```bash
# Check last execution
gcloud scheduler jobs describe invoice-retry-processor \
  --location=asia-south1 \
  --project=watch-mail-trial \
  --format='value(lastExecutionTime)'

# View execution history
gcloud scheduler jobs runs list invoice-retry-processor \
  --location=asia-south1 \
  --project=watch-mail-trial
```

---

## 🛠️ Manual Retry

To manually trigger retry for a specific job:

```bash
curl -X POST https://orchestrator-812016027146.asia-south1.run.app/jobs/DD7-D7E218-C5FD/retry \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H "X-Tenant-ID: gYJ1KMiMyGcWXzv61vINKruX0ix1" \
  -H "Content-Type: application/json"
```

Response:
```json
{
  "success": true,
  "job_id": "DD7-D7E218-C5FD",
  "status": "EXTRACTING",
  "attempt": 2
}
```

---

## 📝 Implementation Details

### Error Classification

**Soft Errors** (retryable):
- `ZERO_ITEMS` - No line items extracted
- `UNREADABLE_CONTENT` - Cannot read invoice
- `EXTRACTION_EMPTY` - No usable extraction data

**Hard Errors** (terminal):
- `INVALID_FILETYPE` - Unsupported file format
- `FILE_CORRUPTED` - Cannot process file
- `UNAUTHORIZED` - Authentication failure
- `SERVER_ERROR` - 5xx HTTP errors
- `OPENAI_ERROR` - OpenAI API failure
- `INVALID_REQUEST` - 400 HTTP errors

### Retry Policy
- **Max retries**: 3
- **Delay schedule**: 5s → 15s → 45s (exponential backoff)
- **Reset on success**: retry_count resets to 0 when job succeeds

### Job Schema Changes

New fields added to job document:
```json
{
  "retry_count": 1,
  "last_error_type": "zero_items",
  "last_error_msg": "No line items extracted",
  "retry_scheduled_for": "2026-01-19T08:00:25Z"
}
```

On ERROR status:
```json
{
  "error_type": "zero_items",
  "error_message": "No items after 3 retries",
  "failed_at": "2026-01-19T08:00:20Z",
  "retry_attempts": 3
}
```

---

## ⚙️ Configuration

Located in `shared/safe_fail_handler.py`:

```python
class SafeFailHandler:
    MAX_RETRIES = 3              # Maximum 3 attempts
    RETRY_DELAYS = [5, 15, 45]   # Delays in seconds
    
class PipelineCircuitBreaker:
    failure_threshold = 5        # Open circuit after 5 failures
    recovery_timeout = 60        # Attempt recovery after 60s
```

To modify, edit these values and redeploy services.

---

## 🔧 Troubleshooting

### Job stuck in RETRYING
1. Check `retry_scheduled_for` timestamp
2. Verify Cloud Scheduler is enabled: `gcloud scheduler jobs describe invoice-retry-processor`
3. Check orchestrator logs: `gcloud run services logs read orchestrator-service`
4. Manually retry: `curl -X POST /jobs/{id}/retry`

### Job marked ERROR but should retry
1. Check `last_error_type` - if hard error (file_corrupted, etc.), by design won't retry
2. Check `retry_count` - if >= 3, max retries exceeded
3. Review error message for details

### Cloud Scheduler not executing
```bash
# Enable Cloud Scheduler API
gcloud services enable cloudscheduler.googleapis.com --project=watch-mail-trial

# Recreate scheduler
bash orchestrator-service/setup-scheduler.sh
```

---

## 📚 Documentation

- **SAFE_FAIL_MECHANISM.md** - Complete technical documentation
- **IMPLEMENTATION_SUMMARY.md** - What was changed and why
- **SAFE_FAIL_QUICK_REFERENCE.py** - Code examples and patterns
- **AI_AGENT_GUIDE.md** - Guidelines for developers using this pattern

---

## ✅ Validation

Run validation script to ensure all components are in place:

```bash
bash .github/validate-safe-fail.sh
```

Output:
```
✅ Safe fail handler module
✅ Data extractor imports safe fail handler
✅ Data extractor checks for zero items
✅ Enrichment worker imports safe fail handler
...
📊 Validation Results:
  Passed: 18
  Failed: 0
```

---

## 🚦 Next Steps

1. **Deploy** the three updated services
2. **Setup** Cloud Scheduler
3. **Verify** with validation script
4. **Test** with sample invoices
5. **Monitor** job status and logs
6. **Document** any issues or enhancements

---

**Implementation Date**: January 19, 2026  
**Status**: ✅ Ready for Production  
**Questions?** See `.github/SAFE_FAIL_MECHANISM.md` for detailed docs
