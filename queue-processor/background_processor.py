"""
Background Processing Engine
Continuously processes jobs one at a time with proper error handling
"""
import threading
import time
import logging
from queue_manager import QueueManager
from openai_processor import OpenAIProcessor
from result_manager import ResultManager

logger = logging.getLogger(__name__)

class BackgroundProcessor:
    """
    Runs in background thread, processing jobs one at a time
    Handles the complete workflow: queue -> process -> store -> mark complete
    """
    
    def __init__(self, queue_manager: QueueManager, openai_processor: OpenAIProcessor, result_manager: ResultManager):
        self.queue_manager = queue_manager
        self.openai_processor = openai_processor
        self.result_manager = result_manager
        
        self.running = False
        self.processor_thread = None
        self.process_interval = 1.0  # Check for new jobs every second
        
        logger.info("Background Processor initialized")

    def start(self):
        """Start the background processing thread"""
        if not self.running:
            self.running = True
            self.processor_thread = threading.Thread(target=self._process_loop, daemon=True)
            self.processor_thread.start()
            logger.info("Background processing started")
        else:
            logger.warning("Background processor already running")

    def stop(self):
        """Stop the background processing thread"""
        self.running = False
        if self.processor_thread:
            self.processor_thread.join(timeout=5.0)
        logger.info("Background processing stopped")

    def _process_loop(self):
        """Main processing loop - runs continuously in background"""
        while self.running:
            try:
                # Only process if we can (no job currently in process)
                if self.queue_manager.is_processing_available():
                    # Get next job to process
                    job = self.queue_manager.get_next_job()
                    
                    if job:
                        self._process_single_job(job)
                    else:
                        # No jobs available, wait a bit
                        time.sleep(self.process_interval)
                else:
                    # Processing is busy, wait a bit
                    time.sleep(self.process_interval)
                    
            except Exception as e:
                logger.error(f"Unexpected error in processing loop: {e}")
                time.sleep(self.process_interval)

    def _process_single_job(self, job):
        """Process a single job through the complete workflow"""
        logger.info(f"Starting processing of job {job.job_id}")
        
        try:
            # Step 1: Process with OpenAI
            result = self.openai_processor.process_image(job.bucket_path)
            
            if result["success"]:
                # Step 2: Store successful result
                stored = self.result_manager.store_result(job, True, result["data"])
                
                if stored:
                    # Step 3: Mark job as completed
                    self.queue_manager.complete_job(job, True, result["data"])
                    logger.info(f"Successfully completed job {job.job_id}")
                else:
                    # Storage failed, treat as job failure
                    error_msg = "Failed to store result in Firestore"
                    self.queue_manager.complete_job(job, False, error=error_msg)
                    logger.error(f"Job {job.job_id} failed due to storage error")
            else:
                # Step 2: Store failed result
                stored = self.result_manager.store_result(job, False, error=result["error"])
                
                # Step 3: Mark job as failed (will trigger retry if eligible)
                self.queue_manager.complete_job(job, False, error=result["error"])
                logger.warning(f"Job {job.job_id} failed: {result['error']}")
                
        except Exception as e:
            # Unexpected error during processing
            error_msg = f"Unexpected processing error: {str(e)}"
            logger.error(f"Job {job.job_id} failed with unexpected error: {e}")
            
            try:
                # Try to store the error
                self.result_manager.store_result(job, False, error=error_msg)
            except:
                logger.error(f"Failed to store error result for job {job.job_id}")
            
            # Mark job as failed
            self.queue_manager.complete_job(job, False, error=error_msg)

    def get_processing_stats(self):
        """Get current processing statistics"""
        return {
            "running": self.running,
            "thread_alive": self.processor_thread.is_alive() if self.processor_thread else False,
            "queue_status": self.queue_manager.get_queue_status()
        }