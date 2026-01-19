# Retry Strategy - Self-Healing Pipeline (No Cloud Scheduler Needed)

> **TL;DR:** Services retry failures IN-PROCESS with exponential backoff. No need for external job queues or schedulers.

## Why This Approach?

### ❌ OLD: Cloud Scheduler Queries All Jobs
```
POST /process-retries
  ↓
Query collection group 'jobs' for status=RETRYING
  ↓
Requires composite index
  ↓
Worker timeout issues
  ↓
Expensive queries at scale
```

### ✅ NEW: Self-Healing In-Process
```
data-extractor-v2: 0 items extracted
  ↓
SafeFailHandler.retry_with_backoff()
  ↓
Wait 5s → Retry immediately
  ↓
If success: Continue pipeline
If fail: Wait 15s → Retry
  ↓
If fail: Wait 45s → Retry
  ↓
If fail: Mark as ERROR, DONE
```

## How It Works

### 1. **Service Detects Soft Error**
```python
line_items = extracted_data.get('line_items_raw', [])
if len(line_items) == 0:
    # Soft error detected - will retry
```

### 2. **Immediate Retry with Backoff**
```python
from shared.safe_fail_handler import SafeFailHandler

success, result, error = SafeFailHandler.retry_with_backoff(
    extraction_func=lambda: call_openai_vision(job_data),
    job_id=job_id,
    max_retries=3  # Default: 3 retries
)

if success:
    # Continue pipeline
    pass
else:
    # Mark as ERROR, log failure
    mark_job_as_error(error)
```

### 3. **Why This Works**
- ✅ No external job tracking needed
- ✅ Retries happen in same execution context
- ✅ No index required
- ✅ No Cloud Scheduler needed
- ✅ Timeout-safe (retries are local, not network calls)
- ✅ Scales infinitely (each instance handles own retries)

## Configuration

Edit `shared/safe_fail_handler.py`:
```python
class SafeFailHandler:
    MAX_RETRIES = 3
    RETRY_DELAYS = [5, 15, 45]  # seconds
```

## Soft Errors (Retried)
- `ZERO_ITEMS` - No line items extracted
- `UNREADABLE_CONTENT` - Can't read invoice
- `EXTRACTION_EMPTY` - Extraction returned empty

## Hard Errors (Terminal)
- `INVALID_FILETYPE` - Unsupported format
- `FILE_CORRUPTED` - Can't process file
- `UNAUTHORIZED` - Auth failure
- `SERVER_ERROR` - 5xx errors
- `OPENAI_ERROR` - API failure

## Migration Plan

### Phase 1: Add In-Process Retries (Optional - Parallel with Cloud Scheduler)
1. Add `retry_with_backoff()` to SafeFailHandler ✅ (done)
2. Update services to use it when soft errors detected
3. Keep Cloud Scheduler disabled until ready

### Phase 2: Remove Cloud Scheduler (When Satisfied)
1. Delete Cloud Scheduler job: `gcloud scheduler jobs delete invoice-retry-processor`
2. Remove `/process-retries` endpoint (optional, keep as health check)
3. Celebrate! 🎉

## Example Implementation

### data-extractor-v2
```python
@app.route('/extract', methods=['POST'])
def extract_invoice():
    try:
        # Retry extraction if it returns 0 items
        success, result, error = SafeFailHandler.retry_with_backoff(
            extraction_func=lambda: extract_with_openai_vision(gcs_path),
            job_id=job_id,
            max_retries=3
        )
        
        if not success:
            # Mark job as ERROR
            job_ref.update({
                'status': 'ERROR',
                'error_type': 'ZERO_ITEMS',
                'error_message': error
            })
            return jsonify({'success': False, 'error': error}), 400
        
        # Continue with pipeline
        enrich_job(job_id)
        return jsonify({'success': True, 'line_items': result})
        
    except Exception as e:
        logger.error(f"❌ Extraction failed: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
```

## Benefits Over Scheduled Retries

| Aspect | Cloud Scheduler | In-Process |
|--------|-----------------|-----------|
| **Query Cost** | High (query all jobs) | None |
| **Index Required** | Yes | No |
| **Scalability** | Limited | Unlimited |
| **Latency** | Up to 60s delay | Immediate |
| **Complexity** | High | Low |
| **Failure Rate** | Higher | Lower |
| **Operations** | Complex | Simple |

## Monitoring

All retries logged with prefix `🔄`:
```
🔄 Extraction attempt 1/4 for job DD7-123
🔄 Extraction attempt 2/4 for job DD7-123  
🔄 Extraction attempt 3/4 for job DD7-123
❌ All 4 extraction attempts failed for job DD7-123
```

Parse Cloud Logs for `🔄` to see retry metrics.

## When to Use Each

### ✅ Use In-Process Retries (Recommended)
- Transient errors (OCR failed to read, OpenAI timeout)
- Quick recovery expected (5-45s)
- Don't need external job tracking
- Want simplicity

### ✅ Use Cloud Scheduler (If Needed)
- Long-running jobs that need delayed processing
- Scheduled batch operations
- Want to decouple retry from main pipeline
- Need job state preserved across restarts

## Future Enhancements

1. **Metrics**: Track retry success rate by error type
2. **Backoff Strategy**: Implement exponential + jitter
3. **Circuit Breaker**: Detect if service is down, fail faster
4. **Dead Letter Queue**: Failed jobs to separate collection for debugging
5. **Analytics**: Dashboard showing retry patterns

---

**Status**: ✅ Recommended approach for invoice processing pipeline
**Implementation**: Ready (see `SafeFailHandler.retry_with_backoff()`)
**Deployment**: Pending service updates to use new method
