"""
Enrichment Worker - Line Item Enrichment with COA Matching
Per Approach Doc: 1-2GB, OpenAI Call #2
After enrichment, triggers field-standardizer-v2 for final processing.

Implements safe fail handler:
- Zero enriched items + extracted items → RETRYING (soft error)
- Hard errors → ERROR (terminal)
"""

import os
import json
import logging
import requests
import threading
from datetime import datetime
from typing import Dict, Any, List

from flask import Flask, request, jsonify
from flask_cors import CORS
from google.cloud import firestore
from google.cloud import secretmanager
from openai import OpenAI
from concurrent.futures import ThreadPoolExecutor

# Import safe fail handler
import sys
sys.path.insert(0, '/workspace/shared')
from safe_fail_handler import SafeFailHandler, ErrorType

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

db = firestore.Client()
PROJECT_ID = os.getenv('PROJECT_ID', 'watch-mail-trial')

# Service URL for pipeline chaining
FIELD_STANDARDIZER_URL = os.getenv(
    'FIELD_STANDARDIZER_URL',
    'https://field-standardizer-v2-812016027146.asia-south1.run.app'
)


def get_openai_client() -> OpenAI:
    """Get OpenAI client with API key from Secret Manager"""
    try:
        client = secretmanager.SecretManagerServiceClient()
        name = f"projects/{PROJECT_ID}/secrets/openai-api-key-secret/versions/latest"
        response = client.access_secret_version(request={"name": name})
        api_key = response.payload.data.decode("UTF-8")
        return OpenAI(api_key=api_key)
    except Exception as e:
        logger.error(f"Failed to get OpenAI key: {e}")
        # Fallback to env var
        return OpenAI(api_key=os.getenv('OPENAI_API_KEY'))


# Initialize clients
openai_client = None
executor = ThreadPoolExecutor(max_workers=5)


def update_job_status(tenant_id: str, job_id: str, ui_status: str, pipeline_status: str = None, extra: Dict[str, Any] = None):
    """Write UI-friendly status plus optional pipeline status to Firestore."""
    update_data = {
        'status': ui_status,
        'updated_at': datetime.utcnow().isoformat()
    }
    if pipeline_status:
        update_data['pipeline_status'] = pipeline_status
    if extra:
        update_data.update(extra)
    db.collection('users').document(tenant_id).collection('invoice_results').document(job_id).update(update_data)


def get_client_profile(tenant_id: str, client_id: str) -> Dict[str, Any]:
    """Fetch client profile with Chart of Accounts"""
    if not client_id:
        return {}
    try:
        doc = db.collection('users').document(tenant_id).collection('client_organizations').document(client_id).get()
        return doc.to_dict() if doc.exists else {}
    except Exception as e:
        logger.error(f"Failed to fetch client profile: {e}")
        return {}


def match_account_from_coa(description: str, amount: float, coa: List[Dict], cap_threshold: float) -> Dict[str, Any]:
    """Match line item to Chart of Accounts using keywords"""
    if not coa:
        return {}
    
    desc_lower = description.lower()
    best_match = None
    best_score = 0
    
    for account in coa:
        if not account.get('is_active', True):
            continue
        score = 0
        for kw in account.get('keywords', []):
            if kw.lower() in desc_lower:
                score += 10
        if score > best_score:
            best_score = score
            best_match = account
    
    if best_match:
        return {
            'account_code': best_match.get('account_code'),
            'account_name': best_match.get('account_name'),
            'account_type': best_match.get('account_type'),
            'match_score': best_score,
            'is_capitalizable': amount >= cap_threshold if cap_threshold > 0 else False
        }
    return {}


def parse_amount(value) -> float:
    """Parse amount string handling commas, currency symbols, etc."""
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    # Remove commas, currency symbols, spaces
    cleaned = str(value).replace(',', '').replace('₹', '').replace('$', '').replace(' ', '').strip()
    try:
        return float(cleaned) if cleaned else 0.0
    except ValueError:
        return 0.0


def enrich_line_item(item: Dict, client_profile: Dict) -> Dict:
    """Enrich single line item with OpenAI + COA matching"""
    global openai_client
    if not openai_client:
        openai_client = get_openai_client()
    
    description = item.get('description', '')
    amount = parse_amount(item.get('amount') or item.get('total') or 0)
    
    # Try COA match first
    coa = client_profile.get('chart_of_accounts', [])
    cap_threshold = client_profile.get('capitalization_threshold', 0)
    coa_match = match_account_from_coa(description, amount, coa, cap_threshold)
    
    # Build context for OpenAI - include business profile for better classification
    business_context = ""
    if client_profile.get('business_description'):
        business_context = f" Business: {client_profile.get('business_description')}."
    if client_profile.get('industry'):
        business_context += f" Industry: {client_profile.get('industry')}."
    
    coa_context = ""
    if coa:
        coa_summary = ", ".join([f"{a['account_code']}:{a['account_name']}" for a in coa[:10] if a.get('is_active')])
        coa_context = f" Available accounts: {coa_summary}"
    
    # Include capitalization threshold in context if set
    cap_context = ""
    if cap_threshold > 0:
        cap_context = f" Capitalization threshold: ₹{cap_threshold:,.0f}."
    
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": """You are an invoice line item classifier for Indian accounting.
For each line item, provide classification AND balanced journal entry with debit/credit.

Return JSON with:
- hsn_code: HSN/SAC code (4-8 digits)
- tax_category: GST rate (e.g. GST_18_PERCENT, GST_5_PERCENT)
- product_category: Service, Goods, or specific category
- account_code: GL account code if available
- account_name: GL account name
- journal_entry: {
    "entries": [
      {"account": "Expense Account", "debit": amount, "credit": 0},
      {"account": "CGST Input", "debit": cgst_amount, "credit": 0},
      {"account": "SGST Input", "debit": sgst_amount, "credit": 0},
      {"account": "Vendor Payable", "debit": 0, "credit": total_with_tax}
    ]
  }
Ensure total debits = total credits for balanced entry."""},
                {"role": "user", "content": f"Classify and create balanced journal entry for: {description}, Amount: ₹{amount:,.2f}.{business_context}{cap_context}{coa_context}"}
            ],
            max_tokens=500,
            temperature=0.2
        )
        
        # Parse OpenAI response
        response_text = response.choices[0].message.content
        try:
            if '```json' in response_text:
                json_str = response_text.split('```json')[1].split('```')[0]
            elif '{' in response_text:
                start = response_text.find('{')
                end = response_text.rfind('}') + 1
                json_str = response_text[start:end]
            else:
                json_str = response_text
            ai_result = json.loads(json_str)
        except:
            ai_result = {}
        
        enrichment = {
            'hsn_code': ai_result.get('hsn_code', '998314'),
            'tax_category': ai_result.get('tax_category', 'GST_18_PERCENT'),
            'product_category': ai_result.get('product_category', 'Service'),
            'account_code': ai_result.get('account_code') or (coa_match.get('account_code') if coa_match else None),
            'account_name': ai_result.get('account_name') or (coa_match.get('account_name') if coa_match else None),
            'journal_entry': ai_result.get('journal_entry', {}),
            **(coa_match if coa_match else {}),
            'enriched_at': datetime.utcnow().isoformat()
        }
        
        # Calculate and add is_balanced flag for the journal entry
        journal_entry = enrichment.get('journal_entry', {})
        entries = journal_entry.get('entries', [])
        total_debit = sum(float(e.get('debit', 0) or 0) for e in entries)
        total_credit = sum(float(e.get('credit', 0) or 0) for e in entries)
        is_balanced = abs(total_debit - total_credit) < 0.01
        
        enrichment['is_balanced'] = is_balanced
        enrichment['total_debit'] = round(total_debit, 2)
        enrichment['total_credit'] = round(total_credit, 2)
        
        if not is_balanced:
            logger.warning(f"⚠️ Unbalanced entry for '{description}': debit={total_debit}, credit={total_credit}")
        
        return {**item, 'enrichment_data': enrichment}
        
    except Exception as e:
        logger.error(f"OpenAI call failed: {e}")
        return {**item, 'enrichment_error': str(e)}


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'service': 'enrichment-worker'})


def run_enrichment(line_items: List[Dict], client_profile: Dict) -> tuple:
    """
    Reusable enrichment logic - called both initially and during retries.
    Returns (success, enriched_items, count)
    """
    try:
        enriched_items = [enrich_line_item(item, client_profile) for item in line_items]
        count = len(enriched_items)
        return (True, enriched_items, count)
    except Exception as e:
        logger.error(f"❌ Enrichment call failed: {e}")
        return (False, [], 0)


@app.route('/enrich-job', methods=['POST'])
def enrich_job():
    """
    Process all line items for a job - called by data-extractor-v2
    After enrichment, triggers field-standardizer-v2
    """
    global openai_client
    if not openai_client:
        openai_client = get_openai_client()
    
    try:
        data = request.get_json()
        tenant_id = data.get('tenant_id')
        job_id = data.get('job_id')
        client_id = data.get('client_id')
        line_items = data.get('line_items', [])
        
        if not tenant_id or not job_id:
            return jsonify({'error': 'tenant_id and job_id required'}), 400
        
        # Update job status to processing/ENRICHING (write to user-isolated path for frontend)
        update_job_status(
            tenant_id,
            job_id,
            ui_status='processing',
            pipeline_status='ENRICHING'
        )
        
        # Get client profile for COA matching
        client_profile = get_client_profile(tenant_id, client_id)
        
        # Initial enrichment
        success, enriched_items, count = run_enrichment(line_items, client_profile)
        
        if not success:
            logger.error(f"❌ Initial enrichment failed for job {job_id}")
            update_job_status(
                tenant_id,
                job_id,
                ui_status='failed',
                pipeline_status='FAILED',
                extra={
                    'failure_reason': 'Initial enrichment call failed',
                    'error_type': 'enrichment_failed',
                    'failed_at': datetime.utcnow().isoformat()
                }
            )
            return jsonify({'error': 'Enrichment failed', 'job_id': job_id}), 500
        
        logger.info(f"✅ Initial enrichment: {count} items enriched")
        
        # Store enriched data in Firestore
        enrichment_doc = {
            'enriched_line_items': enriched_items,
            'client_id': client_id,
            'items_count': count,
            'completed_at': datetime.utcnow().isoformat()
        }
        
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).collection('enrichment').document('main').set(enrichment_doc)
        
        # ⚠️ SOFT ERROR CHECK: If no items enriched but items were extracted → retry with backoff
        if count == 0 and len(line_items) > 0:
            logger.warning(f"⚠️ SOFT ERROR: No items enriched from {len(line_items)} extracted - attempting retry with backoff")
            
            # Define reusable enrichment function for retry
            def retry_enrichment_func():
                success, data, items_count = run_enrichment(line_items, client_profile)
                if success and items_count > 0:
                    return {'success': True, 'data': data, 'items_count': items_count}
                return {'success': False, 'error': 'No items enriched on retry'}
            
            # Retry with exponential backoff (5s, 15s, 45s)
            success, result, error = SafeFailHandler.retry_with_backoff(
                extraction_func=retry_enrichment_func,
                job_id=job_id,
                max_retries=3
            )
            
            if success and result and result.get('data'):
                enriched_items = result['data']
                count = result['items_count']
                logger.info(f"✅ Retry successful: {count} items recovered")
            else:
                # Max retries exhausted
                logger.error(f"❌ HARD FAIL: All retries exhausted")
                update_job_status(
                    tenant_id,
                    job_id,
                    ui_status='failed',
                    pipeline_status='FAILED',
                    extra={
                        'failure_reason': f"No items enriched after 3 retries from {len(line_items)} extracted items",
                        'error_type': 'zero_enriched_items',
                        'failed_at': datetime.utcnow().isoformat()
                    }
                )
                return jsonify({'error': 'Enrichment failed after retries', 'job_id': job_id}), 400
        
        # Update job status to processing/ENRICHED with reset retry count on success
        update_job_status(
            tenant_id,
            job_id,
            ui_status='processing',
            pipeline_status='ENRICHED',
            extra={'retry_count': 0}
        )
        
        # Trigger field-standardizer for final processing
        auth_header = request.headers.get('Authorization')
        
        def call_field_standardizer():
            try:
                # Get headers from extraction
                extraction_doc = db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).collection('extraction').document('main').get()
                headers_raw = extraction_doc.to_dict().get('headers_raw', {}) if extraction_doc.exists else {}
                
                standardizer_payload = {
                    'tenant_id': tenant_id,
                    'job_id': job_id,
                    'headers_raw': headers_raw,
                    'enriched_line_items': enriched_items
                }
                
                headers = {'Content-Type': 'application/json'}
                if auth_header:
                    headers['Authorization'] = auth_header
                
                # Retry logic for network/SSL errors (max 3 attempts with exponential backoff)
                max_retries = 3
                retry_delays = [2, 5, 10]  # seconds
                last_error = None
                
                for attempt in range(max_retries):
                    try:
                        logger.info(f"🔄 Triggering standardization for {job_id} (attempt {attempt + 1}/{max_retries})")
                        resp = requests.post(
                            f"{FIELD_STANDARDIZER_URL}/standardize",
                            json=standardizer_payload,
                            headers=headers,
                            timeout=600
                        )
                        
                        if resp.ok:
                            logger.info(f"✅ Standardization triggered for job {job_id}")
                            return  # Success, exit function
                        else:
                            logger.error(f"❌ Standardization trigger failed for {job_id}: {resp.status_code}")
                            if resp.status_code >= 500:  # Server errors are retryable
                                last_error = f"Server error: {resp.status_code}"
                                if attempt < max_retries - 1:
                                    time.sleep(retry_delays[attempt])
                                    continue
                            # 4xx errors are not retryable
                            update_job_status(
                                tenant_id,
                                job_id,
                                ui_status='failed',
                                pipeline_status='FAILED',
                                extra={
                                    'failure_reason': f"Standardization trigger failed: {resp.status_code}",
                                    'failed_at': datetime.utcnow().isoformat()
                                }
                            )
                            return
                            
                    except (requests.exceptions.SSLError, 
                            requests.exceptions.ConnectionError,
                            requests.exceptions.Timeout) as network_err:
                        last_error = str(network_err)
                        logger.warning(f"⚠️ Network error on attempt {attempt + 1}/{max_retries}: {network_err}")
                        if attempt < max_retries - 1:
                            time.sleep(retry_delays[attempt])
                            continue
                        # Max retries exceeded
                        logger.error(f"❌ Max retries exceeded for {job_id} - network errors")
                        break
                    except Exception as other_err:
                        last_error = str(other_err)
                        logger.error(f"❌ Unexpected error triggering standardization: {other_err}")
                        break
                
                # If we get here, all retries failed
                update_job_status(
                    tenant_id,
                    job_id,
                    ui_status='failed',
                    pipeline_status='FAILED',
                    extra={
                        'failure_reason': f"Standardization trigger failed after {max_retries} attempts: {last_error}",
                        'failed_at': datetime.utcnow().isoformat()
                    }
                )
                
            except Exception as e:
                logger.error(f"❌ Unexpected error in standardization trigger: {e}")
                update_job_status(
                    tenant_id,
                    job_id,
                    ui_status='failed',
                    pipeline_status='FAILED',
                    extra={
                        'failure_reason': str(e),
                        'failed_at': datetime.utcnow().isoformat()
                    }
                )
        
        # Call standardizer asynchronously
        threading.Thread(target=call_field_standardizer, daemon=True).start()
        
        return jsonify({
            'success': True,
            'job_id': job_id,
            'items_enriched': len(enriched_items),
            'standardization_triggered': True
        })
        
    except Exception as e:
        logger.error(f"❌ Job enrichment failed: {e}")
        # Update Firestore with error before returning
        try:
            data = request.get_json() or {}
            tenant_id = data.get('tenant_id')
            job_id = data.get('job_id')
            if tenant_id and job_id:
                update_job_status(
                    tenant_id,
                    job_id,
                    ui_status='failed',
                    pipeline_status='FAILED',
                    extra={
                        'error_type': 'enrichment_exception',
                        'failure_reason': str(e)[:500],
                        'failed_at': datetime.utcnow().isoformat()
                    }
                )
        except:
            pass  # Don't fail the error response if Firestore update fails
        return jsonify({'error': str(e)}), 500


@app.route('/enrich-chunk', methods=['POST'])
def enrich_chunk():
    """Process a chunk of line items (legacy endpoint)"""
    try:
        data = request.get_json()
        tenant_id = data.get('tenant_id')
        job_id = data.get('job_id')
        chunk_id = data.get('chunk_id')
        client_id = data.get('client_id')
        line_items = data.get('line_items', [])
        
        if not tenant_id or not job_id:
            return jsonify({'error': 'tenant_id and job_id required'}), 400
        
        # Get client profile for COA
        client_profile = get_client_profile(tenant_id, client_id)
        
        # Enrich each line item
        enriched_items = [enrich_line_item(item, client_profile) for item in line_items]
        
        # Store enriched chunk in Firestore
        chunk_doc = {
            'chunk_id': chunk_id,
            'status': 'COMPLETED',
            'enriched_line_items': enriched_items,
            'completed_at': datetime.utcnow().isoformat()
        }
        
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).collection('enriched_chunks').document(chunk_id).set(chunk_doc)
        
        logger.info(f"✅ Enriched chunk {chunk_id}: {len(enriched_items)} items")
        
        return jsonify({'success': True, 'chunk_id': chunk_id, 'items_processed': len(enriched_items)})
        
    except Exception as e:
        logger.error(f"❌ Chunk enrichment failed: {e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)
