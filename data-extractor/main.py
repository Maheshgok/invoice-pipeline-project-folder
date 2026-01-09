"""
Data Extractor Service - Phase 1 (Stages 1A + 1B)
Specialized Cloud Run service for invoice data extraction only
Optimized for OCR and data parsing tasks
"""

import os
import json
import logging
from flask import Flask, request, jsonify
from openai import OpenAI
from google.cloud import secretmanager
import tiktoken
import time

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

class DataExtractorService:
    def __init__(self):
        # Initialize OpenAI client with DataAnalyst1 key for extraction
        self.client = self._initialize_openai_client()
        self.encoding = tiktoken.encoding_for_model("gpt-4o")
        
        # Extraction prompts
        self.header_prompt = """
You are a precise data extraction specialist. Extract ONLY header/document information from this invoice image.

EXTRACT THESE FIELDS ONLY:
- Vendor/Supplier details (name, address, GST number)
- Customer/Bill-to details (name, address, GST number)  
- Invoice metadata (number, date, due date)
- Financial totals (subtotal, tax amounts, total amount)
- Payment terms and conditions

DO NOT EXTRACT LINE ITEMS - Focus only on document header information.

Return JSON format:
{
  "vendor": {"name": "", "address": "", "gst_number": ""},
  "customer": {"name": "", "address": "", "gst_number": ""},
  "invoice_details": {"number": "", "date": "", "due_date": ""},
  "totals": {"subtotal": 0, "tax_amount": 0, "total_amount": 0},
  "payment_terms": ""
}
"""
        
        self.line_items_prompt = """
You are a precise data extraction specialist. Extract ONLY the line items table from this invoice image.

EXTRACT THESE FIELDS FOR EACH LINE ITEM:
- Item description/name
- Quantity
- Unit price
- Line total/amount
- Tax rate (if applicable)
- HSN/SAC code (if applicable)

DO NOT EXTRACT HEADER INFORMATION - Focus only on tabular line item data.

Return JSON format:
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

    def _initialize_openai_client(self) -> OpenAI:
        """Initialize OpenAI client with DataAnalyst1 key"""
        try:
            # Use DataAnalyst1 key for extraction tasks
            api_key = "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"
            
            client = OpenAI(api_key=api_key, base_url="https://api.openai.com/v1", timeout=300.0, max_retries=3)
            
            logger.info("🔑 Data Extractor initialized with DataAnalyst1 key")
            return client
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize OpenAI client: {str(e)}")
            raise

    def _count_tokens(self, text: str) -> int:
        """Count tokens in text"""
        try:
            return len(self.encoding.encode(text))
        except Exception:
            return len(text) // 4

    def _extract_data(self, prompt: str, image_content: str, stage_name: str) -> dict:
        """Extract data using OpenAI Vision API"""
        try:
            # Token management
            input_tokens = self._count_tokens(prompt)
            logger.info(f"📊 {stage_name} - Input tokens: {input_tokens}")
            
            if input_tokens > 6000:  # Conservative limit for extraction
                logger.warning(f"⚠️ {stage_name} - High token count, may truncate")
            
            logger.info(f"🤖 Calling OpenAI Vision API for {stage_name}")
            
            # Properly format message for OpenAI Vision API
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[{
                    "role": "user", 
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_content}"
                            }
                        }
                    ]
                }],
                temperature=0.1
            )
            
            result_text = response.choices[0].message.content.strip()
            
            # Parse JSON response
            try:
                result = json.loads(result_text)
                logger.info(f"✅ {stage_name} extraction completed")
                return {
                    'success': True,
                    'data': result,
                    'tokens_used': response.usage.total_tokens,
                    'stage': stage_name
                }
            except json.JSONDecodeError as e:
                logger.error(f"❌ {stage_name} JSON parse error: {str(e)}")
                return {
                    'success': False,
                    'error': f"JSON parse failed: {str(e)}",
                    'raw_response': result_text,
                    'stage': stage_name
                }
                
        except Exception as e:
            logger.error(f"❌ {stage_name} extraction failed: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'stage': stage_name
            }

    def extract_invoice_data(self, image_content: str, job_id: str) -> dict:
        """Extract both header and line items from invoice"""
        try:
            logger.info(f"🚀 Starting data extraction for job: {job_id}")
            
            # Stage 1A: Extract header data
            logger.info("📋 Stage 1A: Extracting header data")
            header_result = self._extract_data(
                self.header_prompt, 
                image_content, 
                "Stage_1A_Header"
            )
            
            if not header_result['success']:
                return {
                    'status': 'FAILED',
                    'stage': '1A',
                    'error': header_result['error'],
                    'job_id': job_id
                }
            
            # Stage 1B: Extract line items
            logger.info("📦 Stage 1B: Extracting line items")
            line_items_result = self._extract_data(
                self.line_items_prompt,
                image_content,
                "Stage_1B_LineItems"
            )
            
            if not line_items_result['success']:
                return {
                    'status': 'FAILED',
                    'stage': '1B', 
                    'error': line_items_result['error'],
                    'job_id': job_id
                }
            
            # Success - return extracted data
            extracted_data = {
                'header_data': header_result['data'],
                'line_items': line_items_result['data'].get('line_items', [])
            }
            
            logger.info(f"✅ Data extraction completed for {job_id}")
            logger.info(f"📊 Extracted {len(extracted_data['line_items'])} line items")
            
            return {
                'status': 'SUCCESS',
                'job_id': job_id,
                'extracted_data': extracted_data,
                'extraction_stats': {
                    'header_tokens': header_result['tokens_used'],
                    'line_items_tokens': line_items_result['tokens_used'],
                    'total_line_items': len(extracted_data['line_items'])
                }
            }
            
        except Exception as e:
            logger.error(f"🚨 Critical error in data extraction: {str(e)}")
            return {
                'status': 'CRITICAL_FAIL',
                'job_id': job_id,
                'error': str(e)
            }

# Initialize service
extractor_service = DataExtractorService()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'service': 'data-extractor',
        'status': 'healthy',
        'version': '1.0.0',
        'capabilities': ['header_extraction', 'line_items_extraction']
    })

@app.route('/extract-invoice-data', methods=['POST'])
def extract_invoice_data():
    """Main extraction endpoint for Stages 1A + 1B"""
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
        
        # Extract data through service
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