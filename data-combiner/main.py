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
from flask_cors import CORS
from typing import List, Dict, Any
from google.cloud import firestore

from simple_openai_handler import create_analysis_handler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Configure CORS
CORS(app, resources={r"/*": {"origins": "*", "methods": ["GET", "POST", "OPTIONS"], "allow_headers": ["Content-Type", "Authorization"]}})

# Lazy initialization of expensive resources
project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
firestore_client = None  # Initialize on first use

def get_firestore_client():
    """Lazy initialization of Firestore client"""
    global firestore_client
    if firestore_client is None:
        from google.cloud import firestore
        firestore_client = firestore.Client(project=project_id)
        logger.info("🔥 Firestore client initialized")
    return firestore_client

class DataCombinerService:
    def __init__(self):
        """Initialize with lazy loading for faster startup"""
        self.openai_handler = create_analysis_handler("data-combiner")
        logger.info("🔧 Data Combiner Service initialized with lazy loading")
        
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
    
    def store_results_in_firestore(self, final_result: Dict[str, Any], user_context: Dict[str, Any], job_id: str) -> None:
        """
        Store results in user's Firestore collection using existing isolation patterns
        
        Args:
            final_result: Complete processing result
            user_context: User context for proper collection path
            job_id: Job identifier for document ID
        """
        try:
            user_uid = user_context['uid']
            user_email = user_context['email']
            
            # Use existing user isolation pattern: users/{uid}/invoice_results
            collection_path = f'users/{user_uid}/invoice_results'
            
            # Prepare result for Firestore (maintain existing nomenclature)
            firestore_result = {
                'job_id': job_id,
                'filename': user_context.get('filename', 'unknown.pdf'),
                'status': 'completed',
                'processing_mode': 'orchestrated_pipeline',
                'timestamp': datetime.now().isoformat(),
                'source': 'data_combiner',
                
                # User isolation fields (existing pattern)
                'userUID': user_uid,
                'userEmail': user_email,
                'createdAt': firestore.SERVER_TIMESTAMP,
                
                # Complete result data
                'orchestrator_result': final_result,
                
                # Extract key fields for frontend compatibility
                'tabulation_summary': final_result.get('tabulation_summary', {}),
                'invoice_header': final_result.get('invoice_header', {}), 
                'enriched_line_items': final_result.get('enriched_line_items', []),
                'tabulated_totals': final_result.get('tabulated_totals', {}),
                
                # For CSV export compatibility
                'tabulated_results': final_result,
                
                # Processing metadata
                'processing_metadata': {
                    'stored_by': 'data_combiner',
                    'storage_timestamp': datetime.now().isoformat(),
                    'user_bucket_pattern': f"watch_mail_trial_invoice_{user_uid[:8].lower()}"
                }
            }
            
            # Store in Firestore using job_id as document ID (existing pattern)
            doc_ref = firestore_client.collection(collection_path).document(job_id)
            doc_ref.set(firestore_result, merge=True)
            
            logger.info(f"💾 Results stored in Firestore: {collection_path}/{job_id}")
            logger.info(f"👤 User: {user_email} ({user_uid[:8]})")
            
        except Exception as e:
            logger.error(f"❌ Failed to store results in Firestore: {e}")
            raise
    
    def combine_and_validate_data(self, extracted_data: dict, enriched_data: dict, job_id: str, user_context: dict = None) -> dict:
        """Combine extracted and enriched data with AI validation and Firestore storage"""
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
            
            # Store results in Firestore if user_context provided
            if user_context:
                logger.info(f"💾 Storing results in Firestore for job: {job_id}")
                self.store_results_in_firestore(final_result, user_context, job_id)
                logger.info(f"✅ Results successfully stored in user's Firestore collection")
            else:
                logger.warning(f"⚠️ No user_context provided, skipping Firestore storage for job: {job_id}")
            
            logger.info(f"✅ Data combination completed for {job_id}")
            
            return {
                'status': 'SUCCESS',
                'job_id': job_id,
                'final_result': final_result,
                'firestore_stored': user_context is not None
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
        user_context = data.get('user_context')  # Get user context for Firestore storage
        
        if not extracted_data or not enriched_data:
            return jsonify({
                'status': 'error',
                'error': 'Both extracted_data and enriched_data are required'
            }), 400
        
        logger.info(f"📥 Processing combination request for job: {job_id}")
        if user_context:
            logger.info(f"👤 User: {user_context.get('email', 'unknown')} ({user_context.get('uid', 'unknown')[:8]})")
        
        # Combine data through simple handler service with Firestore storage
        result = combiner_service.combine_and_validate_data(extracted_data, enriched_data, job_id, user_context)
        
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