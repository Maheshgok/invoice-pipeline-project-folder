import os
import logging
from datetime import datetime
from flask import Flask, request, jsonify
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth

# Import our modules
from queue_manager import QueueManager, QueueJob
from openai_processor import OpenAIProcessor
from result_manager import ResultManager
from background_processor import BackgroundProcessor

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

# Initialize all components
queue_manager = QueueManager()
openai_processor = OpenAIProcessor()
result_manager = ResultManager()
background_processor = BackgroundProcessor(queue_manager, openai_processor, result_manager)

# Start background processing
background_processor.start()

logger.info("Queue Processor application initialized")

# CORS headers
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
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
        "queue_status": queue_manager.get_queue_status(),
        "processor_stats": background_processor.get_processing_stats()
    })

@app.route('/process-file', methods=['POST'])
def process_file():
    """Add file to processing queue"""
    try:
        # Verify authentication
        auth_header = request.headers.get('Authorization')
        user_email = verify_auth_token(auth_header)
        
        # Get request data
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        bucket_path = data.get('bucket_path')
        if not bucket_path:
            return jsonify({"error": "Missing bucket_path"}), 400
        
        # Generate job ID
        timestamp = datetime.now().strftime('%Y_%m_%d_%H-%M-%S')
        job_id = f"job_{timestamp}_{hash(bucket_path) % 10000}"
        
        # Create and add job to queue
        job = QueueJob(
            job_id=job_id,
            bucket_path=bucket_path,
            user_email=user_email,
            created_at=datetime.now()
        )
        
        queue_manager.add_job(job)
        
        logger.info(f"Added job {job_id} to queue for user {user_email}")
        
        return jsonify({
            "status": "queued",
            "job_id": job_id,
            "message": "File added to processing queue",
            "queue_position": queue_manager.get_queue_status()["pending"]
        })
        
    except ValueError as e:
        return jsonify({"error": str(e)}), 401
    except Exception as e:
        logger.error(f"Error in process_file: {e}")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

@app.route('/get-results/<user_email>', methods=['GET'])
def get_results(user_email):
    """Get completed results for a user (at-most-once delivery)"""
    try:
        # Verify authentication
        auth_header = request.headers.get('Authorization')
        token_email = verify_auth_token(auth_header)
        
        # Verify user can access these results
        if token_email != user_email:
            return jsonify({"error": "Unauthorized access"}), 403
        
        # Get completed and failed jobs that haven't been sent yet
        completed_jobs = queue_manager.get_completed_jobs_for_user(user_email)
        failed_jobs = queue_manager.get_failed_jobs_for_user(user_email)
        
        if not completed_jobs and not failed_jobs:
            return jsonify({
                "status": "no_new_results",
                "results": [],
                "count": 0
            })
        
        # Get results from Firestore
        results = result_manager.get_results_for_user(user_email, completed_jobs, failed_jobs)
        
        # Mark all these results as sent (at-most-once delivery)
        for job in completed_jobs + failed_jobs:
            queue_manager.mark_result_sent(job.job_id)
        
        logger.info(f"Sent {len(results)} results to user {user_email}")
        
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
    """Get status of a specific job"""
    try:
        # Verify authentication
        auth_header = request.headers.get('Authorization')
        user_email = verify_auth_token(auth_header)
        
        # Get job status from queue manager
        job_status = queue_manager.get_job_status(job_id, user_email)
        
        if job_status is None:
            return jsonify({"error": "Job not found or access denied"}), 404
        
        return jsonify(job_status)
        
    except ValueError as e:
        return jsonify({"error": str(e)}), 401
    except Exception as e:
        logger.error(f"Error in get_job_status: {e}")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

@app.route('/queue-status', methods=['GET'])
def get_queue_status():
    """Get current queue status"""
    try:
        return jsonify({
            "queue_status": queue_manager.get_queue_status(),
            "processor_stats": background_processor.get_processing_stats()
        })
    except Exception as e:
        logger.error(f"Error in queue_status: {e}")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)
