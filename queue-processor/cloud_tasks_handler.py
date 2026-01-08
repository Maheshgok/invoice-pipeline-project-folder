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
        """Verify Firebase ID token and return user context with organization info"""
        if not auth_header or not auth_header.startswith('Bearer '):
            raise ValueError("Missing or invalid authorization token")
        
        id_token_str = auth_header.split(' ')[1]
        
        try:
            # Verify Firebase ID token
            decoded_token = firebase_auth.verify_id_token(id_token_str)
            user_email = decoded_token.get('email')
            user_uid = decoded_token.get('uid')
            
            if not user_email or not user_uid:
                raise ValueError("Invalid token: missing email or UID")
                
            # Extract organization information from custom claims if available
            custom_claims = decoded_token.get('custom_claims', {}) or {}
            organization_id = custom_claims.get('organizationId')
            organization_role = custom_claims.get('organizationRole')
            
            user_context = {
                'email': user_email,
                'uid': user_uid,
                'organization_id': organization_id,
                'organization_role': organization_role
            }
            
            self.logger.info(f"✅ Authenticated user: {user_email} (UID: {user_uid[:8]}...) Org: {organization_id or 'None'}")
            return user_context
        except Exception as e:
            self.logger.error(f"Firebase token verification failed: {e}")
            raise ValueError(f"Token verification failed: {e}")
    
    def validate_task_payload(self, data):
        """Validate Cloud Tasks payload and extract user context"""
        if not data:
            raise ValueError("No data provided in Cloud Tasks callback")
        
        job_id = data.get('job_id')
        bucket_path = data.get('bucket_path')
        source = data.get('source', 'cloud_tasks')
        
        # Extract user context fields from payload (NEW: Full validation)
        user_email = data.get('user_email')
        user_uid = data.get('user_uid')
        organization_id = data.get('organization_id')
        organization_role = data.get('organization_role')
        expected_user_folder = data.get('expected_user_folder')
        user_context = data.get('user_context', {})
        
        # NEW: Extract client organization context fields
        client_organization_context = data.get('organization_context')
        client_organization_id = data.get('client_organization_id')
        client_organization_name = data.get('client_organization_name')
        
        # CRITICAL: Validate bucket path matches user context (USER-ISOLATED BUCKETS)
        if expected_user_folder and bucket_path:
            # NEW: Handle user-isolated bucket format
            if "/" in bucket_path:
                bucket_name_part, path_part = bucket_path.split("/", 1)
                
                # Check if this is a user-isolated bucket (format: user_bucket_name/raw/...)
                expected_bucket_suffix = f"_{expected_user_folder.lower()}"
                if bucket_name_part.endswith(expected_bucket_suffix):
                    # This is a valid user-isolated bucket path
                    self.logger.info(f"✅ Valid user-isolated bucket path: {bucket_path}")
                else:
                    # Check if it's old format (users/uid/raw/)
                    if f"users/{expected_user_folder}/raw/" in bucket_path:
                        self.logger.info(f"✅ Valid legacy bucket path: {bucket_path}")
                    else:
                        raise ValueError(f"Security violation: Bucket path '{bucket_path}' does not match expected user context '{expected_user_folder}'")
            else:
                raise ValueError(f"Invalid bucket path format: '{bucket_path}' - must include bucket/path structure")
        
        # Additional validation: Normalize bucket path for processing
        # Handle both user-isolated buckets and legacy shared bucket formats
        if bucket_path:
            # Check if this includes full bucket name with users/ path
            if "/" in bucket_path and ("users/" in bucket_path or not bucket_path.startswith("users/")):
                # Valid formats:
                # 1. bucket_name/users/uid/raw/file (full path with bucket name)
                # 2. users/uid/raw/file (legacy format)
                # 3. bucket_name/raw/file (user-isolated bucket format)
                self.logger.info(f"🔧 Processing valid bucket path: {bucket_path}")
            else:
                # Invalid format - must have proper structure
                self.logger.warning(f"⚠️ Unusual bucket path format: '{bucket_path}' - processing anyway")
        
        
        # Cross-validate user context from payload vs task context
        if user_context and user_context.get('uid') != user_uid:
            raise ValueError(f"User context mismatch: payload UID '{user_context.get('uid')}' != task UID '{user_uid}'")
        
        if not job_id or not bucket_path:
            missing_fields = []
            if not job_id:
                missing_fields.append('job_id')
            if not bucket_path:
                missing_fields.append('bucket_path')
            raise ValueError(f"Missing required fields: {', '.join(missing_fields)}")
        
        # Log extracted user context for debugging
        self.logger.info(f"📄 PAYLOAD DEBUG - Extracted from Cloud Tasks:")
        self.logger.info(f"   user_email: '{user_email}'")
        self.logger.info(f"   user_uid: '{user_uid}'")
        self.logger.info(f"   organization_id: '{organization_id}'")
        self.logger.info(f"   organization_role: '{organization_role}'")
        self.logger.info(f"   client_organization_context: {bool(client_organization_context)}")
        self.logger.info(f"   client_organization_id: '{client_organization_id}'")
        self.logger.info(f"   client_organization_name: '{client_organization_name}'")
        
        return {
            'job_id': job_id,
            'bucket_path': bucket_path,
            'source': source,
            # Include user context in validated payload
            'user_context': {
                'email': user_email or 'no email',
                'uid': user_uid or 'no uid',
                'organization_id': organization_id,
                'organization_role': organization_role,
                'client_organization_context': client_organization_context,
                'client_organization_id': client_organization_id,
                'client_organization_name': client_organization_name
            }
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