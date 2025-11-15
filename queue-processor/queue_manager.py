"""
Queue Management System
Handles the 4 lists: pending, inprocess, done, failed
Ensures FIFO processing with retry logic
"""
import threading
import time
import logging
from datetime import datetime
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, asdict
from collections import deque

logger = logging.getLogger(__name__)

@dataclass
class QueueJob:
    job_id: str
    bucket_path: str
    user_email: str
    created_at: datetime
    retry_count: int = 0
    error_message: Optional[str] = None
    result: Optional[Dict[str, Any]] = None

class QueueManager:
    """
    Manages job queues with proper FIFO processing and retry logic
    - pending: New jobs waiting to be processed
    - inprocess: Currently being processed (only 1 at a time)
    - done: Successfully completed jobs
    - failed: Failed jobs (after all retry attempts)
    """
    
    def __init__(self):
        self.pending_jobs: deque = deque()
        self.inprocess_jobs: List[QueueJob] = []
        self.done_jobs: List[QueueJob] = []
        self.failed_jobs: List[QueueJob] = []
        
        # Track results sent to frontend (job_id -> timestamp)
        self.sent_results: Dict[str, datetime] = {}
        
        self.lock = threading.Lock()
        self.max_retries = 1  # One retry attempt per job
        
        logger.info("Queue Manager initialized")

    def add_job(self, job: QueueJob) -> None:
        """Add a new job to pending queue"""
        with self.lock:
            self.pending_jobs.append(job)
            logger.info(f"Added job {job.job_id} to pending queue. Queue size: {len(self.pending_jobs)}")

    def get_next_job(self) -> Optional[QueueJob]:
        """
        Get next job to process (FIFO with retry logic)
        1. First try pending jobs
        2. Then try failed jobs that haven't reached max retries
        """
        with self.lock:
            # First priority: pending jobs
            if self.pending_jobs:
                job = self.pending_jobs.popleft()
                self.inprocess_jobs.append(job)
                logger.info(f"Retrieved pending job {job.job_id} for processing")
                return job
            
            # Second priority: failed jobs for retry
            retry_candidates = [job for job in self.failed_jobs if job.retry_count < self.max_retries]
            if retry_candidates:
                job = retry_candidates[0]  # FIFO for retries too
                self.failed_jobs.remove(job)
                job.retry_count += 1
                self.inprocess_jobs.append(job)
                logger.info(f"Retrieved failed job {job.job_id} for retry (attempt {job.retry_count})")
                return job
            
            return None

    def complete_job(self, job: QueueJob, success: bool, result: Optional[Dict] = None, error: Optional[str] = None) -> None:
        """Mark job as completed (success or failure)"""
        with self.lock:
            # Remove from inprocess
            if job in self.inprocess_jobs:
                self.inprocess_jobs.remove(job)
            
            if success:
                job.result = result
                self.done_jobs.append(job)
                logger.info(f"Job {job.job_id} completed successfully")
            else:
                job.error_message = error
                if job.retry_count >= self.max_retries:
                    # Permanently failed
                    self.failed_jobs.append(job)
                    logger.error(f"Job {job.job_id} permanently failed after {job.retry_count} attempts: {error}")
                else:
                    # Add back to failed for retry
                    self.failed_jobs.append(job)
                    logger.warning(f"Job {job.job_id} failed (attempt {job.retry_count}), will retry: {error}")

    def get_completed_jobs_for_user(self, user_email: str) -> List[QueueJob]:
        """Get completed jobs for a user that haven't been sent to frontend yet"""
        with self.lock:
            completed_jobs = []
            for job in self.done_jobs:
                if job.user_email == user_email and job.job_id not in self.sent_results:
                    completed_jobs.append(job)
            return completed_jobs

    def get_failed_jobs_for_user(self, user_email: str) -> List[QueueJob]:
        """Get permanently failed jobs for a user that haven't been sent to frontend yet"""
        with self.lock:
            failed_jobs = []
            for job in self.failed_jobs:
                if (job.user_email == user_email and 
                    job.retry_count >= self.max_retries and 
                    job.job_id not in self.sent_results):
                    failed_jobs.append(job)
            return failed_jobs

    def mark_result_sent(self, job_id: str) -> None:
        """Mark a job result as sent to frontend (ensures at-most-once delivery)"""
        with self.lock:
            self.sent_results[job_id] = datetime.now()
            logger.info(f"Marked job {job_id} result as sent to frontend")

    def get_queue_status(self) -> Dict[str, Any]:
        """Get current status of all queues"""
        with self.lock:
            return {
                "pending": len(self.pending_jobs),
                "inprocess": len(self.inprocess_jobs),
                "done": len(self.done_jobs),
                "failed": len([job for job in self.failed_jobs if job.retry_count >= self.max_retries]),
                "retrying": len([job for job in self.failed_jobs if job.retry_count < self.max_retries]),
                "sent_results": len(self.sent_results),
                "pending_jobs": [job.job_id for job in self.pending_jobs],
                "inprocess_jobs": [job.job_id for job in self.inprocess_jobs],
                "done_jobs": [job.job_id for job in self.done_jobs],
                "failed_jobs": [job.job_id for job in self.failed_jobs if job.retry_count >= self.max_retries]
            }

    def is_processing_available(self) -> bool:
        """Check if we can process a new job (only 1 at a time)"""
        with self.lock:
            return len(self.inprocess_jobs) == 0

    def has_pending_work(self) -> bool:
        """Check if there's any work to be done"""
        with self.lock:
            return (len(self.pending_jobs) > 0 or 
                   len([job for job in self.failed_jobs if job.retry_count < self.max_retries]) > 0)

    def get_job_status(self, job_id: str, user_email: str) -> Optional[Dict]:
        """Get status of a specific job for a user"""
        with self.lock:
            # Search all job lists for the job
            all_jobs = list(self.pending_jobs) + list(self.inprocess_jobs) + list(self.done_jobs) + list(self.failed_jobs)
            
            for job in all_jobs:
                if job.job_id == job_id and job.user_email == user_email:
                    # Determine current status
                    if job in self.pending_jobs:
                        status = "pending"
                        progress = 0.0
                    elif job in self.inprocess_jobs:
                        status = "processing"
                        progress = 0.5  # Halfway through
                    elif job in self.done_jobs:
                        status = "completed"
                        progress = 1.0
                    elif job in self.failed_jobs:
                        if job.retry_count < self.max_retries:
                            status = "retrying"
                            progress = 0.0
                        else:
                            status = "failed"
                            progress = 1.0
                    else:
                        status = "unknown"
                        progress = 0.0
                    
                    response = {
                        "job_id": job.job_id,
                        "status": status,
                        "progress": progress,
                        "created_at": job.created_at.isoformat(),
                        "retry_count": job.retry_count,
                        "user_email": job.user_email
                    }
                    
                    # Include result data for completed jobs
                    if status == "completed" and job.result:
                        response["result"] = job.result
                    
                    # Include error message for failed jobs  
                    if status == "failed" and job.error_message:
                        response["error_message"] = job.error_message
                    
                    return response
            
            return None  # Job not found or access denied