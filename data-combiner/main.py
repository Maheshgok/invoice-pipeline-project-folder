"""
Data Combiner Service - Non-AI Cloud Run
Combines journal entry chunks from Agent 2 queue processing
Enhanced with Stage 3 functionality for microservices architecture
"""
import json
import logging
from datetime import datetime
from flask import Flask, request, jsonify
from typing import List, Dict, Any

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'data-combiner',
        'version': '1.0.0'
    }), 200

@app.route('/combine-journal-chunks', methods=['POST'])
def combine_journal_chunks():
    """
    Combine multiple journal entry chunks from Agent 2 queue processing
    
    Input: {
        "job_id": "unique_job_id",
        "journal_chunks": [
            [
                {"account_name": "Purchase", "debit": 1000, "credit": 0, ...},
                {"account_name": "CGST Input", "debit": 90, "credit": 0, ...}
            ],
            [
                {"account_name": "Purchase", "debit": 2000, "credit": 0, ...},
                {"account_name": "CGST Input", "debit": 180, "credit": 0, ...}
            ]
        ]
    }
    
    Output: {
        "combined_journal_entries": [...],
        "totals": {...},
        "chunk_stats": {...}
    }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        job_id = data.get('job_id')
        journal_chunks = data.get('journal_chunks', [])
        
        if not job_id:
            return jsonify({'error': 'job_id is required'}), 400
            
        if not journal_chunks:
            return jsonify({'error': 'journal_chunks array is required'}), 400
        
        logger.info(f"🔄 Combining journal chunks for job {job_id}")
        logger.info(f"📦 Processing {len(journal_chunks)} chunks")
        
        # Combine all journal entries from all chunks
        combined_entries = []
        total_debit = 0.0
        total_credit = 0.0
        
        for chunk_idx, chunk in enumerate(journal_chunks):
            logger.info(f"📋 Processing chunk {chunk_idx + 1}: {len(chunk)} entries")
            
            for entry in chunk:
                combined_entries.append(entry)
                total_debit += float(entry.get('debit', 0))
                total_credit += float(entry.get('credit', 0))
        
        # Validate balance
        balance_difference = abs(total_debit - total_credit)
        is_balanced = balance_difference < 0.01  # Allow for rounding errors
        
        logger.info(f"💰 Total Debit: {total_debit}, Total Credit: {total_credit}")
        logger.info(f"⚖️ Balanced: {is_balanced}")
        
        result = {
            'job_id': job_id,
            'combined_journal_entries': combined_entries,
            'totals': {
                'total_debit': round(total_debit, 2),
                'total_credit': round(total_credit, 2),
                'balanced': is_balanced,
                'difference': round(balance_difference, 2)
            },
            'chunk_stats': {
                'total_chunks_processed': len(journal_chunks),
                'total_entries': len(combined_entries),
                'entries_per_chunk': [len(chunk) for chunk in journal_chunks]
            },
            'timestamp': '2026-01-08T00:00:00Z'
        }
        
        logger.info(f"✅ Successfully combined {len(combined_entries)} journal entries")
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"❌ Error combining journal chunks: {str(e)}")
        return jsonify({
            'error': 'Internal server error',
            'details': str(e)
        }), 500

@app.route('/validate-journal-entries', methods=['POST'])
def validate_journal_entries():
    """
    Validate journal entries for accounting rules
    """
    try:
        data = request.get_json()
        journal_entries = data.get('journal_entries', [])
        
        if not journal_entries:
            return jsonify({'error': 'journal_entries array is required'}), 400
        
        total_debit = sum(float(entry.get('debit', 0)) for entry in journal_entries)
        total_credit = sum(float(entry.get('credit', 0)) for entry in journal_entries)
        
        balance_difference = abs(total_debit - total_credit)
        is_balanced = balance_difference < 0.01
        
        # Check for required fields
        validation_errors = []
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