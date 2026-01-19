"""
Safe Fail Handler - Circuit Breaker for Invoice Processing Pipeline

Implements job-level success/failure logic:
- Soft errors (retryable): Zero items, unreadable content → Mark as RETRYABLE
- Hard errors (terminal): Invalid filetype, server errors → Mark as ERROR
- Job status is determined at FULL INVOICE level, not per line item

Retry Policy:
- Max 3 retries for soft errors
- Exponential backoff: 5s, 15s, 45s
- Hard errors fail immediately
"""

import logging
from enum import Enum
import time
from typing import Dict, Tuple, Optional
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class ErrorType(Enum):
    """Classification of pipeline errors"""
    # Soft errors (retryable)
    ZERO_ITEMS = "zero_items"  # No line items extracted
    UNREADABLE_CONTENT = "unreadable_content"  # Can't read invoice
    EXTRACTION_EMPTY = "extraction_empty"  # Empty extraction result
    
    # Hard errors (terminal)
    INVALID_FILETYPE = "invalid_filetype"  # Unsupported file format
    FILE_CORRUPTED = "file_corrupted"  # Can't process file
    UNAUTHORIZED = "unauthorized"  # Auth failure
    RATE_LIMITED = "rate_limited"  # API rate limit (after retries)
    SERVER_ERROR = "server_error"  # 5xx errors
    OPENAI_ERROR = "openai_error"  # OpenAI API failure
    INVALID_REQUEST = "invalid_request"  # 400 errors


class SafeFailHandler:
    """
    Determines if a job should be retried or marked as failed.
    Implements circuit breaker pattern for pipeline resilience.
    """
    
    # Configuration
    MAX_RETRIES = 3
    RETRY_DELAYS = [5, 15, 45]  # seconds between retries
    
    # Soft error types that can be retried
    RETRYABLE_ERRORS = {
        ErrorType.ZERO_ITEMS,
        ErrorType.UNREADABLE_CONTENT,
        ErrorType.EXTRACTION_EMPTY,
    }
    
    # Hard error types that cause immediate failure
    TERMINAL_ERRORS = {
        ErrorType.INVALID_FILETYPE,
        ErrorType.FILE_CORRUPTED,
        ErrorType.UNAUTHORIZED,
        ErrorType.SERVER_ERROR,
        ErrorType.OPENAI_ERROR,
        ErrorType.INVALID_REQUEST,
    }
    
    @staticmethod
    def classify_error(error_msg: str, status_code: Optional[int] = None) -> ErrorType:
        """
        Classify error message into ErrorType.
        
        Args:
            error_msg: Error message/description
            status_code: HTTP status code (if applicable)
        
        Returns:
            ErrorType classification
        """
        msg_lower = error_msg.lower()
        
        # Check for specific error patterns
        if "zero" in msg_lower and "items" in msg_lower:
            return ErrorType.ZERO_ITEMS
        if "no items" in msg_lower or "empty extraction" in msg_lower:
            return ErrorType.ZERO_ITEMS
        if "unreadable" in msg_lower or "cannot read" in msg_lower:
            return ErrorType.UNREADABLE_CONTENT
        if "unsupported" in msg_lower or "invalid" in msg_lower and "type" in msg_lower:
            return ErrorType.INVALID_FILETYPE
        if "corrupted" in msg_lower or "invalid file" in msg_lower:
            return ErrorType.FILE_CORRUPTED
        if "unauthorized" in msg_lower or "403" in msg_lower:
            return ErrorType.UNAUTHORIZED
        if "rate limit" in msg_lower or "429" in msg_lower:
            return ErrorType.RATE_LIMITED
        if "openai" in msg_lower or "api" in msg_lower and "error" in msg_lower:
            return ErrorType.OPENAI_ERROR
        
        # Check HTTP status codes
        if status_code:
            if 400 <= status_code < 500:
                if status_code == 429:
                    return ErrorType.RATE_LIMITED
                elif status_code == 401 or status_code == 403:
                    return ErrorType.UNAUTHORIZED
                else:
                    return ErrorType.INVALID_REQUEST
            elif status_code >= 500:
                return ErrorType.SERVER_ERROR
        
        # Default to server error
        return ErrorType.SERVER_ERROR
    
    @staticmethod
    def should_retry(
        job_data: Dict,
        error_type: ErrorType,
        current_attempt: int = 0
    ) -> Tuple[bool, str]:
        """
        Determine if job should be retried.
        
        Args:
            job_data: Current job document from Firestore
            error_type: Classified error type
            current_attempt: Current retry attempt (0-based)
        
        Returns:
            (should_retry: bool, reason: str)
        """
        # Check if error is retryable
        if error_type not in SafeFailHandler.RETRYABLE_ERRORS:
            return False, f"Hard error: {error_type.value} - marking as ERROR"
        
        # Check retry limit
        retry_count = job_data.get('retry_count', 0)
        if retry_count >= SafeFailHandler.MAX_RETRIES:
            return False, f"Max retries ({SafeFailHandler.MAX_RETRIES}) reached for {error_type.value}"
        
        # Soft error within retry limit
        return True, f"Soft error: {error_type.value} - will retry (attempt {retry_count + 1}/{SafeFailHandler.MAX_RETRIES})"
    
    @staticmethod
    def get_next_retry_delay(retry_count: int) -> int:
        """
        Get delay in seconds before next retry (exponential backoff).
        
        Args:
            retry_count: Number of retries already attempted
        
        Returns:
            Delay in seconds
        """
        if retry_count < len(SafeFailHandler.RETRY_DELAYS):
            return SafeFailHandler.RETRY_DELAYS[retry_count]
        # After all configured retries, wait 60s
        return 60
    
    @staticmethod
    def get_next_retry_timestamp(retry_count: int) -> str:
        """
        Calculate next retry timestamp.
        
        Args:
            retry_count: Number of retries already attempted
        
        Returns:
            ISO format timestamp
        """
        delay = SafeFailHandler.get_next_retry_delay(retry_count)
        next_time = datetime.utcnow() + timedelta(seconds=delay)
        return next_time.isoformat()
    
    @staticmethod
    def build_retry_update(
        error_type: ErrorType,
        error_msg: str,
        retry_count: int
    ) -> Dict:
        """
        Build Firestore update dict for retry state.
        
        Returns:
            Update dict with retry metadata
        """
        return {
            'status': 'RETRYING',
            'retry_count': retry_count + 1,
            'last_error_type': error_type.value,
            'last_error_msg': error_msg[:500],  # Truncate long errors
            'retry_scheduled_for': SafeFailHandler.get_next_retry_timestamp(retry_count),
            'updated_at': datetime.utcnow().isoformat()
        }
    
    @staticmethod
    def build_error_update(
        error_type: ErrorType,
        error_msg: str,
        retry_count: int = 0
    ) -> Dict:
        """
        Build Firestore update dict for terminal failure.
        
        Returns:
            Update dict with error metadata
        """
        return {
            'status': 'ERROR',
            'error_type': error_type.value,
            'error_message': error_msg[:500],  # Truncate long errors
            'retry_attempts': retry_count,
            'failed_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }
    
    @staticmethod
    def validate_job_completion(line_items: list, error_occurred: bool = False) -> Tuple[bool, str]:
        """
        Validate if job has enough data to be considered complete.
        Job success is determined at FULL INVOICE level, not per line item.
        
        Args:
            line_items: List of extracted/enriched line items
            error_occurred: Whether an error occurred during processing
        
        Returns:
            (can_complete: bool, reason: str)
        """
        # If error occurred, cannot complete successfully
        if error_occurred:
            return False, "Error occurred during processing"
        
        # Job must have at least one line item
        if not line_items or len(line_items) == 0:
            return False, "No line items extracted - requires retry or mark as error"
        
        # At least one item has valid data
        has_valid_data = any(
            item.get('description') or 
            item.get('amount') or 
            item.get('hsn_code')
            for item in line_items
        )
        
        if not has_valid_data:
            return False, "No valid line item data found"
        
        return True, "Job has sufficient data for completion"


class PipelineCircuitBreaker:
    """
    Implements circuit breaker for pipeline stages.
    Prevents cascading failures when a service is down.
    """
    
    def __init__(self):
        self.failure_count = {}
        self.last_failure_time = {}
        self.failure_threshold = 5
        self.recovery_timeout = 60  # seconds
    
    def record_failure(self, service_name: str):
        """Record a failure for a service"""
        self.failure_count[service_name] = self.failure_count.get(service_name, 0) + 1
        self.last_failure_time[service_name] = datetime.utcnow()
        logger.warning(f"⚠️ Circuit breaker: {service_name} failure #{self.failure_count[service_name]}")
    
    def is_open(self, service_name: str) -> bool:
        """Check if circuit is open (service unavailable)"""
        if service_name not in self.failure_count:
            return False
        
        # Check if threshold exceeded
        if self.failure_count[service_name] >= self.failure_threshold:
            # Check if recovery timeout has passed
            last_time = self.last_failure_time[service_name]
            elapsed = (datetime.utcnow() - last_time).total_seconds()
            if elapsed < self.recovery_timeout:
                logger.error(f"🔴 Circuit OPEN: {service_name} (will retry in {self.recovery_timeout - elapsed:.0f}s)")
                return True
            else:
                # Timeout passed, try to recover
                self.failure_count[service_name] = 0
                logger.info(f"🟡 Circuit HALF-OPEN: {service_name} attempting recovery")
                return False
        
        return False
    
    @staticmethod
    def retry_with_backoff(
        extraction_func,
        job_id: str,
        max_retries: int = 3,
        retry_delays: list = None
    ) -> Tuple[bool, any, Optional[str]]:
        """
        Retry a function with exponential backoff IN-PROCESS.
        No need for Cloud Scheduler or job state updates.
        
        Args:
            extraction_func: Function to call (should accept job_id)
            job_id: Job ID for logging
            max_retries: Number of retries (default 3)
            retry_delays: Delays between retries in seconds (default [5, 15, 45])
        
        Returns:
            (success: bool, result: any, error_msg: str or None)
        
        Example:
            success, result, error = SafeFailHandler.retry_with_backoff(
                lambda: call_extractor(job_data),
                job_id='DD7-123',
                max_retries=3
            )
        """
        if retry_delays is None:
            retry_delays = SafeFailHandler.RETRY_DELAYS
        
        last_error = None
        
        for attempt in range(max_retries + 1):  # +1 for initial attempt
            try:
                logger.info(f"🔄 Extraction attempt {attempt + 1}/{max_retries + 1} for job {job_id}")
                result = extraction_func()
                
                if result and result.get('success'):
                    logger.info(f"✅ Extraction succeeded on attempt {attempt + 1} for job {job_id}")
                    return True, result, None
                
                last_error = result.get('error', 'Unknown error') if result else 'Empty result'
                logger.warning(f"⚠️ Extraction returned result but not marked success: {last_error}")
                
            except Exception as e:
                last_error = str(e)
                logger.error(f"❌ Extraction attempt {attempt + 1} failed: {last_error}")
            
            # If not the last attempt, wait before retrying
            if attempt < max_retries:
                wait_seconds = retry_delays[attempt] if attempt < len(retry_delays) else retry_delays[-1]
                logger.info(f"⏳ Waiting {wait_seconds}s before retry #{attempt + 2} for job {job_id}")
                time.sleep(wait_seconds)
        
        # All retries exhausted
        logger.error(f"❌ All {max_retries + 1} extraction attempts failed for job {job_id}: {last_error}")
        return False, None, last_error



# Global circuit breaker instance
circuit_breaker = PipelineCircuitBreaker()
