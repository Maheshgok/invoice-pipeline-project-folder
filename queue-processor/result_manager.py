"""
Result Management System
Handles storing and retrieving results with at-least-once, at-most-once delivery
"""
import os
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from google.cloud import firestore
from queue_manager import QueueJob

logger = logging.getLogger(__name__)

class ResultManager:
    """
    Manages result storage and delivery to frontend
    Ensures each result is delivered exactly once
    """
    
    def __init__(self):
        # Explicitly set project ID for watch-mail-trial
        project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
        self.firestore_client = firestore.Client(project=project_id)
        logger.info(f"Result Manager initialized with project: {project_id}")

    def store_result(self, job: QueueJob, success: bool, result_data: Optional[Dict] = None, error: Optional[str] = None) -> bool:
        """
        Store job result in Firestore
        Returns: True if stored successfully, False otherwise
        """
        try:
            doc_ref = self.firestore_client.collection('invoice_results').document(job.job_id)
            
            # Base document data
            doc_data = {
                'job_id': job.job_id,
                'user_email': job.user_email,
                'bucket_path': job.bucket_path,
                'created_at': job.created_at.isoformat() if hasattr(job.created_at, 'isoformat') else str(job.created_at),
                'updated_at': datetime.now().isoformat(),
                'retry_count': job.retry_count
            }
            
            if success:
                # Sanitize result_data to ensure it's Firestore-compatible
                logger.info(f"BEFORE SANITIZATION - Original result data: {result_data}")
                logger.info(f"BEFORE SANITIZATION - Type: {type(result_data)}")
                
                sanitized_result = self._sanitize_for_firestore(result_data)
                
                logger.info(f"AFTER SANITIZATION - Sanitized result: {sanitized_result}")
                logger.info(f"AFTER SANITIZATION - Type: {type(sanitized_result)}")
                
                doc_data.update({
                    'status': 'completed',
                    'result': sanitized_result,
                    'completed_at': datetime.now().isoformat()
                })
                
                logger.info(f"FINAL DOCUMENT DATA TO FIRESTORE: {doc_data}")
                logger.info(f"Storing successful result for job {job.job_id}")
            else:
                doc_data.update({
                    'status': 'failed',
                    'error': error,
                    'failed_at': datetime.now().isoformat()
                })
                logger.info(f"Storing failed result for job {job.job_id}: {error}")
            
            doc_ref.set(doc_data)
            return True
            
        except Exception as e:
            logger.error(f"Error storing result for job {job.job_id}: {e}")
            return False

    def get_results_for_user(self, user_email: str, completed_jobs: List[QueueJob], failed_jobs: List[QueueJob]) -> List[Dict[str, Any]]:
        """
        Get results for completed and failed jobs from Firestore
        Returns: List of result dictionaries
        """
        results = []
        
        # Get completed job results
        for job in completed_jobs:
            try:
                doc_ref = self.firestore_client.collection('invoice_results').document(job.job_id)
                doc = doc_ref.get()
                
                if doc.exists:
                    doc_data = doc.to_dict()
                    results.append({
                        "job_id": job.job_id,
                        "bucket_path": job.bucket_path,
                        "status": "completed",
                        "result": doc_data.get('result'),
                        "completed_at": doc_data.get('completed_at'),
                        "retry_count": doc_data.get('retry_count', 0)
                    })
                else:
                    logger.warning(f"No Firestore document found for completed job {job.job_id}")
                    
            except Exception as e:
                logger.error(f"Error retrieving result for job {job.job_id}: {e}")
        
        # Get failed job results
        for job in failed_jobs:
            try:
                doc_ref = self.firestore_client.collection('invoice_results').document(job.job_id)
                doc = doc_ref.get()
                
                if doc.exists:
                    doc_data = doc.to_dict()
                    results.append({
                        "job_id": job.job_id,
                        "bucket_path": job.bucket_path,
                        "status": "failed",
                        "error": doc_data.get('error'),
                        "failed_at": doc_data.get('failed_at'),
                        "retry_count": doc_data.get('retry_count', 0)
                    })
                else:
                    logger.warning(f"No Firestore document found for failed job {job.job_id}")
                    
            except Exception as e:
                logger.error(f"Error retrieving failed result for job {job.job_id}: {e}")
        
        return results

    def cleanup_old_results(self, days_old: int = 30) -> int:
        """
        Clean up results older than specified days
        Returns: Number of documents deleted
        """
        try:
            cutoff_date = datetime.now() - timedelta(days=days_old)
            
            # Query old documents
            old_docs = self.firestore_client.collection('invoice_results').where(
                'created_at', '<', cutoff_date
            ).stream()
            
            deleted_count = 0
            for doc in old_docs:
                doc.reference.delete()
                deleted_count += 1
            
            logger.info(f"Cleaned up {deleted_count} old result documents")
            return deleted_count
            
        except Exception as e:
            logger.error(f"Error cleaning up old results: {e}")
            return 0
    
    def _sanitize_for_firestore(self, data):
        """
        Sanitize data to ensure it's compatible with Firestore
        Converts complex nested objects to simple types
        """
        if data is None:
            return None  # Firestore handles null values properly
        
        if isinstance(data, dict):
            sanitized = {}
            for key, value in data.items():
                # Convert keys to strings and sanitize values
                clean_key = str(key)
                # Firestore doesn't allow certain characters in field names
                clean_key = clean_key.replace('.', '_').replace('$', '_').replace('/', '_')
                sanitized_value = self._sanitize_for_firestore(value)
                sanitized[clean_key] = sanitized_value
            return sanitized
        
        elif isinstance(data, list):
            # Check if this is a nested array (array of arrays) like extracted_table
            if data and isinstance(data[0], list):
                # Convert array of arrays to a flattened string representation
                # This handles the extracted_table case specifically
                try:
                    flattened_rows = []
                    for row in data[:50]:  # Limit to first 50 rows
                        if isinstance(row, list):
                            # Join row elements with | separator, handle empty strings
                            cleaned_row = [str(cell).strip() if cell else "N/A" for cell in row]
                            row_string = " | ".join(cleaned_row)
                            if row_string.strip():  # Only add non-empty rows
                                flattened_rows.append(row_string)
                    return flattened_rows  # Return list of strings instead of nested arrays
                except Exception as e:
                    logger.warning(f"Error flattening nested array: {e}")
                    return str(data)[:1000]  # Fallback to string representation
            else:
                # Regular array handling
                if len(data) > 100:
                    data = data[:100]  # Truncate large lists
                sanitized_list = []
                for item in data:
                    sanitized_item = self._sanitize_for_firestore(item)
                    sanitized_list.append(sanitized_item)
                return sanitized_list
        
        elif isinstance(data, str):
            # Handle empty strings and long strings
            if data == "":
                return None  # Convert empty string to null
            if len(data) > 10000:
                return data[:10000] + "... (truncated)"
            return data
            
        elif isinstance(data, (int, float, bool)):
            return data
        
        elif isinstance(data, datetime):
            return data.isoformat()
        
        elif hasattr(data, '__dict__'):
            # Handle objects with attributes by converting to dict
            return self._sanitize_for_firestore(data.__dict__)
        
        elif hasattr(data, '_asdict'):
            # Handle namedtuples
            return self._sanitize_for_firestore(data._asdict())
        
        else:
            # Convert other types to string representation
            str_repr = str(data)
            if len(str_repr) > 1000:
                str_repr = str_repr[:1000] + "... (truncated)"
            return str_repr if str_repr != "None" else None