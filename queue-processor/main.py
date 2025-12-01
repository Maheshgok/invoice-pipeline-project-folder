"""
Cloud Tasks Invoice Processor
Handles Cloud Tasks callbacks for invoice processing
Replaces the in-memory queue system with GCP-managed tasks
"""
import os
import logging
from datetime import datetime
from flask import Flask, request, jsonify
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth

# Import existing modules
from openai_processor import OpenAIProcessor
from result_manager import ResultManager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Initialize Firebase Admin SDK
if not firebase_admin._apps:
    # Use default credentials (service account) in production
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred)

# Configuration
PROJECT_ID = os.environ.get('PROJECT_ID', 'watch-mail-trial')

# Initialize processing components (no more queue manager needed)
openai_processor = OpenAIProcessor()
result_manager = ResultManager()

logger.info("Cloud Tasks Invoice Processor initialized")

# CORS headers
@app.after_request
def after_request(response):
    origin = request.headers.get('Origin')
    allowed_origins = ['https://invoiceparse.netlify.app', 'http://localhost:3000', 'http://localhost:3001']
    
    if origin in allowed_origins:
        response.headers['Access-Control-Allow-Origin'] = origin
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,OPTIONS'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    return response

@app.route('/<path:path>', methods=['OPTIONS'])
def handle_options(path):
    response = jsonify({'status': 'ok'})
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

def verify_auth_token(auth_header):
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
        logger.info(f"Authenticated user: {user_email}")
        return user_email
    except Exception as e:
        logger.error(f"Firebase token verification failed: {e}")
        raise ValueError(f"Token verification failed: {e}")

@app.route('/health', methods=['GET'])
def health_check():
    """Health check with system status"""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "service": "cloud-tasks-queue-processor",
        "mode": "cloud_tasks_managed"
    })

@app.route('/process-task', methods=['POST'])
def process_task():
    """
    Process a Cloud Tasks callback for invoice processing
    This replaces the old /process-file endpoint and queue management
    """
    try:
        # Verify authentication
        auth_header = request.headers.get('Authorization')
        user_email = verify_auth_token(auth_header)
        
        # Get Cloud Tasks payload
        data = request.get_json()
        if not data:
            logger.error("No data provided in Cloud Tasks callback")
            return jsonify({"error": "No data provided"}), 400
        
        job_id = data.get('job_id')
        bucket_path = data.get('bucket_path')
        source = data.get('source', 'unknown')
        
        if not job_id or not bucket_path:
            logger.error(f"Missing required fields: job_id={job_id}, bucket_path={bucket_path}")
            return jsonify({"error": "Missing required fields: job_id and bucket_path"}), 400
        
        logger.info(f"🚀 Processing Cloud Task: {job_id}")
        logger.info(f"📁 Bucket path: {bucket_path}")
        logger.info(f"👤 User: {user_email}")
        logger.info(f"🔍 Source: {source}")
        
        # Track processing start in Firestore
        _track_processing_start(job_id, bucket_path, user_email)
        
        try:
            # Process the invoice using OpenAI
            logger.info(f"🔄 Starting OpenAI processing for job {job_id}")
            
            # Call the OpenAI processor
            processing_result = openai_processor.process_invoice(bucket_path, job_id)
            
            if processing_result.get('success', False):
                # Store successful result
                extracted_data = processing_result.get('data', {})
                
                result_manager.store_result(
                    job_id=job_id,
                    user_email=user_email,
                    extracted_data=extracted_data,
                    status='completed',
                    bucket_path=bucket_path
                )
                
                logger.info(f"✅ Successfully processed job {job_id}")
                
                # Track processing completion
                _track_processing_completion(job_id, True, extracted_data)
                
                return jsonify({
                    "status": "success",
                    "job_id": job_id,
                    "message": "Invoice processed successfully",
                    "data": extracted_data
                }), 200
                
            else:
                # Handle processing failure
                error_message = processing_result.get('error', 'Unknown processing error')
                
                result_manager.store_result(
                    job_id=job_id,
                    user_email=user_email,
                    extracted_data={},
                    status='failed',
                    bucket_path=bucket_path,
                    error=error_message
                )
                
                logger.error(f"❌ Processing failed for job {job_id}: {error_message}")
                
                # Track processing failure
                _track_processing_completion(job_id, False, None, error_message)
                
                # Return 200 to prevent Cloud Tasks retry for processing errors
                return jsonify({
                    "status": "processed_with_error",
                    "job_id": job_id,
                    "message": "Invoice processing completed with errors",
                    "error": error_message
                }), 200
        
        except Exception as processing_error:
            # Handle unexpected processing errors
            error_message = f"Unexpected processing error: {str(processing_error)}"
            
            result_manager.store_result(
                job_id=job_id,
                user_email=user_email,
                extracted_data={},
                status='failed',
                bucket_path=bucket_path,
                error=error_message
            )
            
            logger.error(f"💥 Unexpected error processing job {job_id}: {processing_error}", exc_info=True)
            
            # Track processing failure
            _track_processing_completion(job_id, False, None, error_message)
            
            # Return 500 to trigger Cloud Tasks retry
            return jsonify({
                "status": "error",
                "job_id": job_id,
                "message": "Unexpected processing error occurred",
                "error": error_message
            }), 500
        
    except ValueError as e:
        logger.error(f"Authentication error: {e}")
        return jsonify({"error": str(e)}), 401
    except Exception as e:
        logger.error(f"Error in process_task: {e}", exc_info=True)
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

def _track_processing_start(job_id: str, bucket_path: str, user_email: str):
    """Track processing start in Firestore"""
    try:
        from google.cloud import firestore
        
        firestore_client = firestore.Client(project=PROJECT_ID)
        
        # Update task tracking
        task_ref = firestore_client.collection('cloud_tasks').document(job_id)
        task_ref.update({
            'status': 'processing',
            'processing_started_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        })
        
        logger.info(f"📋 Updated task tracking: processing started for {job_id}")
        
    except Exception as e:
        logger.warning(f"Failed to track processing start: {e}")

def _track_processing_completion(job_id: str, success: bool, data: dict = None, error: str = None):
    """Track processing completion in Firestore"""
    try:
        from google.cloud import firestore
        
        firestore_client = firestore.Client(project=PROJECT_ID)
        
        # Update task tracking
        update_data = {
            'status': 'completed' if success else 'failed',
            'processing_completed_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        
        if error:
            update_data['error_message'] = error
        
        if data:
            update_data['result_preview'] = {
                'has_data': bool(data),
                'fields_extracted': len(data) if isinstance(data, dict) else 0
            }
        
        task_ref = firestore_client.collection('cloud_tasks').document(job_id)
        task_ref.update(update_data)
        
        logger.info(f"📋 Updated task tracking: processing completed for {job_id} (success={success})")
        
    except Exception as e:
        logger.warning(f"Failed to track processing completion: {e}")

@app.route('/get-results/<user_email>', methods=['GET'])
def get_results(user_email):
    """
    Get completed results for a user
    This endpoint maintains compatibility with the frontend
    """
    try:
        # Verify authentication
        auth_header = request.headers.get('Authorization')
        token_email = verify_auth_token(auth_header)
        
        # Verify user can access these results
        if token_email != user_email:
            return jsonify({"error": "Unauthorized access"}), 403
        
        # Get results directly from ResultManager (no queue needed)
        results = result_manager.get_latest_results_for_user(user_email)
        
        if not results:
            return jsonify({
                "status": "no_new_results",
                "results": [],
                "count": 0
            })
        
        logger.info(f"📋 Retrieved {len(results)} results for user {user_email}")
        
        return jsonify({
            "status": "success",
            "results": results,
            "count": len(results)
        })
        
    except ValueError as e:
        return jsonify({"error": str(e)}), 401
    except Exception as e:
        logger.error(f"Error in get_results: {e}")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

@app.route('/job-status/<job_id>', methods=['GET'])
def get_job_status(job_id):
    """Get status of a specific job from Cloud Tasks tracking"""
    try:
        # Verify authentication
        auth_header = request.headers.get('Authorization')
        user_email = verify_auth_token(auth_header)
        
        from google.cloud import firestore
        
        firestore_client = firestore.Client(project=PROJECT_ID)
        
        # Get job status from Cloud Tasks tracking
        task_ref = firestore_client.collection('cloud_tasks').document(job_id)
        task_doc = task_ref.get()
        
        if not task_doc.exists:
            return jsonify({"error": "Job not found"}), 404
        
        task_data = task_doc.to_dict()
        
        # Verify user access
        if task_data.get('user_email') != user_email:
            return jsonify({"error": "Unauthorized access"}), 403
        
        status = task_data.get('status', 'unknown')
        
        # Map status to progress
        progress_map = {
            'created': 0.1,
            'processing': 0.5,
            'completed': 1.0,
            'failed': 1.0
        }
        
        response = {
            "job_id": job_id,
            "status": status,
            "progress": progress_map.get(status, 0.0),
            "created_at": task_data.get('created_at', datetime.utcnow()).isoformat() if task_data.get('created_at') else None,
            "user_email": task_data.get('user_email')
        }
        
        if status == 'failed' and 'error_message' in task_data:
            response["error_message"] = task_data['error_message']
        
        if status == 'completed' and 'result_preview' in task_data:
            response["result_preview"] = task_data['result_preview']
        
        return jsonify(response)
        
    except ValueError as e:
        return jsonify({"error": str(e)}), 401
    except Exception as e:
        logger.error(f"Error in get_job_status: {e}")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

# Legacy endpoint for compatibility (now just redirects to Cloud Tasks mode)
@app.route('/process-file', methods=['POST'])
def process_file_legacy():
    """Legacy endpoint - redirects to inform about Cloud Tasks migration"""
    return jsonify({
        "status": "deprecated",
        "message": "This endpoint has been replaced by Cloud Tasks processing",
        "new_flow": "Files are now automatically processed via Cloud Tasks when uploaded to initial-api"
    }), 410

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)