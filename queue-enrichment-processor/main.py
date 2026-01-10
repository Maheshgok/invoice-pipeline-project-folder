"""
Queue Enrichment Processor - Phase 2
Restructured to use simple OpenAI handler
Enhanced data enrichment with proven API patterns
"""

import os
import sys
import json
import logging
from flask import Flask, request, jsonify
from typing import List, Dict, Any

# Add shared directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'shared'))
from simple_openai_handler import create_enrichment_handler

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

class QueueEnrichmentService:
    def __init__(self):
        """Initialize with simple OpenAI handler optimized for enrichment"""
        self.openai_handler = create_enrichment_handler("queue-enrichment-processor")
        logger.info("🔧 Queue Enrichment Service initialized with simple handler")
        
        # Define enrichment prompts (can be modified at runtime)
        self.enrichment_prompt = """
Enhance this extracted invoice data with additional business insights and validation.

Input data: {extracted_data}

Add these enrichments:
1. Data quality assessment and validation
2. Business category classification for each item
3. Tax compliance verification
4. Accounting journal entry suggestions
5. Risk assessment and flags
6. Supplier relationship insights

Return JSON format:
{{
  "original_data": {{}},
  "enrichments": {{
    "data_quality": {{
      "score": 0,
      "issues": [],
      "validation_status": ""
    }},
    "business_insights": {{
      "item_categories": [],
      "expense_classification": "",
      "supplier_risk_level": ""
    }},
    "accounting_suggestions": {{
      "journal_entries": [],
      "tax_treatment": "",
      "compliance_notes": []
    }},
    "enhanced_line_items": []
  }}
}}
"""
        
        self.validation_prompt = """
Validate and cross-check this invoice data for consistency and accuracy.

Invoice data: {invoice_data}

Check for:
1. Mathematical accuracy (totals, tax calculations)
2. Data consistency (dates, amounts, references)
3. Compliance requirements (GST, HSN codes)
4. Business logic validation

Return JSON format:
{{
  "validation_results": {{
    "mathematical_accuracy": true,
    "data_consistency": true,
    "compliance_check": true,
    "overall_score": 0,
    "issues_found": [],
    "recommendations": []
  }}
}}
"""
    def enrich_invoice_data(self, extracted_data: dict, job_id: str) -> dict:
        """Enrich extracted invoice data with business insights"""
        try:
            logger.info(f"🚀 Starting data enrichment for job: {job_id}")
            
            # Stage 2A: Data enrichment
            logger.info("💡 Stage 2A: Enriching data with business insights")
            enrichment_result = self.openai_handler.call_api(
                prompt=self.enrichment_prompt.format(extracted_data=json.dumps(extracted_data, indent=2)),
                context=f"Enrichment_{job_id}"
            )
            
            if not enrichment_result['success']:
                return {
                    'status': 'FAILED',
                    'stage': '2A',
                    'error': enrichment_result['error'],
                    'job_id': job_id
                }
            
            # Parse enrichment JSON
            try:
                enriched_data = json.loads(enrichment_result['content'])
            except json.JSONDecodeError as e:
                logger.warning(f"⚠️ Enrichment JSON parse failed: {e}")
                enriched_data = {"enrichments": {"parse_error": enrichment_result['content']}}
            
            # Stage 2B: Validation
            logger.info("✅ Stage 2B: Validating data consistency")
            validation_result = self.openai_handler.call_api(
                prompt=self.validation_prompt.format(invoice_data=json.dumps(extracted_data, indent=2)),
                context=f"Validation_{job_id}"
            )
            
            validation_data = {}
            if validation_result['success']:
                try:
                    validation_data = json.loads(validation_result['content'])
                except json.JSONDecodeError:
                    validation_data = {"validation_results": {"parse_error": validation_result['content']}}
            
            # Combine results
            final_enriched_data = {
                'original_extracted_data': extracted_data,
                'enrichments': enriched_data.get('enrichments', {}),
                'validation': validation_data.get('validation_results', {}),
                'processing_metadata': {
                    'enriched_at': logger.info(f"⏰ {job_id}"),
                    'enrichment_version': '2.0.0'
                }
            }
            
            logger.info(f"✅ Data enrichment completed for {job_id}")
            
            return {
                'status': 'SUCCESS',
                'job_id': job_id,
                'enriched_data': final_enriched_data,
                'processing_stats': {
                    'enrichment_tokens': enrichment_result['tokens_used'],
                    'validation_tokens': validation_result['tokens_used'] if validation_result['success'] else 0,
                    'total_tokens': enrichment_result['tokens_used'] + (validation_result['tokens_used'] if validation_result['success'] else 0)
                }
            }
            
        except Exception as e:
            logger.error(f"🚨 Critical error in data enrichment: {str(e)}")
            return {
                'status': 'CRITICAL_FAIL',
                'job_id': job_id,
                'error': str(e)
            }

# Initialize service
enrichment_service = QueueEnrichmentService()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'service': 'queue-enrichment-processor',
        'status': 'healthy',
        'version': '2.0.0',
        'handler': 'simple_openai_handler',
        'capabilities': ['data_enrichment', 'validation', 'business_insights']
    })

@app.route('/enrich-invoice-data', methods=['POST'])
def enrich_invoice_data():
    """Main enrichment endpoint using simple handler"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'status': 'error',
                'error': 'No JSON data provided'
            }), 400
        
        extracted_data = data.get('extracted_data')
        job_id = data.get('job_id', 'unknown')
        
        if not extracted_data:
            return jsonify({
                'status': 'error',
                'error': 'extracted_data is required'
            }), 400
        
        logger.info(f"📥 Processing enrichment request for job: {job_id}")
        
        # Enrich data through simple handler service
        result = enrichment_service.enrich_invoice_data(extracted_data, job_id)
        
        if result['status'] == 'SUCCESS':
            return jsonify(result), 200
        else:
            return jsonify(result), 500
            
    except Exception as e:
        logger.error(f"🚨 Critical error in enrichment endpoint: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': 'Critical system failure',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)

    def _standardize_data(self, data: Dict[str, Any], data_type: str) -> Dict[str, Any]:
        """Stage 2C/2D: Standardize data structure and field names"""
        try:
            logger.info(f"📝 Stage 2C/2D: Standardizing {data_type}")
            
            data_json = json.dumps(data, indent=2)
            full_prompt = f"{self.standardizer_prompt}\n\nDATA TYPE: {data_type}\n\nDATA TO STANDARDIZE:\n{data_json}"
            
            response = self.standardizer_client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "system", "content": full_prompt}],
                max_tokens=2000,
                temperature=0.1
            )
            
            result_text = response.choices[0].message.content.strip()
            
            try:
                result = json.loads(result_text)
                logger.info(f"✅ {data_type} standardization completed")
                
                return {
                    'success': True,
                    'standardized_data': result,
                    'tokens_used': response.usage.total_tokens,
                    'data_type': data_type
                }
            except json.JSONDecodeError as e:
                logger.error(f"❌ {data_type} standardization JSON parse error: {str(e)}")
                return {
                    'success': False,
                    'error': f"JSON parse failed: {str(e)}",
                    'raw_response': result_text,
                    'data_type': data_type
                }
                
        except Exception as e:
            logger.error(f"❌ {data_type} standardization failed: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'data_type': data_type
            }

    def process_extracted_data(self, extracted_data: Dict[str, Any], job_id: str) -> Dict[str, Any]:
        """Process extracted data through all Stage 2 steps"""
        try:
            logger.info(f"🚀 Starting Stage 2 processing for job: {job_id}")
            
            header_data = extracted_data.get('header_data', {})
            line_items = extracted_data.get('line_items', [])
            
            # Stage 2A: Create queue of line items
            chunks = self._chunk_line_items(line_items)
            
            # Stage 2B: Process each chunk through accountant
            all_journal_entries = []
            for chunk_idx, chunk in enumerate(chunks):
                chunk_result = self._enrich_chunk(chunk, chunk_idx)
                
                if chunk_result['success']:
                    all_journal_entries.extend(chunk_result['journal_entries'])
                else:
                    return {
                        'status': 'FAILED',
                        'stage': f'2B-chunk-{chunk_idx + 1}',
                        'error': chunk_result['error'],
                        'job_id': job_id
                    }
            
            logger.info(f"💰 Stage 2B completed: {len(all_journal_entries)} total journal entries")
            
            # Stage 2C: Standardize journal entries
            journal_standardization = self._standardize_data(
                {'journal_entries': all_journal_entries}, 
                'journal_entries'
            )
            
            if not journal_standardization['success']:
                return {
                    'status': 'FAILED',
                    'stage': '2C',
                    'error': journal_standardization['error'],
                    'job_id': job_id
                }
            
            # Stage 2D: Standardize header data
            header_standardization = self._standardize_data(header_data, 'header_data')
            
            if not header_standardization['success']:
                return {
                    'status': 'FAILED',
                    'stage': '2D', 
                    'error': header_standardization['error'],
                    'job_id': job_id
                }
            
            # Success - return processed data
            processed_data = {
                'standardized_header': header_standardization['standardized_data'],
                'standardized_journal_entries': journal_standardization['standardized_data'].get('journal_entries', [])
            }
            
            logger.info(f"✅ Stage 2 processing completed for {job_id}")
            
            return {
                'status': 'SUCCESS',
                'job_id': job_id,
                'processed_data': processed_data,
                'processing_stats': {
                    'total_line_items': len(line_items),
                    'chunks_processed': len(chunks),
                    'journal_entries_generated': len(processed_data['standardized_journal_entries'])
                }
            }
            
        except Exception as e:
            logger.error(f"🚨 Critical error in Stage 2 processing: {str(e)}")
            return {
                'status': 'CRITICAL_FAIL',
                'job_id': job_id,
                'error': str(e)
            }

# Initialize service
processor_service = QueueEnrichmentProcessor()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'service': 'queue-enrichment-processor',
        'status': 'healthy',
        'version': '1.0.0',
        'capabilities': ['queuing', 'enrichment', 'standardization', 'normalization']
    })

@app.route('/process-extracted-data', methods=['POST'])
def process_extracted_data():
    """Main processing endpoint for Stages 2A + 2B + 2C + 2D"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'status': 'error',
                'error': 'No JSON data provided'
            }), 400
        
        extracted_data = data.get('extracted_data')
        job_id = data.get('job_id', 'unknown')
        
        if not extracted_data:
            return jsonify({
                'status': 'error', 
                'error': 'extracted_data is required'
            }), 400
        
        logger.info(f"📥 Processing Stage 2 request for job: {job_id}")
        
        # Process through service
        result = processor_service.process_extracted_data(extracted_data, job_id)
        
        if result['status'] == 'SUCCESS':
            return jsonify(result), 200
        else:
            return jsonify(result), 500
            
    except Exception as e:
        logger.error(f"🚨 Critical error in processing endpoint: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': 'Critical system failure',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)