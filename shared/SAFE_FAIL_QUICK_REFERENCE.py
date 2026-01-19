#!/usr/bin/env python3
"""
Quick Reference: Safe Fail Handler Usage

How to implement safe fail logic in pipeline services
"""

# ============================================================================
# 1. IMPORT THE HANDLER
# ============================================================================

from safe_fail_handler import SafeFailHandler, ErrorType, circuit_breaker

# ============================================================================
# 2. CLASSIFY ERRORS
# ============================================================================

# Automatic classification from error message
error_type = SafeFailHandler.classify_error(
    error_msg="Cannot read invoice content",
    status_code=None
)
# Returns: ErrorType.UNREADABLE_CONTENT

# Or from HTTP status code
error_type = SafeFailHandler.classify_error(
    error_msg="Invalid file format",
    status_code=415
)
# Returns: ErrorType.INVALID_FILETYPE

# ============================================================================
# 3. CHECK IF SHOULD RETRY
# ============================================================================

job_ref = db.collection('tenants').document(tenant_id)\
            .collection('jobs').document(job_id)
job_doc = job_ref.get()
job_data = job_doc.to_dict() if job_doc.exists else {}

should_retry, reason = SafeFailHandler.should_retry(
    job_data=job_data,
    error_type=ErrorType.ZERO_ITEMS,
    current_attempt=job_data.get('retry_count', 0)
)

if should_retry:
    print(f"🔄 {reason}")
else:
    print(f"❌ {reason}")

# ============================================================================
# 4. UPDATE JOB FOR RETRY
# ============================================================================

if should_retry:
    retry_update = SafeFailHandler.build_retry_update(
        error_type=ErrorType.ZERO_ITEMS,
        error_msg="No line items extracted - will retry",
        retry_count=job_data.get('retry_count', 0)
    )
    job_ref.update(retry_update)
    
    # Result:
    # {
    #   'status': 'RETRYING',
    #   'retry_count': 1,
    #   'last_error_type': 'zero_items',
    #   'last_error_msg': 'No line items extracted - will retry',
    #   'retry_scheduled_for': '2026-01-19T08:00:25Z',
    #   'updated_at': '2026-01-19T08:00:20Z'
    # }

# ============================================================================
# 5. UPDATE JOB FOR TERMINAL FAILURE
# ============================================================================

else:
    error_update = SafeFailHandler.build_error_update(
        error_type=ErrorType.ZERO_ITEMS,
        error_msg="No line items after 3 retries",
        retry_count=job_data.get('retry_count', 0)
    )
    job_ref.update(error_update)
    
    # Result:
    # {
    #   'status': 'ERROR',
    #   'error_type': 'zero_items',
    #   'error_message': 'No line items after 3 retries',
    #   'retry_attempts': 3,
    #   'failed_at': '2026-01-19T08:00:20Z',
    #   'updated_at': '2026-01-19T08:00:20Z'
    # }

# ============================================================================
# 6. GET NEXT RETRY DELAY
# ============================================================================

delay_seconds = SafeFailHandler.get_next_retry_delay(
    retry_count=job_data.get('retry_count', 0)
)
# Returns: 5, 15, 45, 60 (depending on attempt number)

# ============================================================================
# 7. VALIDATE JOB COMPLETION (FULL INVOICE LEVEL)
# ============================================================================

can_complete, reason = SafeFailHandler.validate_job_completion(
    line_items=extracted_items,
    error_occurred=error_flag
)

if can_complete:
    job_ref.update({'status': 'EXTRACTED', 'updated_at': datetime.utcnow().isoformat()})
else:
    print(f"Cannot complete: {reason}")
    # Returns reasons like:
    # - "No line items extracted - requires retry or mark as error"
    # - "No valid line item data found"

# ============================================================================
# 8. USE CIRCUIT BREAKER FOR SERVICE FAILURE DETECTION
# ============================================================================

# Record a failure when service call fails
try:
    response = requests.post(
        f"{SERVICE_URL}/endpoint",
        json=payload,
        timeout=30
    )
    if response.ok:
        circuit_breaker.record_success('service-name')
    else:
        circuit_breaker.record_failure('service-name')
except Exception as e:
    circuit_breaker.record_failure('service-name')

# Check if service is down (circuit open)
if circuit_breaker.is_open('service-name'):
    # Service is experiencing issues
    # Mark job as RETRYING instead of failing
    job_ref.update(SafeFailHandler.build_retry_update(...))
else:
    # Service is available or recovering
    # Proceed with call
    pass  # Add your service call here

# ============================================================================
# COMPLETE EXAMPLE: data-extractor-v2
# ============================================================================

@app.route('/extract', methods=['POST'])
def extract_invoice():
    try:
        # ... extraction logic ...
        
        line_items = extracted_data.get('line_items_raw', [])
        
        if len(line_items) == 0:
            # 🚨 SOFT ERROR: Zero items
            job_ref = db.collection('tenants').document(tenant_id)\
                        .collection('jobs').document(job_id)
            job_doc = job_ref.get()
            job_data = job_doc.to_dict() if job_doc.exists else {}
            
            should_retry, reason = SafeFailHandler.should_retry(
                job_data,
                ErrorType.ZERO_ITEMS,
                job_data.get('retry_count', 0)
            )
            
            if should_retry:
                logger.warning(f"⚠️ SOFT ERROR: {reason}")
                retry_update = SafeFailHandler.build_retry_update(
                    ErrorType.ZERO_ITEMS,
                    "No line items extracted",
                    job_data.get('retry_count', 0)
                )
                job_ref.update(retry_update)
                return jsonify({'status': 'RETRYING'}), 202
            else:
                logger.error(f"❌ HARD FAIL: {reason}")
                error_update = SafeFailHandler.build_error_update(
                    ErrorType.ZERO_ITEMS,
                    "No items - max retries exceeded",
                    job_data.get('retry_count', 0)
                )
                job_ref.update(error_update)
                return jsonify({'status': 'ERROR'}), 400
        
        # SUCCESS: Reset retry count
        job_ref.update({
            'status': 'EXTRACTED',
            'retry_count': 0,  # ✅ Reset on success
            'updated_at': datetime.utcnow().isoformat()
        })
        
        return jsonify({'status': 'EXTRACTED', 'items': len(line_items)})
        
    except Exception as e:
        # 🚨 HARD ERROR: Exception
        job_ref = db.collection('tenants').document(tenant_id)\
                    .collection('jobs').document(job_id)
        job_data = job_ref.get().to_dict() if job_ref.get().exists else {}
        
        error_type = SafeFailHandler.classify_error(str(e), status_code=500)
        error_update = SafeFailHandler.build_error_update(
            error_type,
            str(e),
            job_data.get('retry_count', 0)
        )
        job_ref.update(error_update)
        
        return jsonify({'error': str(e), 'status': 'ERROR'}), 500

# ============================================================================
# ERROR CLASSIFICATION REFERENCE
# ============================================================================

"""
SOFT ERRORS (will retry):
  ErrorType.ZERO_ITEMS
  ErrorType.UNREADABLE_CONTENT
  ErrorType.EXTRACTION_EMPTY

HARD ERRORS (terminal):
  ErrorType.INVALID_FILETYPE
  ErrorType.FILE_CORRUPTED
  ErrorType.UNAUTHORIZED
  ErrorType.RATE_LIMITED
  ErrorType.SERVER_ERROR
  ErrorType.OPENAI_ERROR
  ErrorType.INVALID_REQUEST

Configuration:
  MAX_RETRIES = 3
  RETRY_DELAYS = [5, 15, 45]  # seconds
  Circuit Breaker Threshold = 5 failures
  Circuit Breaker Recovery = 60 seconds
"""

# ============================================================================
# LOGGING PATTERNS
# ============================================================================

"""
Use consistent logging for easy debugging:

🔄 RETRYING: Zero items - will retry (attempt 1/3)
   Scheduled: 2026-01-19T08:00:25Z

❌ HARD FAIL: Max retries exceeded for ZERO_ITEMS

⚠️ SOFT ERROR: Zero items extracted for job DD7-D7E218-C5FD

🟡 Circuit HALF-OPEN: data-extractor-v2 attempting recovery

🔴 Circuit OPEN: enrichment-worker (will retry in 45s)

✅ Circuit CLOSED: data-extractor-v2 recovered
"""
