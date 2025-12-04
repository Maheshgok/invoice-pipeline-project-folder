"""
Cloud Tasks Handler Module
Handles Cloud Tasks callbacks and request validation
Separated from business logic for better modularity
"""
import logging
from flask import request, jsonify
from datetime import datetime
import firebase_admin
from firebase_admin import auth as firebase_auth

logger = logging.getLogger(__name__)

class CloudTasksHandler:
    """Handles Cloud Tasks specific logic and authentication"""
    
    def __init__(self):
        self.logger = logging.getLogger(self.__class__.__name__)
    
    def verify_auth_token(self, auth_header):
        """Verify Firebase ID token and return user email"""
        if not auth_header or not auth_header.startswith('Bearer '):
            raise ValueError("Missing or invalid authorization token")
        
        id_token_str = auth_header.split(' ')[1]
        
        try:
            # Verify Firebase ID token
            decoded_token = firebase_auth.verify_id_token(id_token_str)
            user_email = decoded_token.get('email')
            if not user_email:
                raise ValueError("Invalid token: no email")
            self.logger.info(f"Authenticated user: {user_email}")
            return user_email
        except Exception as e:
            self.logger.error(f"Firebase token verification failed: {e}")
            raise ValueError(f"Token verification failed: {e}")
    
    def validate_task_payload(self, data):
        """Validate Cloud Tasks payload"""
        if not data:
            raise ValueError("No data provided in Cloud Tasks callback")
        
        job_id = data.get('job_id')
        bucket_path = data.get('bucket_path')
        source = data.get('source', 'cloud_tasks')
        
        if not job_id or not bucket_path:
            missing_fields = []
            if not job_id:
                missing_fields.append('job_id')
            if not bucket_path:
                missing_fields.append('bucket_path')
            raise ValueError(f"Missing required fields: {', '.join(missing_fields)}")
        
        return {
            'job_id': job_id,
            'bucket_path': bucket_path,
            'source': source
        }
    
    def create_success_response(self, job_id, message="Task processed successfully", data=None):
        """Create standardized success response"""
        response = {
            "status": "success",
            "job_id": job_id,
            "message": message,
            "timestamp": datetime.now().isoformat()
        }
        if data:
            response["data"] = data
        return response
    
    def create_error_response(self, job_id, error_message, status_code=400):
        """Create standardized error response"""
        return {
            "status": "error",
            "job_id": job_id,
            "error": error_message,
            "timestamp": datetime.now().isoformat()
        }, status_code
    
    def create_processing_error_response(self, job_id, error_message):
        """Create response for processing errors (200 to prevent Cloud Tasks retry)"""
        return {
            "status": "processed_with_error",
            "job_id": job_id,
            "message": "Task completed with processing errors",
            "error": error_message,
            "timestamp": datetime.now().isoformat()
        }, 200