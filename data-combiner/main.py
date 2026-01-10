"""
Data Combiner Service - Phase 3
Restructured to use simple OpenAI handler
Combines and validates journal entries with AI assistance
"""
import os
import sys
import json
import logging
from datetime import datetime
from flask import Flask, request, jsonify
from typing import List, Dict, Any

# Add shared directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'shared'))
from simple_openai_handler import create_analysis_handler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

class DataCombinerService:
    def __init__(self):
        """Initialize with simple OpenAI handler for final analysis"""
        self.openai_handler = create_analysis_handler("data-combiner")
        logger.info("🔧 Data Combiner Service initialized with simple handler")
        
        self.validation_prompt = """
Review and validate these combined journal entries for accuracy and compliance.

Combined data: {combined_data}

Validate:
1. Double-entry balance (total debits = total credits)
2. Account code consistency
3. GST calculation accuracy
4. Missing or duplicate entries
5. Compliance with Indian accounting standards

Return JSON format:
{{
  "validation_summary": {{
    "balance_check": true,
    "gst_accuracy": true,
    "compliance_score": 95,
    "issues_found": [],
    "recommendations": []
  }},
  "corrected_entries": [],
  "final_totals": {{
    "total_debits": 0,
    "total_credits": 0,
    "gst_total": 0
  }}
}}
"""
    
    def combine_and_validate_data(self, extracted_data: dict, enriched_data: dict, job_id: str) -> dict:
        """Combine extracted and enriched data with AI validation"""
        try:
            logger.info(f"🔄 Combining data for job: {job_id}")
            
            # Combine the data
            combined_data = {
                'extracted_invoice_data': extracted_data,
                'enriched_data': enriched_data,
                'processing_metadata': {
                    'combined_at': datetime.utcnow().isoformat(),
                    'job_id': job_id,
                    'combiner_version': '2.0.0'
                }
            }
            
            # AI-powered validation
            logger.info("🤖 Running AI validation on combined data")
            validation_result = self.openai_handler.call_api(
                prompt=self.validation_prompt.format(combined_data=json.dumps(combined_data, indent=2)),
                context=f"Validation_{job_id}"
            )
            
            validation_summary = {}
            if validation_result['success']:
                try:
                    validation_summary = json.loads(validation_result['content'])
                except json.JSONDecodeError:
                    validation_summary = {"validation_summary": {"parse_error": validation_result['content']}}
            
            # Final combined result
            final_result = {
                'combined_data': combined_data,
                'ai_validation': validation_summary.get('validation_summary', {}),
                'processing_stats': {
                    'validation_tokens': validation_result['tokens_used'] if validation_result['success'] else 0,
                    'processing_time': datetime.utcnow().isoformat()
                }
            }
            
            logger.info(f"✅ Data combination completed for {job_id}")
            
            return {
                'status': 'SUCCESS',
                'job_id': job_id,
                'final_result': final_result
            }
            
        except Exception as e:
            logger.error(f"🚨 Error in data combination: {str(e)}")
            return {
                'status': 'FAILED',
                'job_id': job_id,
                'error': str(e)
            }

# Initialize service
combiner_service = DataCombinerService()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'service': 'data-combiner',
        'status': 'healthy',
        'version': '2.0.0',
        'handler': 'simple_openai_handler',
        'capabilities': ['data_combination', 'ai_validation', 'compliance_check']
    })

@app.route('/combine-invoice-data', methods=['POST'])
def combine_invoice_data():
    """Main combination endpoint using simple handler"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'status': 'error',
                'error': 'No JSON data provided'
            }), 400
        
        extracted_data = data.get('extracted_data')
        enriched_data = data.get('enriched_data') 
        job_id = data.get('job_id', 'unknown')
        
        if not extracted_data or not enriched_data:
            return jsonify({
                'status': 'error',
                'error': 'Both extracted_data and enriched_data are required'
            }), 400
        
        logger.info(f"📥 Processing combination request for job: {job_id}")
        
        # Combine data through simple handler service
        result = combiner_service.combine_and_validate_data(extracted_data, enriched_data, job_id)
        
        if result['status'] == 'SUCCESS':
            return jsonify(result), 200
        else:
            return jsonify(result), 500
            
    except Exception as e:
        logger.error(f"🚨 Critical error in combination endpoint: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': 'Critical system failure',
            'message': str(e)
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)
        for i, entry in enumerate(journal_entries):
            if not entry.get('account_name'):
                validation_errors.append(f"Entry {i+1}: Missing account_name")
            if 'debit' not in entry or 'credit' not in entry:
                validation_errors.append(f"Entry {i+1}: Missing debit or credit")
        
        result = {
            'valid': len(validation_errors) == 0 and is_balanced,
            'balanced': is_balanced,
            'totals': {
                'total_debit': round(total_debit, 2),
                'total_credit': round(total_credit, 2),
                'difference': round(balance_difference, 2)
            },
            'validation_errors': validation_errors,
            'entry_count': len(journal_entries)
        }
        
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"❌ Error validating journal entries: {str(e)}")
        return jsonify({
            'error': 'Validation failed',
            'details': str(e)
        }), 500

@app.route('/combine-and-store', methods=['POST'])
def combine_and_store_data():
    """
    Stage 3: Combine all processed data and store to datastore
    
    Input: {
        "job_id": "unique_job_id",
        "processed_data": {
            "standardized_header": {...},
            "standardized_journal_entries": [...]
        }
    }
    
    Output: {
        "status": "SUCCESS",
        "combined_document": {...},
        "storage_result": {...}
    }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'error': 'No JSON data provided'}), 400
        
        job_id = data.get('job_id', 'unknown')
        processed_data = data.get('processed_data', {})
        
        logger.info(f"🔗 Stage 3: Combining and storing data for job: {job_id}")
        
        # Extract processed components
        header_data = processed_data.get('standardized_header', {})
        journal_entries = processed_data.get('standardized_journal_entries', [])
        
        if not header_data:
            return jsonify({'status': 'error', 'error': 'Missing header data'}), 400
        
        if not journal_entries:
            return jsonify({'status': 'error', 'error': 'Missing journal entries'}), 400
        
        # Create final combined document
        combined_document = {
            'job_id': job_id,
            'processing_timestamp': datetime.now().isoformat(),
            'document_header': header_data,
            'journal_entries': journal_entries,
            'document_metadata': {
                'total_entries': len(journal_entries),
                'processing_pipeline': 'microservices_v1',
                'stages_completed': ['1A', '1B', '2A', '2B', '2C', '2D', '3']
            }
        }
        
        # Validate accounting balance
        balance_check = validate_accounting_balance(journal_entries)
        combined_document['balance_validation'] = balance_check
        
        if not balance_check['is_balanced']:
            logger.warning(f"⚠️ Job {job_id} - Accounting entries not balanced!")
        
        # Store to datastore (simulate for now)
        storage_result = {
            'stored': True,
            'document_id': f"{job_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            'storage_timestamp': datetime.now().isoformat(),
            'storage_location': f"invoices/{job_id}",
            'document_size_bytes': len(json.dumps(combined_document))
        }
        
        logger.info(f"✅ Stage 3 completed for job {job_id}")
        
        return jsonify({
            'status': 'SUCCESS',
            'job_id': job_id,
            'combined_document': combined_document,
            'storage_result': storage_result,
            'summary': {
                'total_journal_entries': len(journal_entries),
                'is_balanced': balance_check['is_balanced'],
                'total_debit': balance_check['total_debit'],
                'total_credit': balance_check['total_credit']
            }
        }), 200
        
    except Exception as e:
        logger.error(f"🚨 Critical error in Stage 3: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': 'Critical system failure',
            'message': str(e)
        }), 500

def validate_accounting_balance(journal_entries: List[Dict]) -> Dict[str, Any]:
    """Validate that all journal entries are balanced (debits = credits)"""
    try:
        total_debit = 0
        total_credit = 0
        
        for entry in journal_entries:
            entries = entry.get('entries', [])
            for line in entries:
                total_debit += float(line.get('debit', 0))
                total_credit += float(line.get('credit', 0))
        
        is_balanced = abs(total_debit - total_credit) < 0.01  # Allow for rounding
        
        return {
            'is_balanced': is_balanced,
            'total_debit': total_debit,
            'total_credit': total_credit,
            'difference': abs(total_debit - total_credit)
        }
        
    except Exception as e:
        logger.error(f"❌ Balance validation failed: {str(e)}")
        return {
            'is_balanced': False,
            'error': str(e)
        }

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)