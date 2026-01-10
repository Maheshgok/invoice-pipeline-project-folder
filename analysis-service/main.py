"""
Invoice Analysis & Validation Service - Standalone Cloud Run Service
Pure function approach for final validation and tabulation
"""
import os
import time
import json
import logging
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS

# Import functional handler
from functional_openai_handler import create_analysis_function

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
        test_func = create_analysis_function()
        
        return jsonify({
            "status": "healthy",
            "service": "analysis-service",
            "version": "1.0-functional",
            "handler_type": "functional_openai",
            "timestamp": datetime.now().isoformat()
        }), 200
        
    except Exception as e:
        logger.error(f"Health check failed: {e}", exc_info=True)
        return jsonify({
            "status": "error",
            "service": "analysis-service",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500

@app.route('/analyze', methods=['POST'])
def analyze_invoice_data():
    """
    Analyze and validate combined invoice data.
    Expects: {"combined_data": {"extracted_data": "...", "enriched_data": "..."}, "job_id": "unique_id"}
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
        
        combined_data = data.get('combined_data')
        job_id = data.get('job_id', 'unknown')
        
        if not combined_data:
            return jsonify({
                "success": False,
                "error": "combined_data is required"
            }), 400
        
        logger.info(f"🔍 Starting analysis for job {job_id}")
        
        # Create analysis function and process
        analysis_func = create_analysis_function()
        result = analysis_func(json.dumps(combined_data))
        
        processing_time = time.time() - start_time
        
        if result.success:
            logger.info(f"✅ Analysis completed in {processing_time:.2f}s, {result.tokens_used} tokens")
            return jsonify({
                "success": True,
                "content": result.content,
                "tokens_used": result.tokens_used,
                "processing_time": processing_time,
                "job_id": job_id,
                "timestamp": datetime.now().isoformat()
            }), 200
        else:
            logger.error(f"❌ Analysis failed: {result.error}")
            return jsonify({
                "success": False,
                "error": result.error,
                "processing_time": processing_time,
                "job_id": job_id,
                "timestamp": datetime.now().isoformat()
            }), 500
            
    except Exception as e:
        logger.error(f"🚨 Analysis endpoint error: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Analysis service failed",
            "message": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500

@app.route('/tabulate', methods=['POST'])
def create_final_tabulation():
    """
    Create final tabulated summary from all phases.
    Expects: {"extraction_result": {...}, "enrichment_result": {...}, "analysis_result": {...}, "job_id": "unique_id"}
    Returns: Complete tabulated invoice summary
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                "success": False,
                "error": "No JSON data provided"
            }), 400
        
        extraction_result = data.get('extraction_result', {})
        enrichment_result = data.get('enrichment_result', {})
        analysis_result = data.get('analysis_result', {})
        job_id = data.get('job_id', 'unknown')
        
        logger.info(f"📋 Creating tabulation for job {job_id}")
        
        # Create comprehensive tabulation
        tabulation = _create_comprehensive_tabulation(
            extraction_result, 
            enrichment_result, 
            analysis_result
        )
        
        logger.info(f"✅ Tabulation created for job {job_id}")
        return jsonify({
            "success": True,
            "tabulation": tabulation,
            "job_id": job_id,
            "timestamp": datetime.now().isoformat()
        }), 200
        
    except Exception as e:
        logger.error(f"🚨 Tabulation endpoint error: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "error": "Tabulation failed",
            "message": str(e),
            "timestamp": datetime.now().isoformat()
        }), 500

def _create_comprehensive_tabulation(extraction_result, enrichment_result, analysis_result):
    """Create comprehensive tabulated summary of all processing phases."""
    try:
        # Safe JSON parsing
        extracted_json = _safe_json_parse(extraction_result.get('content', ''))
        enriched_json = _safe_json_parse(enrichment_result.get('content', ''))
        analysis_json = _safe_json_parse(analysis_result.get('content', ''))
        
        # Extract key information
        invoice_header = {}
        line_items = []
        business_intelligence = {}
        
        # Process extraction data
        if extracted_json and isinstance(extracted_json, dict):
            invoice_data = extracted_json.get('invoice_data', extracted_json)
            if isinstance(invoice_data, dict):
                invoice_header = {
                    'invoice_number': invoice_data.get('invoice_number'),
                    'vendor_name': invoice_data.get('vendor_name'),
                    'total_amount': invoice_data.get('total_amount'),
                    'date': invoice_data.get('invoice_date')
                }
                line_items = invoice_data.get('line_items', [])
        
        # Process enrichment data
        if enriched_json and isinstance(enriched_json, dict):
            enrichments = enriched_json.get('enrichments', enriched_json)
            if isinstance(enrichments, dict):
                business_intelligence = {
                    'business_category': enrichments.get('business_category'),
                    'data_quality_score': enrichments.get('data_quality_score'),
                    'accounting_entries': enrichments.get('accounting_entries', [])
                }
        
        return {
            "tabulation_summary": {
                "document_type": "Invoice - Cloud Processed",
                "processing_status": "Complete",
                "processing_mode": "standalone_microservices"
            },
            "invoice_header": invoice_header,
            "line_items_summary": {
                "item_count": len(line_items) if isinstance(line_items, list) else 0,
                "items": line_items[:10] if isinstance(line_items, list) else []
            },
            "business_intelligence": business_intelligence,
            "processing_stats": {
                "extraction_tokens": extraction_result.get('tokens_used', 0),
                "enrichment_tokens": enrichment_result.get('tokens_used', 0),
                "analysis_tokens": analysis_result.get('tokens_used', 0),
                "total_tokens": (
                    extraction_result.get('tokens_used', 0) + 
                    enrichment_result.get('tokens_used', 0) + 
                    analysis_result.get('tokens_used', 0)
                )
            },
            "validation_summary": {
                "extraction_successful": extraction_result.get('success', False),
                "enrichment_successful": enrichment_result.get('success', False),
                "analysis_successful": analysis_result.get('success', False),
                "overall_score": "High" if all([
                    extraction_result.get('success', False),
                    enrichment_result.get('success', False),
                    analysis_result.get('success', False)
                ]) else "Medium"
            }
        }
        
    except Exception as e:
        logger.warning(f"⚠️ Tabulation creation failed: {e}")
        return {
            "tabulation_summary": {
                "document_type": "Invoice - Cloud Processed",
                "processing_status": "Complete with tabulation warning",
                "warning": f"Tabulation failed: {e}"
            }
        }

def _safe_json_parse(content):
    """Safely parse JSON content with fallback handling."""
    if not content:
        return None
    
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        if '```json' in content:
            start = content.find('```json') + 7
            end = content.find('```', start)
            if end != -1:
                json_content = content[start:end].strip()
                try:
                    return json.loads(json_content)
                except json.JSONDecodeError:
                    pass
        return None

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({
        "status": "error",
        "error": "Endpoint not found",
        "service": "analysis-service",
        "available_endpoints": ["/health", "/analyze", "/tabulate"],
        "timestamp": datetime.now().isoformat()
    }), 404

@app.errorhandler(500)
def internal_server_error(error):
    """Handle 500 errors"""
    logger.error(f"Internal server error: {error}")
    return jsonify({
        "status": "error",
        "error": "Internal server error",
        "service": "analysis-service",
        "timestamp": datetime.now().isoformat()
    }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    logger.info(f"🚀 Analysis service starting on port {port}")
    app.run(host='0.0.0.0', port=port)