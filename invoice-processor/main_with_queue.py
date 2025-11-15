"""
Enhanced invoice processor with built-in queuing and rate limiting
"""
import os
import json
import time
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from dataclasses import dataclass
from collections import deque
import threading
from flask import Flask, request, jsonify
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class ProcessingTask:
    job_id: str
    bucket_path: str
    user_email: str
    priority: str = 'normal'
    created_at: datetime = None
    retries: int = 0
    max_retries: int = 3

    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.utcnow()

class InvoiceProcessingQueue:
    def __init__(self, max_concurrent=2, rate_limit_per_minute=10):
        self.max_concurrent = max_concurrent
        self.rate_limit_per_minute = rate_limit_per_minute
        self.queue = deque()
        self.processing = {}  # job_id -> task
        self.user_rate_limits = {}  # user_email -> [timestamps]
        self.results = {}  # job_id -> result
        self.lock = threading.Lock()
        self.processing_thread = None
        self.running = False
        
    def start_processing(self):
        """Start the background processing thread"""
        if not self.running:
            self.running = True
            self.processing_thread = threading.Thread(target=self._process_queue)
            self.processing_thread.daemon = True
            self.processing_thread.start()
            logger.info("Processing queue started")
    
    def stop_processing(self):
        """Stop the background processing"""
        self.running = False
        if self.processing_thread:
            self.processing_thread.join()
    
    def can_user_submit(self, user_email: str) -> bool:
        """Check if user can submit new tasks (rate limiting)"""
        now = datetime.utcnow()
        cutoff = now - timedelta(minutes=1)
        
        with self.lock:
            if user_email not in self.user_rate_limits:
                self.user_rate_limits[user_email] = []
            
            # Clean old timestamps
            self.user_rate_limits[user_email] = [
                ts for ts in self.user_rate_limits[user_email] if ts > cutoff
            ]
            
            return len(self.user_rate_limits[user_email]) < self.rate_limit_per_minute
    
    def add_task(self, task: ProcessingTask) -> bool:
        """Add a task to the queue"""
        if not self.can_user_submit(task.user_email):
            logger.warning(f"Rate limit exceeded for user {task.user_email}")
            return False
        
        with self.lock:
            # Add timestamp for rate limiting
            if task.user_email not in self.user_rate_limits:
                self.user_rate_limits[task.user_email] = []
            self.user_rate_limits[task.user_email].append(datetime.utcnow())
            
            # Add to queue (priority queue logic could be added here)
            if task.priority == 'high':
                self.queue.appendleft(task)
            else:
                self.queue.append(task)
            
            logger.info(f"Task {task.job_id} added to queue for user {task.user_email}")
            return True
    
    def get_status(self, job_id: str) -> Dict[str, Any]:
        """Get the status of a job"""
        with self.lock:
            if job_id in self.results:
                return {
                    'status': 'completed',
                    'result': self.results[job_id]
                }
            elif job_id in self.processing:
                return {
                    'status': 'processing',
                    'message': 'Invoice is being processed'
                }
            else:
                # Check if it's in queue
                for task in self.queue:
                    if task.job_id == job_id:
                        position = list(self.queue).index(task) + 1
                        return {
                            'status': 'queued',
                            'queue_position': position,
                            'estimated_wait_minutes': position * 2  # Rough estimate
                        }
                
                return {
                    'status': 'not_found',
                    'message': 'Job not found'
                }
    
    def _process_queue(self):
        """Background thread to process the queue"""
        from openai_client import extract_invoice_from_image
        from storage_utils import download_file
        from firestore_utils import save_invoice_result
        
        while self.running:
            try:
                # Check if we can start new processing
                with self.lock:
                    can_process = (
                        len(self.processing) < self.max_concurrent and 
                        len(self.queue) > 0
                    )
                    
                    if can_process:
                        task = self.queue.popleft()
                        self.processing[task.job_id] = task
                    else:
                        task = None
                
                if task:
                    logger.info(f"Starting processing for job {task.job_id}")
                    try:
                        # Download file
                        bucket_name = os.getenv('BUCKET_NAME', 'ocr-invoice-raw-files-bucket')
                        file_bytes = download_file(bucket_name, task.bucket_path)
                        
                        # Process with OpenAI
                        result = extract_invoice_from_image(file_bytes)
                        
                        # Save result
                        save_invoice_result(task.job_id, {
                            'status': 'completed',
                            'result': result,
                            'processed_at': datetime.utcnow().isoformat(),
                            'user_email': task.user_email
                        })
                        
                        # Store in memory for quick access
                        with self.lock:
                            self.results[task.job_id] = result
                            del self.processing[task.job_id]
                        
                        logger.info(f"Completed processing for job {task.job_id}")
                        
                    except Exception as e:
                        logger.error(f"Error processing job {task.job_id}: {str(e)}")
                        
                        # Retry logic
                        task.retries += 1
                        if task.retries <= task.max_retries:
                            with self.lock:
                                self.queue.append(task)  # Add back to queue
                                del self.processing[task.job_id]
                        else:
                            # Max retries reached
                            error_result = {
                                'status': 'failed',
                                'error': str(e),
                                'retries': task.retries
                            }
                            save_invoice_result(task.job_id, error_result)
                            
                            with self.lock:
                                self.results[task.job_id] = error_result
                                del self.processing[task.job_id]
                
                # Sleep to prevent busy waiting
                time.sleep(1)
                
            except Exception as e:
                logger.error(f"Error in processing queue: {str(e)}")
                time.sleep(5)

# Global queue instance
processing_queue = InvoiceProcessingQueue(
    max_concurrent=2,  # Process 2 invoices simultaneously
    rate_limit_per_minute=5  # 5 requests per user per minute
)

app = Flask(__name__)

@app.route('/process-invoice', methods=['POST'])
def queue_processing():
    """Queue an invoice for processing"""
    try:
        data = request.get_json()
        job_id = data.get('job_id')
        bucket_path = data.get('bucket_path')
        user_email = data.get('user_email', 'unknown')
        priority = data.get('priority', 'normal')
        
        if not job_id or not bucket_path:
            return jsonify({'error': 'Missing job_id or bucket_path'}), 400
        
        task = ProcessingTask(
            job_id=job_id,
            bucket_path=bucket_path,
            user_email=user_email,
            priority=priority
        )
        
        if processing_queue.add_task(task):
            return jsonify({
                'status': 'queued',
                'job_id': job_id,
                'message': 'Invoice queued for processing'
            })
        else:
            return jsonify({
                'error': 'Rate limit exceeded',
                'message': 'Too many requests. Please try again later.'
            }), 429
            
    except Exception as e:
        logger.error(f"Error queuing job: {str(e)}")
        return jsonify({'error': 'Failed to queue processing'}), 500

@app.route('/status/<job_id>', methods=['GET'])
def get_job_status(job_id):
    """Get the status of a processing job"""
    try:
        status = processing_queue.get_status(job_id)
        return jsonify(status)
    except Exception as e:
        logger.error(f"Error getting status for {job_id}: {str(e)}")
        return jsonify({'error': 'Failed to get job status'}), 500

@app.route('/queue/stats', methods=['GET'])
def get_queue_stats():
    """Get queue statistics"""
    with processing_queue.lock:
        return jsonify({
            'queue_length': len(processing_queue.queue),
            'processing_count': len(processing_queue.processing),
            'total_results': len(processing_queue.results)
        })

if __name__ == '__main__':
    # Start the processing queue
    processing_queue.start_processing()
    
    try:
        app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
    finally:
        processing_queue.stop_processing()