"""
Cloud Tasks Invoice Processor - Refactored Main Application
Clean, modular Flask application for handling Cloud Tasks callbacks
Separated concerns: routing, business logic, tracking, and error handling
"""
import os
import logging
from datetime import datetime
from flask import Flask, request, jsonify
import firebase_admin
from firebase_admin import credentials

# Import modular services
from cloud_tasks_handler import CloudTasksHandler
from invoice_processing_service import InvoiceProcessingService

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Initialize Firebase Admin SDK
if not firebase_admin._apps:
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred)

# Configuration
PROJECT_ID = os.environ.get('PROJECT_ID', 'watch-mail-trial')

# Initialize modular services
cloud_tasks_handler = CloudTasksHandler()
processing_service = InvoiceProcessingService()

logger.info("🚀 Modular Cloud Tasks Invoice Processor initialized")
logger.info(f"📋 Project ID: {PROJECT_ID}")
logger.info("🔧 All services loaded successfully")

# CORS configuration
@app.after_request
def after_request(response):
    """Configure CORS headers for frontend access"""
    origin = request.headers.get('Origin')
    allowed_origins = [
        'https://invoiceparse.netlify.app',
        'https://profound-babka-8bbaa6.netlify.app',
        'http://localhost:3000',
        'http://localhost:3001'
    ]
    
    if origin in allowed_origins:
        response.headers['Access-Control-Allow-Origin'] = origin
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,PUT,POST,DELETE,OPTIONS'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    return response

@app.route('/<path:path>', methods=['OPTIONS'])
def handle_options(path):
    """Handle preflight OPTIONS requests"""
    response = jsonify({'status': 'ok'})
    origin = request.headers.get('Origin')
    allowed_origins = [
        'https://invoiceparse.netlify.app',
        'https://profound-babka-8bbaa6.netlify.app',
        'http://localhost:3000',
        'http://localhost:3001'
    ]
    if origin in allowed_origins:
        response.headers.add('Access-Control-Allow-Origin', origin)
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

@app.route('/health', methods=['GET'])
def health_check():
    """
    Comprehensive health check for all services
    Provides detailed status information for monitoring
    """
    try:
        # Get service health status
        service_health = processing_service.health_check()
        
        # Get processing statistics
        processing_stats = processing_service.get_processing_stats()
        
        # Determine overall health
        overall_healthy = service_health.get('status') == 'healthy'
        
        return jsonify({
            "status": "healthy" if overall_healthy else "degraded",
            "timestamp": datetime.now().isoformat(),
            "service": "cloud-tasks-queue-processor",
            "mode": "cloud_tasks_managed",
            "version": "2.0-modular",
            "service_health": service_health,
            "processing_stats": processing_stats,
            "project_id": PROJECT_ID
        }), 200 if overall_healthy else 503
        
    except Exception as e:
        logger.error(f"Health check failed: {e}", exc_info=True)
        return jsonify({
            "status": "error",
            "timestamp": datetime.now().isoformat(),
            "service": "cloud-tasks-queue-processor",
            "error": str(e)
        }), 500

@app.route('/process-task', methods=['POST'])
def process_task():
    """
    Main Cloud Tasks callback endpoint
    Handles invoice processing tasks with full error handling and tracking
    """
    try:
        # Step 1: Authenticate request
        auth_header = request.headers.get('Authorization')
        user_email = cloud_tasks_handler.verify_auth_token(auth_header)
        
        # Step 2: Validate Cloud Tasks payload
        data = request.get_json()
        validated_payload = cloud_tasks_handler.validate_task_payload(data)
        
        job_id = validated_payload['job_id']
        bucket_path = validated_payload['bucket_path']
        source = validated_payload['source']
        
        logger.info(f"📨 Received Cloud Task: {job_id} from {user_email}")
        
        # Step 3: Process the invoice using the business logic service
        response_data, status_code = processing_service.process_invoice_task(
            job_id=job_id,
            bucket_path=bucket_path,
            user_email=user_email,
            source=source
        )
        
        return jsonify(response_data), status_code
        
    except ValueError as validation_error:
        # Handle authentication and validation errors
        logger.error(f"🚫 Authentication/Validation error: {validation_error}")
        
        # Try to extract job_id for error tracking
        try:
            data = request.get_json() or {}
            job_id = data.get('job_id', 'unknown')
        except:
            job_id = 'unknown'
        
        error_response = cloud_tasks_handler.create_error_response(
            job_id=job_id,
            error_message=str(validation_error),
            status_code=401
        )
        return jsonify(error_response[0]), error_response[1]
        
    except Exception as system_error:
        # Handle unexpected system errors
        logger.error(f"💥 System error in process-task endpoint: {system_error}", exc_info=True)
        
        # Try to extract job_id for error tracking
        try:
            data = request.get_json() or {}
            job_id = data.get('job_id', 'unknown')
        except:
            job_id = 'unknown'
        
        error_response = cloud_tasks_handler.create_error_response(
            job_id=job_id,
            error_message=f"System error: {str(system_error)}",
            status_code=500
        )
        return jsonify(error_response[0]), error_response[1]

@app.route('/stats', methods=['GET'])
def get_stats():
    """
    Get detailed processing statistics
    Useful for monitoring and debugging
    """
    try:
        # Verify authentication for stats access
        auth_header = request.headers.get('Authorization')
        user_email = cloud_tasks_handler.verify_auth_token(auth_header)
        
        stats = processing_service.get_processing_stats()
        
        return jsonify({
            "status": "success",
            "timestamp": datetime.now().isoformat(),
            "stats": stats,
            "requested_by": user_email
        }), 200
        
    except ValueError as auth_error:
        return jsonify({
            "status": "error",
            "error": "Authentication required for stats access",
            "timestamp": datetime.now().isoformat()
        }), 401
        
    except Exception as e:
        logger.error(f"Stats endpoint error: {e}")
        return jsonify({
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500

@app.route('/cleanup', methods=['POST'])
def cleanup_stale_jobs():
    """
    Manual cleanup of stale processing jobs
    Useful for maintenance and debugging
    """
    try:
        # Verify authentication
        auth_header = request.headers.get('Authorization')
        user_email = cloud_tasks_handler.verify_auth_token(auth_header)
        
        # Get timeout parameter (default 30 minutes)
        data = request.get_json() or {}
        timeout_minutes = data.get('timeout_minutes', 30)
        
        # Perform cleanup
        stale_jobs = processing_service.tracker.cleanup_stale_jobs(timeout_minutes)
        
        logger.info(f"🧹 Manual cleanup triggered by {user_email}: {len(stale_jobs)} stale jobs removed")
        
        return jsonify({
            "status": "success",
            "message": f"Cleaned up {len(stale_jobs)} stale jobs",
            "stale_jobs": stale_jobs,
            "timeout_minutes": timeout_minutes,
            "timestamp": datetime.now().isoformat()
        }), 200
        
    except ValueError as auth_error:
        return jsonify({
            "status": "error",
            "error": "Authentication required for cleanup access",
            "timestamp": datetime.now().isoformat()
        }), 401
        
    except Exception as e:
        logger.error(f"Cleanup endpoint error: {e}")
        return jsonify({
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors gracefully"""
    return jsonify({
        "status": "error",
        "error": "Endpoint not found",
        "available_endpoints": ["/health", "/process-task", "/stats", "/cleanup"],
        "timestamp": datetime.now().isoformat()
    }), 404

@app.errorhandler(500)
def internal_server_error(error):
    """Handle 500 errors gracefully"""
    logger.error(f"Internal server error: {error}")
    return jsonify({
        "status": "error",
        "error": "Internal server error occurred",
        "timestamp": datetime.now().isoformat()
    }), 500

if __name__ == '__main__':
    # Development server (not used in Cloud Run)
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)