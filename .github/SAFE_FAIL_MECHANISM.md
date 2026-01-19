# Safe Fail Handler - Circuit Breaker Implementation

## Overview

Implements a job-level (invoice-level) error handling and retry mechanism for the pipeline to prevent cascading failures and improve resilience.

## Key Principles

1. **Job Success/Failure at FULL INVOICE LEVEL** - Not per line item
2. **Soft Errors (Retryable)** - Indicate transient issues, should be retried
3. **Hard Errors (Terminal)** - Indicate permanent issues, should fail immediately
4. **Automatic Retry** - Up to 3 retries with exponential backoff
5. **Clear Status Tracking** - Users see `RETRYING`, `ERROR`, etc.

## Error Classification

### Soft Errors (Retryable)
These indicate the invoice might be processable on retry:
- **ZERO_ITEMS** - No line items extracted from image
- **UNREADABLE_CONTENT** - Cannot read invoice content
- **EXTRACTION_EMPTY** - Extraction result has no usable data

**Behavior:**
- Job status → `RETRYING`
- Scheduled for retry after delay: 5s → 15s → 45s
- Max 3 attempts total
- On success: retry_count resets to 0
- On max retries exceeded: status → `ERROR`

### Hard Errors (Terminal)
These indicate permanent failure:
- **INVALID_FILETYPE** - Unsupported file format
- **FILE_CORRUPTED** - Cannot process file
- **UNAUTHORIZED** - Authentication failure
- **SERVER_ERROR** - 5xx errors
- **OPENAI_ERROR** - OpenAI API failure
- **INVALID_REQUEST** - 400 errors

**Behavior:**
- Job status → `ERROR`
- No retry attempted
- error_type and error_message stored
- User sees detailed error

## Job Status Flow

```
CREATED
  ↓
EXTRACTING → ZERO_ITEMS detected
  ↓
RETRYING (scheduled for 5s)
  ↓ (after delay)
EXTRACTING (retry #1)
  ↓
[Success: EXTRACTED] OR [ZERO_ITEMS again]
  ↓
RETRYING (scheduled for 15s)
  ↓ (after delay)
EXTRACTING (retry #2)
  ↓
[Success: EXTRACTED] OR [Max retries exceeded]
  ↓
ERROR (with error_type: ZERO_ITEMS)
```

## Implementation Details

### Data Structure

Job document now includes:
```json
{
  "status": "RETRYING",
  "retry_count": 1,
  "last_error_type": "zero_items",
  "last_error_msg": "No line items extracted",
  "retry_scheduled_for": "2026-01-19T08:00:25Z",
  "error_type": "zero_items",      // Only on ERROR status
  "error_message": "...",           // Only on ERROR status
  "failed_at": "2026-01-19T08:00:20Z"  // Only on ERROR status
}
```

### Retry Endpoints

#### POST `/jobs/<job_id>/retry`
Triggered by Cloud Scheduler or manual retry:
```bash
curl -X POST https://orchestrator/jobs/DD7-D7E218-C5FD/retry \
  -H "Authorization: Bearer <token>" \
  -H "X-Tenant-ID: tenant123"
```

Response: `202 Accepted` if scheduled retry is ready, `429 Too Early` if not yet time

### Pipeline Integration Points

#### 1. data-extractor-v2 (`/extract`)
```python
if line_items_count == 0:
    should_retry, reason = SafeFailHandler.should_retry(job_data, ErrorType.ZERO_ITEMS)
    if should_retry:
        # → RETRYING status
    else:
        # → ERROR status
```

#### 2. enrichment-worker (`/enrich-job`)
```python
if len(enriched_items) == 0 and len(line_items) > 0:
    should_retry, reason = SafeFailHandler.should_retry(job_data, ErrorType.EXTRACTION_EMPTY)
    # Similar logic...
```

#### 3. orchestrator-service (`/jobs/<job_id>/retry`)
Re-triggers extraction when scheduled retry time arrives

## Configuration

Located in `shared/safe_fail_handler.py`:

```python
class SafeFailHandler:
    MAX_RETRIES = 3
    RETRY_DELAYS = [5, 15, 45]  # seconds between retries
```

To modify retry policy, edit `RETRY_DELAYS` list.

## Frontend Integration

### Job Status UI Updates

Show appropriate UI for each status:

```typescript
switch (job.status) {
  case 'RETRYING':
    return `Retrying... (attempt ${job.retry_count}/3)
            Scheduled: ${formatTime(job.retry_scheduled_for)}`;
  
  case 'ERROR':
    return `Error: ${job.error_type}
            ${job.error_message}
            
            Actions: [Manual Retry] [View Details]`;
  
  case 'EXTRACTING':
  case 'ENRICHING':
  case 'STANDARDIZING':
    return `Processing... ${getProgress(job.status)}%`;
}
```

### Manual Retry Trigger

Allow users to manually retry on ERROR status:

```typescript
async function manualRetry(jobId: string) {
  const response = await fetch(`/api/jobs/${jobId}/retry`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'X-Tenant-ID': tenantId
    }
  });
  
  if (response.ok) {
    showToast('Job retrying... will be processed shortly', 'info');
  }
}
```

## Monitoring & Logging

Each service logs with prefixes for easy debugging:

```
🔄 RETRYING: Zero items - will retry (attempt 1/3)
❌ HARD FAIL: Max retries exceeded for ZERO_ITEMS
⚠️ SOFT ERROR: Zero items extracted for job DD7-D7E218-C5FD
🟡 Circuit HALF-OPEN: data-extractor-v2 attempting recovery
🔴 Circuit OPEN: enrichment-worker (will retry in 45s)
```

## Testing

### Test Case 1: Soft Error → Success on Retry
1. Upload image with no readable content
2. Verify job → RETRYING status
3. After 5s, verify extraction is retried
4. Provide different image that works
5. Verify job → EXTRACTED status

### Test Case 2: Soft Error → Hard Error (Max Retries)
1. Upload image with no readable content
2. Verify job → RETRYING (attempt 1/3)
3. Wait and verify retry #2, #3
4. After 3 retries, verify job → ERROR status
5. Verify error_type: `ZERO_ITEMS`

### Test Case 3: Hard Error → Immediate Failure
1. Upload corrupted/invalid file
2. Verify job → ERROR status (no retrying)
3. Verify error_type: `FILE_CORRUPTED`

### Test Case 4: Extraction Empty After Enrichment
1. Items extracted but enrichment fails
2. Verify job → RETRYING status
3. On retry, verify full flow re-starts

## Migration Notes

### Backward Compatibility
- Old status values (`EXTRACTED`, `ENRICHED`, etc.) still work
- New statuses (`RETRYING`, `ERROR`) are additions
- Existing job documents without retry fields work fine (treated as retry_count=0)

### Firestore Schema Change
Run this script to backfill existing jobs:
```python
# No schema migration needed - fields are optional
# Jobs created before this feature won't have retry_count
# They'll be treated as if retry_count=0
```

## Circuit Breaker Pattern

Additional feature: Prevents cascading failures when a service is down.

```python
from safe_fail_handler import circuit_breaker

# Record failures
circuit_breaker.record_failure('data-extractor-v2')

# Check if service is down
if circuit_breaker.is_open('data-extractor-v2'):
    # Skip this call, mark job as RETRYING
    job_ref.update(SafeFailHandler.build_retry_update(...))
else:
    # Service is available, proceed
    call_extractor()

# Record success
circuit_breaker.record_success('data-extractor-v2')
```

Threshold: 5 consecutive failures
Recovery timeout: 60 seconds

## Future Enhancements

1. **Exponential backoff with jitter** - Prevent thundering herd
2. **Adaptive retry delays** - Based on failure type
3. **Dead Letter Queue** - For jobs that fail permanently
4. **Metrics & Alerts** - Track retry rates, failure types
5. **Manual override** - Admin can force ERROR → COMPLETED
6. **User notification** - Email/SMS when job is retrying/failed
