"""
Result Management System
Handles storing and retrieving results with at-least-once, at-most-once delivery
"""
import os
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from google.cloud import firestore

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
    
    def _compute_status_category(self, status: str) -> str:
        """
        Compute status category for efficient server-side filtering
        """
        if status in ['queued', 'processing']:
            return 'active'
        elif status == 'completed':
            return 'recent'  # Will be updated to 'displayed' by frontend
        else:
            return 'old'
    
    def _compute_priority_score(self, status: str) -> int:
        """
        Compute priority score for efficient ordering
        Higher score = higher priority
        """
        import time
        base_score = int(time.time())
        
        if status == 'processing':
            return base_score + 1000  # Highest priority
        elif status == 'queued':
            return base_score + 500   # High priority
        else:
            return base_score         # Normal priority
    
    def _compute_display_tier(self, status: str) -> int:
        """
        Compute display tier for UI optimization
        1=active, 2=recent, 3=archive
        """
        if status in ['queued', 'processing']:
            return 1  # Active tier - real-time display
        elif status == 'completed':
            return 2  # Recent tier - recent completions
        else:
            return 3  # Archive tier - old/failed items

    def store_result(self, job_id: str, user_email: str, extracted_data: Dict, status: str, bucket_path: str, error: Optional[str] = None, user_uid: str = None, organization_id: str = None) -> bool:
        """
        Store job result in Firestore with organization-aware collection routing
        Returns: True if stored successfully, False otherwise
        """
        try:
            # Determine the appropriate collection path based on organization context
            collection_path = self._get_collection_path(user_uid, organization_id)
            doc_ref = self.firestore_client.collection(collection_path).document(job_id)
            
            # Base document data with optimization fields and proper indexing
            doc_data = {
                'job_id': job_id,
                'user_email': user_email,
                'userUID': user_uid,  # For user-based filtering
                'organizationId': organization_id,  # For organization-based filtering
                'bucket_path': bucket_path,
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat(),
                # ⚙️ Performance optimization fields
                'status_category': self._compute_status_category(status),
                'priority_score': self._compute_priority_score(status),
                'display_tier': self._compute_display_tier(status),
                'frontend_status': None,  # Will be set by frontend when displayed
                'processing_mode': 'cloud_tasks',  # Track processing mode
                # 🏢 Multi-tenant fields for proper data isolation
                'tenant_type': 'organization' if organization_id else 'user',
                'access_scope': 'organization' if organization_id else 'user'
            }
            
            if status == 'completed':
                # Sanitize result_data to ensure it's Firestore-compatible
                logger.info(f"BEFORE SANITIZATION - Original result data: {extracted_data}")
                sanitized_result = self._sanitize_for_firestore(extracted_data)
                logger.info(f"AFTER SANITIZATION - Sanitized result: {sanitized_result}")
                
                doc_data.update({
                    'status': 'completed',
                    'result': sanitized_result,
                    'completed_at': datetime.now().isoformat()
                })
                
                logger.info(f"Storing successful result for job {job_id}")
            else:
                doc_data.update({
                    'status': status,
                    'error': error,
                    'failed_at': datetime.now().isoformat()
                })
                logger.info(f"Storing failed result for job {job_id}: {error}")
            
            doc_ref.set(doc_data)
            return True
            
        except Exception as e:
            logger.error(f"Error storing result for job {job_id}: {e}")
            return False

    def store_result_legacy(self, job: Any, success: bool, result_data: Optional[Dict] = None, error: Optional[str] = None) -> bool:
        """
        Store job result in Firestore
        Returns: True if stored successfully, False otherwise
        """
        try:
            doc_ref = self.firestore_client.collection('invoice_results').document(job.job_id)
            
            # Base document data with optimization fields
            status = 'completed' if success else 'failed'
            doc_data = {
                'job_id': job.job_id,
                'user_email': job.user_email,
                'bucket_path': job.bucket_path,
                'created_at': job.created_at.isoformat() if hasattr(job.created_at, 'isoformat') else str(job.created_at),
                'updated_at': datetime.now().isoformat(),
                'retry_count': job.retry_count,
                # ⚙️ Performance optimization fields
                'status_category': self._compute_status_category(status),
                'priority_score': self._compute_priority_score(status),
                'display_tier': self._compute_display_tier(status),
                'frontend_status': None  # Will be set by frontend when displayed
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

    def get_results_for_user(self, user_email: str, completed_jobs: List[Any], failed_jobs: List[Any]) -> List[Dict[str, Any]]:
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

    def get_latest_results_for_user(self, user_email: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get latest results for a user (Cloud Tasks compatible)
        Returns: List of result dictionaries ordered by creation time
        """
        try:
            # Query for user's results, ordered by creation time (newest first)
            query = self.firestore_client.collection('invoice_results').where(
                'user_email', '==', user_email
            ).order_by('created_at', direction=firestore.Query.DESCENDING).limit(limit)
            
            docs = query.stream()
            results = []
            
            for doc in docs:
                doc_data = doc.to_dict()
                result = {
                    "job_id": doc_data.get('job_id'),
                    "bucket_path": doc_data.get('bucket_path'),
                    "status": doc_data.get('status', 'unknown'),
                    "created_at": doc_data.get('created_at'),
                    "updated_at": doc_data.get('updated_at'),
                    "processing_mode": doc_data.get('processing_mode', 'legacy')
                }
                
                # Add result-specific fields based on status
                if doc_data.get('status') == 'completed':
                    result.update({
                        "result": doc_data.get('result'),
                        "completed_at": doc_data.get('completed_at')
                    })
                elif doc_data.get('status') == 'failed':
                    result.update({
                        "error": doc_data.get('error'),
                        "failed_at": doc_data.get('failed_at')
                    })
                
                results.append(result)
            
            logger.info(f"Retrieved {len(results)} latest results for user {user_email}")
            return results
            
        except Exception as e:
            logger.error(f"Error getting latest results for user {user_email}: {e}")
            return []

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