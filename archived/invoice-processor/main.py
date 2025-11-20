import os
import base64
import json
import logging
from typing import Dict, Any, Tuple
from flask import Flask, request, jsonify

from openai_client import extract_invoice_from_image
from storage_utils import download_file
from firestore_utils import save_invoice_result, update_error_status

# Configure logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

def validate_message(message: Dict[str, Any]) -> None:
    """
    Validates the incoming Pub/Sub message structure.
    
    Args:
        message: The decoded Pub/Sub message
        
    Raises:
        ValueError: If required fields are missing or invalid
    """
    required_fields = ['bucket', 'object_path']
    missing_fields = [field for field in required_fields if field not in message]
    
    if missing_fields:
        raise ValueError(f"Missing required fields: {', '.join(missing_fields)}")

@app.route('/', methods=['POST'])
def process_invoice():
    """Cloud Run service triggered by Pub/Sub push subscription.
    
    Args:
        request: The Flask request object containing the Pub/Sub message.
    Returns:
        A tuple of (response, status_code)
    """
    request_id = None
    
    try:
        envelope = request.get_json()
        if not envelope:
            msg = "No Pub/Sub message received"
            logger.error(f"Error: {msg}")
            return {"error": msg}, 400

        if not isinstance(envelope, dict) or "message" not in envelope:
            msg = "Invalid Pub/Sub message format"
            logger.error(f"Error: {msg}")
            return {"error": msg}, 400

        pubsub_message = envelope["message"]
        if not isinstance(pubsub_message, dict) or "data" not in pubsub_message:
            msg = "Invalid Pub/Sub message: no data field"
            logger.error(f"Error: {msg}")
            return {"error": msg}, 400

        data = base64.b64decode(pubsub_message["data"]).decode()
        message_id = pubsub_message.get("messageId", "")
        
        try:
            # Parse message data
            message = json.loads(data)
            request_id = message.get('request_id') or message.get('backend_request_id') or message_id
            
            logger.info(f"Starting invoice processing, request_id={request_id}")
            logger.info(f"Received message: {json.dumps(message, indent=2)}")
            
            # Validate message structure
            validate_message(message)
            
        except (KeyError, json.JSONDecodeError, ValueError) as e:
            logger.error(f"Invalid message format: {str(e)}")
            if request_id:
                update_error_status(request_id, "invalid_message", str(e))
            raise

        bucket_name = message['bucket']
        object_path = message['object_path']

        # Step 1: Download image from GCS
        try:
            logger.info(f"Downloading file {object_path} from bucket {bucket_name}")
            file_bytes = download_file(bucket_name, object_path)
        except Exception as e:
            logger.error(f"Failed to download file: {str(e)}")
            update_error_status(request_id, "download_failed", str(e))
            raise

        # Step 2: Send to OpenAI
        try:
            logger.info("Sending image to OpenAI for processing")
            extracted_data = extract_invoice_from_image(file_bytes)
        except Exception as e:
            logger.error(f"Failed to process image with OpenAI: {str(e)}")
            update_error_status(request_id, "extraction_failed", str(e))
            raise

        # Step 3: Save results to Firestore
        try:
            logger.info("Saving results to Firestore")
            save_invoice_result(request_id, object_path, extracted_data)
            logger.info(f"Successfully processed invoice {object_path}")
        except Exception as e:
            logger.error(f"Failed to save results: {str(e)}")
            update_error_status(request_id, "save_failed", str(e))
            raise

    except Exception as e:
        # Log the full error with stack trace
        logger.error(f"Failed to process invoice: {str(e)}", exc_info=True)
        
        # Ensure error status is updated in Firestore if we have a request_id
        if request_id:
            try:
                update_error_status(request_id, "processing_failed", str(e))
            except Exception as update_error:
                logger.error(f"Failed to update error status: {str(update_error)}")
        
        # Return error response
        return {"error": str(e)}, 500
        
    # Return success response
    return {"status": "success", "requestId": request_id}, 200

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint for Cloud Run"""
    return jsonify({
        "status": "healthy",
        "service": "invoice-processor"
    }), 200

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8080))
    app.run(host='0.0.0.0', port=port)
