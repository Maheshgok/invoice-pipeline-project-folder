"""
Simple Extraction Service - Basic Test Version
Minimal Flask app to verify Cloud Run deployment works
"""
import os
import logging
from flask import Flask, jsonify

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health():
    """Simple health check"""
    return jsonify({
        "status": "healthy",
        "service": "extraction-service-simple",
        "message": "Service is running"
    }), 200

@app.route('/test', methods=['GET'])
def test():
    """Test endpoint"""
    return jsonify({
        "status": "success",
        "message": "Simple test endpoint working"
    }), 200

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    logger.info(f"🚀 Simple service starting on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)