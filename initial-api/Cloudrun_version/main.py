"""
Initial API Service - File Upload and Authentication Handler
Handles file uploads to Google Cloud Storage and user authentication

Docker Image: asia-south1-docker.pkg.dev/watch-mail-trial/cloud-run-source-deploy/initial-api@sha256:5d41d5dc1d60134a1e61b940cd7f5d1fecf6716ce17013a1703792b5744c5474
Last Updated: 2025-11-13 09:34 UTC  
Status: Stable - Flask 2.3.0, Google Cloud Storage integration
"""
import os
import json
import logging
from datetime import datetime, timedelta
from google.cloud import storage, firestore
from flask import Flask, Request, jsonify, request
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Environment variables
BUCKET_NAME = os.environ.get('BUCKET_NAME')
if not BUCKET_NAME:
    logger.error("BUCKET_NAME environment variable is required")

# Initialize clients with explicit project ID
project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
storage_client = storage.Client(project=project_id)
firestore_client = firestore.Client(project=project_id)

# Initialize Firebase Admin SDK
if not firebase_admin._apps:
    # Use default credentials (service account) in production
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred)

print(f"Initialized clients for project: {project_id}")

# Initialize Flask app for Cloud Run
app = Flask(__name__)

# Configure CORS properly for authenticated requests
from flask_cors import CORS
CORS(app, 
     resources={
         r"/*": {
             "origins": ["https://invoiceparse.netlify.app", "http://localhost:3000", "http://localhost:3001"],
             "methods": ["GET", "POST", "PUT", "OPTIONS"],
             "allow_headers": ["Authorization", "Content-Type"],
             "supports_credentials": True,
             "expose_headers": ["Content-Type"]
         }
     })

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

@app.route('/upload_invoice', methods=['POST'])
def upload_file():
    """
    Direct file upload endpoint.
    Accepts multipart/form-data with a file field.
    Returns a token and file location information.
    """
    logger.info("File upload request received")
    
    # Verify authentication first
    try:
        auth_header = request.headers.get('Authorization')
        user_email = verify_auth_token(auth_header)
        logger.info(f"Upload request authenticated for user: {user_email}")
    except ValueError as e:
        logger.error(f"Authentication failed: {e}")
        return jsonify({"error": "Invalid authentication token", "details": str(e)}), 401
    
    # Validate environment variables
    if not BUCKET_NAME:
        logger.error("BUCKET_NAME environment variable not set")
        return jsonify({"error": "Server configuration error: BUCKET_NAME not set"}), 500
    
    if 'file' not in request.files:
        logger.error("No file provided in request")
        return jsonify({"error": "No file provided"}), 400
    
    file = request.files['file']
    if file.filename == '':
        logger.error("Empty filename provided")
        return jsonify({"error": "No file selected"}), 400
    
    try:
        # Generate production-ready job ID with customer tracking
        import hashlib
        import secrets
        
        # Generate unique path with timestamp
        timestamp = datetime.utcnow().strftime('%Y/%m/%d/%H-%M-%S')
        filename = f"raw/{timestamp}_{file.filename}"
        
        logger.info(f"Processing upload for file: {filename}")
        
        # Get bucket and create a blob
        bucket = storage_client.bucket(BUCKET_NAME)
        blob = bucket.blob(filename)
        
        # Upload the file
        blob.upload_from_file(file)
        logger.info(f"Successfully uploaded file to {filename}")
        
        # Generate production-ready job ID: {CUST_NUM}-{ASSET_REF}-{TOKEN}
        # 1. Customer number (3-char alphanumeric from email hash)
        email_hash = hashlib.md5(user_email.encode()).hexdigest()
        cust_num = f"{email_hash[:2].upper()}{ord(email_hash[2]) % 10}"
        
        # 2. Asset reference (6-char from bucket path + sequence)
        path_hash = hashlib.sha256(filename.encode()).hexdigest()
        asset_ref = f"{path_hash[:4].upper()}{timestamp[-2:]}"
        
        # 3. Security token (4-char random)
        token = secrets.token_hex(2).upper()
        
        # Combine into production job ID
        job_id = f"{cust_num}-{asset_ref}-{token}"
        
        # Note: Queue processor call is now handled by the Netlify function
        # No need to call queue processor from initial-api anymore
        logger.info(f"File uploaded successfully. Job ID: {job_id}, Bucket path: {BUCKET_NAME}/{filename}")
        
        return jsonify({
            "status": "success",
            "job_id": job_id,  # Frontend expects this field
            "filename": filename,
            "bucket": BUCKET_NAME,
            "gcsPath": f"gs://{BUCKET_NAME}/{filename}",
            "bucket_path": f"{BUCKET_NAME}/{filename}"  # Add this for queue processor
        }), 200
        
    except Exception as e:
        logger.error(f"Error uploading file: {str(e)}", exc_info=True)
        return jsonify({"error": f"Failed to upload file: {str(e)}"}), 500
    
    try:
        # Validate environment variables
        if not BUCKET_NAME:
            logger.error("BUCKET_NAME environment variable not set")
            return jsonify({"error": "Server configuration error: BUCKET_NAME not set"}), 500
        
        # Parse JSON body
        try:
            if not request.is_json:
                logger.error("Request is not JSON")
                return jsonify({"error": "Request must be JSON"}), 400
            
            request_data = request.get_json()
            logger.info(f"Request data: {request_data}")
            
        except Exception as e:
            logger.error(f"Failed to parse JSON: {str(e)}")
            return jsonify({"error": "Invalid JSON in request body"}), 400
        
        # Validate required fields
        if not request_data:
            logger.error("Empty request body")
            return jsonify({"error": "Request body is required"}), 400
        
        file_name = request_data.get('fileName')
        content_type = request_data.get('contentType')
        
        if not file_name:
            logger.error("fileName is missing from request")
            return jsonify({"error": "fileName is required"}), 400
        
        if not content_type:
            logger.error("contentType is missing from request")
            return jsonify({"error": "contentType is required"}), 400
        
        # Validate content type
        allowed_types = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
            'image/webp', 'application/pdf'
        ]
        
        if content_type not in allowed_types:
            logger.warning(f"Invalid content type: {content_type}")
            return jsonify({
                "error": f"Invalid content type: {content_type}",
                "allowed_types": allowed_types
            }), 400
        
        logger.info(f"Generating signed URL for fileName: {file_name}, contentType: {content_type}")
        
        # Generate unique blob name with timestamp prefix
        timestamp = datetime.utcnow().strftime('%Y/%m/%d/%H-%M-%S')
        blob_name = f"raw/{timestamp}_{file_name}"
        
        logger.info(f"Blob name: {blob_name}")
        
        # Get bucket and blob
        bucket = storage_client.bucket(BUCKET_NAME)
        blob = bucket.blob(blob_name)
        
        # Generate signed URL (valid for 15 minutes)
        expiration = datetime.utcnow() + timedelta(minutes=15)
        
        logger.info(f"Attempting to generate signed URL with params:")
        logger.info(f"- Bucket: {BUCKET_NAME}")
        logger.info(f"- Blob name: {blob_name}")
        logger.info(f"- Content type: {content_type}")
        logger.info(f"- Expiration: {expiration.isoformat()}")
        
        try:
            signed_url = blob.generate_signed_url(
                version="v4",
                expiration=expiration,
                method="PUT",
                content_type=content_type,
                service_account_email="cloudrun-invoice-uploader@watch-mail-trial.iam.gserviceaccount.com"
            )
            logger.info(f"Signed URL created successfully for blob: {blob_name}")
            logger.info(f"URL expires at: {expiration.isoformat()}")
        except Exception as e:
            logger.error(f"Failed to generate signed URL: {str(e)}", exc_info=True)
            raise
        
        # Generate unique request ID for tracking
        request_id = f"{timestamp}_{file_name.split('.')[0]}"
        
        # Prepare response
        response_data = {
            "signedUrl": signed_url,
            "fileName": file_name,
            "bucket": BUCKET_NAME,
            "requestId": request_id,
            "gcsPath": f"gs://{BUCKET_NAME}/{blob_name}"
        }
        
        logger.info(f"Returning response with requestId: {request_id}")
        
        return jsonify(response_data), 200
    
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

@app.route('/poll-result/<request_id>', methods=['GET'])
def poll_result(request_id):
    """
    Poll for processing results from Firestore.
    
    Returns:
    - status: "pending", "completed", "error"
    - data: extracted invoice data (if completed)
    - error: error details (if failed)
    """
    logger.info(f"Polling request for ID: {request_id}")
    
    try:
        # Query Firestore for the processing result
        doc_ref = firestore_client.collection("processing_results").document(request_id)
        doc = doc_ref.get()
        
        if not doc.exists:
            logger.info(f"No processing result found for request_id: {request_id}")
            return jsonify({
                "status": "pending",
                "message": "Processing not started or request not found"
            }), 200
        
        doc_data = doc.to_dict()
        status = doc_data.get('status', 'pending')
        
        logger.info(f"Found processing result with status: {status}")
        
        if status == 'completed':
            return jsonify({
                "status": "completed",
                "data": {
                    "extractedData": doc_data.get('extracted_data', {}),
                    "objectPath": doc_data.get('object_path', ''),
                    "processedAt": doc_data.get('processed_at', '').isoformat() if doc_data.get('processed_at') else None
                }
            }), 200
            
        elif status == 'error':
            error_info = doc_data.get('error', {})
            return jsonify({
                "status": "error",
                "error": {
                    "type": error_info.get('type', 'unknown'),
                    "message": error_info.get('message', 'Unknown error'),
                    "timestamp": error_info.get('timestamp', '').isoformat() if error_info.get('timestamp') else None
                }
            }), 200
            
        else:
            # Status is pending or other
            return jsonify({
                "status": "pending",
                "message": "Processing in progress"
            }), 200
    
    except Exception as e:
        logger.error(f"Error polling result for {request_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Failed to upload file: {str(e)}"}), 500

@app.route('/', methods=['GET'])
def api_info():
    """API information endpoint"""
    return jsonify({
        "service": "initial-api",
        "version": "2.0.0",
        "endpoints": [
            "/health",
            "/upload"
        ]
    }), 200

@app.route('/trigger-processing/<request_id>', methods=['POST'])
def trigger_processing(request_id):
    """
    Trigger invoice processing by publishing to Pub/Sub.
    
    Expected JSON body:
    {
        "gcsPath": "gs://bucket/path/to/file.pdf"
    }
    """
    logger.info(f"Processing trigger request for ID: {request_id}")
    
    try:
        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 400
        
        request_data = request.get_json()
        gcs_path = request_data.get('gcsPath')
        
        if not gcs_path:
            return jsonify({"error": "gcsPath is required"}), 400
        
        # Import and trigger Pub/Sub (you may need to install google-cloud-pubsub)
        from google.cloud import pubsub_v1
        
        publisher = pubsub_v1.PublisherClient()
        topic_path = publisher.topic_path('watch-mail-trial', 'step-1-initiate')
        
        # Create message for invoice processor
        message_data = {
            "gcs_uri": gcs_path,
            "backend_request_id": request_id
        }
        
        # Publish message
        message_json = json.dumps(message_data)
        future = publisher.publish(topic_path, message_json.encode('utf-8'))
        
        logger.info(f"Published processing message: {message_json}")
        
        return jsonify({
            "status": "triggered",
            "requestId": request_id,
            "message": "Processing started"
        }), 200
        
    except Exception as e:
        logger.error(f"Error triggering processing for {request_id}: {str(e)}", exc_info=True)
        return jsonify({"error": f"Failed to trigger processing: {str(e)}"}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint - standard Cloud Run health check"""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "initial-api"
    }), 200

if __name__ == "__main__":
    # Set default environment variables for local testing
    os.environ.setdefault('BUCKET_NAME', 'ocr-invoice-raw-files-bucket')
    
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)), debug=False)
