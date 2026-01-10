"""
Data Extractor Service - Phase 1 (Stages 1A + 1B)
Specialized Cloud Run service for invoice data extraction only
Using simple OpenAI handler with runtime prompts
"""

import os
import sys
import json
import logging
from flask import Flask, request, jsonify

# Add shared directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'shared'))
from simple_openai_handler import create_extraction_handler

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

class DataExtractorService:
    def __init__(self):
        """Initialize with simple OpenAI handler"""
        self.openai_handler = create_extraction_handler("data-extractor")
        logger.info("🔧 Data Extractor Service initialized with simple handler")
        
        # Define prompts as class variables (can be modified at runtime)
        self.header_prompt = """
Extract ONLY header/document information from this invoice image.

EXTRACT:
- Vendor details (name, address, GST)
- Customer details (name, address, GST)
- Invoice metadata (number, date, due_date)
- Financial totals (subtotal, tax, total)

Return JSON:
{
  "vendor": {"name": "", "address": "", "gst_number": ""},
  "customer": {"name": "", "address": "", "gst_number": ""},
  "invoice_details": {"number": "", "date": "", "due_date": ""},
  "totals": {"subtotal": 0, "tax_amount": 0, "total_amount": 0}
}
"""
        
        self.line_items_prompt = """
Extract ONLY line items from this invoice image.

EXTRACT each line item:
- Description, quantity, unit_price, total, tax_rate, hsn_code

Return JSON:
{
  "line_items": [
    {
      "description": "",
      "quantity": 0,
      "unit_price": 0,
      "line_total": 0,
      "tax_rate": 0,
      "hsn_code": ""
    }
  ]
}
"""

    def extract_invoice_data(self, image_content: str, job_id: str) -> dict:
        """Extract both header and line items using simple handler"""
        try:
            logger.info(f"🚀 Starting data extraction for job: {job_id}")
            
            # Stage 1A: Extract header data
            logger.info("📋 Stage 1A: Extracting header data")
            header_result = self.openai_handler.call_api(
                prompt=self.header_prompt,
                image_base64=image_content,
                context=f"Header_{job_id}"
            )
            
            if not header_result['success']:
                return {
                    'status': 'FAILED',
                    'stage': '1A',
                    'error': header_result['error'],
                    'job_id': job_id
                }
            
            # Parse header JSON
            try:
                header_data = json.loads(header_result['content'])
            except json.JSONDecodeError:
                header_data = {"error": "JSON parse failed", "raw": header_result['content']}
            
            # Stage 1B: Extract line items
            logger.info("📦 Stage 1B: Extracting line items")
            line_items_result = self.openai_handler.call_api(
                prompt=self.line_items_prompt,
                image_base64=image_content,
                context=f"LineItems_{job_id}"
            )
            
            if not line_items_result['success']:
                return {
                    'status': 'FAILED',
                    'stage': '1B',
                    'error': line_items_result['error'],
                    'job_id': job_id
                }
            
            # Parse line items JSON
            try:
                line_items_data = json.loads(line_items_result['content'])
                line_items = line_items_data.get('line_items', [])
            except json.JSONDecodeError:
                line_items = []
            
            # Success response
            extracted_data = {
                'header_data': header_data,
                'line_items': line_items
            }
            
            logger.info(f"✅ Data extraction completed for {job_id}")
            logger.info(f"📊 Extracted {len(line_items)} line items")
            
            return {
                'status': 'SUCCESS',
                'job_id': job_id,
                'extracted_data': extracted_data,
                'extraction_stats': {
                    'header_tokens': header_result['tokens_used'],
                    'line_items_tokens': line_items_result['tokens_used'],
                    'total_line_items': len(line_items)
                }
            }
            
        except Exception as e:
            logger.error(f"🚨 Critical error in data extraction: {str(e)}")
            return {
                'status': 'CRITICAL_FAIL',
                'job_id': job_id,
                'error': str(e)
            }

# Initialize service with simple handler
extractor_service = DataExtractorService()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'service': 'data-extractor',
        'status': 'healthy',
        'version': '2.0.0',
        'handler': 'simple_openai_handler',
        'capabilities': ['header_extraction', 'line_items_extraction']
    })

@app.route('/extract-invoice-data', methods=['POST'])
def extract_invoice_data():
    """Main extraction endpoint using simple handler"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'status': 'error',
                'error': 'No JSON data provided'
            }), 400
        
        image_content = data.get('image_content')
        job_id = data.get('job_id', 'unknown')
        
        if not image_content:
            return jsonify({
                'status': 'error',
                'error': 'image_content is required'
            }), 400
        
        logger.info(f"📥 Processing extraction request for job: {job_id}")
        
        # Extract data through simple handler service
        result = extractor_service.extract_invoice_data(image_content, job_id)
        
        if result['status'] == 'SUCCESS':
            return jsonify(result), 200
        else:
            return jsonify(result), 500
            
    except Exception as e:
        logger.error(f"🚨 Critical error in extraction endpoint: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': 'Critical system failure',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)