import os
import json
import logging
from datetime import datetime, timedelta
from google.cloud import storage
from flask import Request, jsonify

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Environment variables
BUCKET_NAME = os.environ.get('BUCKET_NAME')
if not BUCKET_NAME:
    logger.error("BUCKET_NAME environment variable is required")

# Initialize storage client
storage_client = storage.Client()

def get_signed_url(request: Request):
    """
    Google Cloud Function that generates and returns a signed URL for uploading images to Google Cloud Storage.
    
    Handles:
    - OPTIONS (preflight) requests for CORS
    - POST requests to generate signed URLs
    """
    
    # Log request received
    logger.info(f"Request received: {request.method} {request.url}")
    logger.info(f"Request headers: {dict(request.headers)}")
    
    # Handle CORS preflight (OPTIONS) request
    if request.method == 'OPTIONS':
        logger.info("Handling CORS preflight request")
        
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        
        logger.info("Preflight handled successfully")
        return ('', 200, headers)
    
    # Set CORS headers for actual requests
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    }
    
    try:
        # Validate environment variables
        if not BUCKET_NAME:
            logger.error("BUCKET_NAME environment variable not set")
            return (
                json.dumps({"error": "Server configuration error: BUCKET_NAME not set"}),
                500,
                headers
            )
        
        # Validate request method
        if request.method != 'POST':
            logger.warning(f"Invalid method: {request.method}")
            return (
                json.dumps({"error": "Method not allowed. Use POST."}),
                400,
                headers
            )
        
        # Parse JSON body
        try:
            if not request.is_json:
                logger.error("Request is not JSON")
                return (
                    json.dumps({"error": "Request must be JSON"}),
                    400,
                    headers
                )
            
            request_data = request.get_json()
            logger.info(f"Request data: {request_data}")
            
        except Exception as e:
            logger.error(f"Failed to parse JSON: {str(e)}")
            return (
                json.dumps({"error": "Invalid JSON in request body"}),
                400,
                headers
            )
        
        # Validate required fields
        if not request_data:
            logger.error("Empty request body")
            return (
                json.dumps({"error": "Request body is required"}),
                400,
                headers
            )
        
        file_name = request_data.get('fileName')
        content_type = request_data.get('contentType')
        
        if not file_name:
            logger.error("fileName is missing from request")
            return (
                json.dumps({"error": "fileName is required"}),
                400,
                headers
            )
        
        if not content_type:
            logger.error("contentType is missing from request")
            return (
                json.dumps({"error": "contentType is required"}),
                400,
                headers
            )
        
        # Validate content type (optional - you can customize allowed types)
        allowed_types = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
            'image/webp', 'application/pdf'
        ]
        
        if content_type not in allowed_types:
            logger.warning(f"Invalid content type: {content_type}")
            return (
                json.dumps({
                    "error": f"Invalid content type: {content_type}",
                    "allowed_types": allowed_types
                }),
                400,
                headers
            )
        
        logger.info(f"Generating signed URL for fileName: {file_name}, contentType: {content_type}")
        
        # Generate unique blob name with timestamp prefix
        timestamp = datetime.utcnow().strftime('%Y/%m/%d/%H-%M-%S')
        blob_name = f"raw/{timestamp}_{file_name}"  # Changed to use 'raw' folder
        
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
        logger.info(f"- Service account: cloudrun-invoice-uploader@ocrinvoice-466611.iam.gserviceaccount.com")
        
        try:
            signed_url = blob.generate_signed_url(
                version="v4",
                expiration=expiration,
                method="PUT",
                content_type=content_type,
                service_account_email="cloudrun-invoice-uploader@ocrinvoice-466611.iam.gserviceaccount.com"
                )
            logger.info(f"Signed URL created successfully for blob: {blob_name}")
            logger.info(f"URL expires at: {expiration.isoformat()}")
        except Exception as e:
            logger.error(f"Failed to generate signed URL: {str(e)}", exc_info=True)
            raise
        
        # Prepare response
        response_data = {
            "signedUrl": signed_url,
            "fileName": file_name,
            "bucket": BUCKET_NAME
        }
        
        logger.info(f"Returning response: {json.dumps(response_data, indent=2)}")
        
        return (
            json.dumps(response_data),
            200,
            headers
        )
    
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        return (
            json.dumps({"error": f"Internal server error: {str(e)}"}),
            500,
            headers
        )

# For local testing (Functions Framework will use the function directly)
if __name__ == "__main__":
    from functions_framework import create_app
    
    # Set default environment variables for local testing
    os.environ.setdefault('BUCKET_NAME', 'your-test-bucket-name')
    
    app = create_app(get_signed_url)
    app.run(host='0.0.0.0', port=8080, debug=True)
