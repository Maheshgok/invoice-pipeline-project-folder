"""
Minimal Cloud Tasks Test Processor
Simple version to test Cloud Tasks integration without OpenAI dependency
"""
import os
import logging
from datetime import datetime
from flask import Flask, request, jsonify
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth

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

logger.info("Minimal Cloud Tasks Processor initialized")

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
        "service": "cloud-tasks-test-processor",
        "mode": "cloud_tasks_test"
    })

@app.route('/process-task', methods=['POST'])
def process_task():
    """
    Process a Cloud Tasks callback (test version)
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
        
        # Simulate processing (for testing)
        import time
        time.sleep(2)  # Simulate processing time
        
        # Store test result in Firestore
        try:
            from google.cloud import firestore
            
            firestore_client = firestore.Client(project=PROJECT_ID)
            
            # Store successful test result
            doc_data = {
                'job_id': job_id,
                'user_email': user_email,
                'bucket_path': bucket_path,
                'status': 'completed',
                'result': {
                    'test_mode': True,
                    'message': 'Cloud Tasks integration test successful',
                    'processed_at': datetime.utcnow().isoformat()
                },
                'created_at': datetime.utcnow().isoformat(),
                'updated_at': datetime.utcnow().isoformat(),
                'processing_mode': 'cloud_tasks_test'
            }
            
            firestore_client.collection('invoice_results').document(job_id).set(doc_data)
            logger.info(f"✅ Stored test result for job {job_id}")
            
        except Exception as firestore_error:
            logger.error(f"Failed to store test result: {firestore_error}")
            return jsonify({
                "status": "error",
                "job_id": job_id,
                "message": "Failed to store result",
                "error": str(firestore_error)
            }), 500
        
        logger.info(f"✅ Successfully processed test job {job_id}")
        
        return jsonify({
            "status": "success",
            "job_id": job_id,
            "message": "Cloud Tasks test processing completed",
            "test_mode": True,
            "processed_at": datetime.utcnow().isoformat()
        }), 200
        
    except ValueError as e:
        logger.error(f"Authentication error: {e}")
        return jsonify({"error": str(e)}), 401
    except Exception as e:
        logger.error(f"Error in process_task: {e}", exc_info=True)
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

@app.route('/get-results/<user_email>', methods=['GET'])
def get_results(user_email):
    """
    Get completed results for a user (test version)
    """
    try:
        # Verify authentication
        auth_header = request.headers.get('Authorization')
        token_email = verify_auth_token(auth_header)
        
        # Verify user can access these results
        if token_email != user_email:
            return jsonify({"error": "Unauthorized access"}), 403
        
        # Get results from Firestore
        try:
            from google.cloud import firestore
            
            firestore_client = firestore.Client(project=PROJECT_ID)
            
            # Query for user's recent results
            query = firestore_client.collection('invoice_results').where(
                'user_email', '==', user_email
            ).order_by('created_at', direction=firestore.Query.DESCENDING).limit(10)
            
            docs = query.stream()
            results = []
            
            for doc in docs:
                doc_data = doc.to_dict()
                result = {
                    "job_id": doc_data.get('job_id'),
                    "bucket_path": doc_data.get('bucket_path'),
                    "status": doc_data.get('status', 'unknown'),
                    "result": doc_data.get('result'),
                    "created_at": doc_data.get('created_at'),
                    "processing_mode": doc_data.get('processing_mode', 'unknown')
                }
                results.append(result)
            
            logger.info(f"📋 Retrieved {len(results)} test results for user {user_email}")
            
            return jsonify({
                "status": "success",
                "results": results,
                "count": len(results)
            })
            
        except Exception as firestore_error:
            logger.error(f"Failed to get results: {firestore_error}")
            return jsonify({"error": "Failed to retrieve results", "details": str(firestore_error)}), 500
        
    except ValueError as e:
        return jsonify({"error": str(e)}), 401
    except Exception as e:
        logger.error(f"Error in get_results: {e}")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)