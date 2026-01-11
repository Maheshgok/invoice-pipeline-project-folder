"""
Invoice Data Enrichment Service - Standalone Cloud Run Service
Pure function approach for business intelligence and data enhancement
"""
import os
import time
import logging
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

# Import functional handler
from functional_openai_handler import create_enrichment_function

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# CORS configuration
allowed_origins = [
    "https://invoiceparse.netlify.app",
    "https://profound-babka-8bbaa6.netlify.app",
    "http://localhost:3000",
    "http://localhost:3001"
]
CORS(app, origins=allowed_origins, supports_credentials=True)

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        # Test function creation (very fast)
        test_func = create_enrichment_function()
        
        return jsonify({
            "status": "healthy",
            "service": "enrichment-service",
            "version": "1.0-functional",
            "handler_type": "functional_openai",
            "timestamp": datetime.now().isoformat()
        }), 200
        
    except Exception as e:
        logger.error(f"Health check failed: {e}", exc_info=True)
        return jsonify({
            "status": "error",
            "service": "enrichment-service",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500

@app.route('/enrich', methods=['POST'])
def enrich_invoice_data():
    """
    Enrich extracted invoice data with business intelligence.
    Expects: {"extracted_data": "json_string", "job_id": "unique_id"}
    Returns: {"success": bool, "content": str, "tokens_used": int, "processing_time": float}
    """
    try:
        start_time = time.time()
        data = request.get_json()
        
        if not data:
            return jsonify({
                "success": False,
                "error": "No JSON data provided"
            }), 400
        
        extracted_data = data.get('extracted_data')
        job_id = data.get('job_id', 'unknown')
        
        if not extracted_data:
            return jsonify({
                "success": False,
                "error": "extracted_data is required"
            }), 400
        
        logger.info(f"💡 Starting enrichment for job {job_id}")
        
        # Create enrichment function and process
        enrichment_func = create_enrichment_function()
        result = enrichment_func(extracted_data)
        
        processing_time = time.time() - start_time
        
        if result.success:
            logger.info(f"✅ Enrichment completed in {processing_time:.2f}s, {result.tokens_used} tokens")
            return jsonify({
                "success": True,
                "content": result.content,
                "tokens_used": result.tokens_used,
                "processing_time": processing_time,
                "job_id": job_id,
                "timestamp": datetime.now().isoformat()
            }), 200
        else:
            logger.error(f"❌ Enrichment failed: {result.error}")
            return jsonify({
                "success": False,
                "error": result.error,
                "processing_time": processing_time,
                "job_id": job_id,
                "timestamp": datetime.now().isoformat()
            }), 500
            
    except Exception as e:
        logger.error(f"🚨 Enrichment endpoint error: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Enrichment service failed",
            "message": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({
        "status": "error",
        "error": "Endpoint not found",
        "service": "enrichment-service",
        "available_endpoints": ["/health", "/enrich"],
        "timestamp": datetime.now().isoformat()
    }), 404

@app.errorhandler(500)
def internal_server_error(error):
    """Handle 500 errors"""
    logger.error(f"Internal server error: {error}")
    return jsonify({
        "status": "error",
        "error": "Internal server error",
        "service": "enrichment-service",
        "timestamp": datetime.now().isoformat()
    }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    logger.info(f"🚀 Enrichment service starting on port {port}")
    app.run(host='0.0.0.0', port=port)