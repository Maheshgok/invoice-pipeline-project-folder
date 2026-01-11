"""
Processing Tracker Module
Tracks processing metrics and timing for monitoring
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class ProcessingTracker:
    """Tracks processing metrics and timing"""
    
    def __init__(self):
        self.logger = logging.getLogger(self.__class__.__name__)
        self.processing_starts: Dict[str, datetime] = {}
        self.processing_stats = {
            'total_processed': 0,
            'successful': 0,
            'failed': 0,
            'average_processing_time': 0.0,
            'last_processed': None
        }
        
        self.logger.info("Processing Tracker initialized")
    
    def track_start(self, job_id: str, bucket_path: str, user_email: str, source: str):
        """Track the start of processing"""
        start_time = datetime.now()
        self.processing_starts[job_id] = start_time
        
        self.logger.info(f"📊 Tracking start for job {job_id}")
        self.logger.debug(f"📁 Path: {bucket_path}")
        self.logger.debug(f"👤 User: {user_email}")
        self.logger.debug(f"🔍 Source: {source}")
        self.logger.debug(f"⏰ Started at: {start_time.isoformat()}")
    
    def track_completion(self, job_id: str, success: bool, result_data: Optional[Any] = None, 
                        error_message: Optional[str] = None):
        """Track the completion of processing"""
        end_time = datetime.now()
        
        # Calculate processing time
        start_time = self.processing_starts.get(job_id)
        processing_time = None
        
        if start_time:
            processing_time = (end_time - start_time).total_seconds()
            # Clean up start time tracking
            del self.processing_starts[job_id]
        
        # Update statistics
        self.processing_stats['total_processed'] += 1
        if success:
            self.processing_stats['successful'] += 1
        else:
            self.processing_stats['failed'] += 1
        
        # Update average processing time
        if processing_time:
            current_avg = self.processing_stats['average_processing_time']
            total_processed = self.processing_stats['total_processed']
            self.processing_stats['average_processing_time'] = (
                (current_avg * (total_processed - 1) + processing_time) / total_processed
            )
        
        self.processing_stats['last_processed'] = end_time.isoformat()
        
        # Log completion
        status = "SUCCESS" if success else "FAILED"
        self.logger.info(f"📊 Tracking completion for job {job_id}: {status}")
        if processing_time:
            self.logger.info(f"⏱️ Processing time: {processing_time:.2f} seconds")
        
        if not success and error_message:
            self.logger.error(f"❌ Error: {error_message}")
        
        if success and result_data:
            # Log basic result info without sensitive data
            data_keys = list(result_data.keys()) if isinstance(result_data, dict) else []
            self.logger.info(f"📋 Result contains: {', '.join(data_keys[:5])}...")
    
    def get_processing_time(self, job_id: str) -> Optional[float]:
        """Get processing time for a specific job"""
        start_time = self.processing_starts.get(job_id)
        if start_time:
            return (datetime.now() - start_time).total_seconds()
        return None
    
    def get_stats(self) -> Dict[str, Any]:
        """Get current processing statistics"""
        # Add currently processing jobs count
        currently_processing = len(self.processing_starts)
        
        # Calculate success rate
        total = self.processing_stats['total_processed']
        success_rate = (self.processing_stats['successful'] / total * 100) if total > 0 else 0
        
        return {
            **self.processing_stats,
            'currently_processing': currently_processing,
            'success_rate_percent': round(success_rate, 2),
            'uptime_start': datetime.now().isoformat(),
            'active_jobs': list(self.processing_starts.keys())
        }
    
    def cleanup_stale_jobs(self, timeout_minutes: int = 30):
        """Clean up jobs that have been processing for too long"""
        cutoff_time = datetime.now() - timedelta(minutes=timeout_minutes)
        stale_jobs = []
        
        for job_id, start_time in list(self.processing_starts.items()):
            if start_time < cutoff_time:
                stale_jobs.append(job_id)
                del self.processing_starts[job_id]
                self.logger.warning(f"🧹 Cleaned up stale job: {job_id} (started {start_time})")
        
        return stale_jobs