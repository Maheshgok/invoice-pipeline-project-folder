from google.cloud import firestore
import datetime
import logging
import os
from typing import Optional, Any, Dict
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from google.api_core.exceptions import DeadlineExceeded, ServiceUnavailable, InternalServerError

logger = logging.getLogger(__name__)

# Initialize Firestore client
db = firestore.Client()

# Collection name from environment variable
COLLECTION_NAME = os.getenv('FIRESTORE_COLLECTION', 'processing_results')

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    retry=retry_if_exception_type((DeadlineExceeded, ServiceUnavailable, InternalServerError)),
    reraise=True
)
def save_invoice_result(request_id: str, object_path: str, extracted_data: Dict[str, Any]) -> None:
    """
    Save successful processing results to Firestore.
    
    Args:
        request_id: Unique identifier for this processing request
        object_path: Path to the processed file in GCS
        extracted_data: The extracted invoice data
        
    Raises:
        Exception: If save fails after retries
    """
    try:
        doc_ref = db.collection(COLLECTION_NAME).document(request_id)
        doc_ref.set({
            "request_id": request_id,
            "object_path": object_path,
            "status": "completed",
            "extracted_data": extracted_data,
            "created_at": firestore.SERVER_TIMESTAMP,
            "processed_at": datetime.datetime.utcnow(),
            "error": None  # Clear any previous error
        }, merge=True)
        
        logger.info(f"Successfully saved results for request_id: {request_id}")
        
    except Exception as e:
        logger.error(f"Error saving results to Firestore: {str(e)}")
        raise

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=10),
    retry=retry_if_exception_type((DeadlineExceeded, ServiceUnavailable, InternalServerError)),
    reraise=True
)
def update_error_status(request_id: str, error_type: str, error_message: str) -> None:
    """
    Update document with error information.
    
    Args:
        request_id: Unique identifier for this processing request
        error_type: Type/category of the error
        error_message: Detailed error message
        
    Raises:
        Exception: If update fails after retries
    """
    try:
        doc_ref = db.collection(COLLECTION_NAME).document(request_id)
        doc_ref.set({
            "request_id": request_id,
            "status": "error",
            "error": {
                "type": error_type,
                "message": error_message,
                "timestamp": datetime.datetime.utcnow()
            },
            "updated_at": firestore.SERVER_TIMESTAMP
        }, merge=True)
        
        logger.error(f"Updated error status for request_id: {request_id}, type: {error_type}")
        
    except Exception as e:
        logger.error(f"Error updating error status in Firestore: {str(e)}")
        raise
