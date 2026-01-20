"""
Data Extractor V2 - OpenAI Vision Invoice Extraction
Per Approach Doc: 512MB, OpenAI Call #1
After extraction, triggers enrichment-worker for next pipeline step.

Implements safe fail handler:
- Zero items → RETRYING (soft error)
- Hard errors → ERROR (terminal)
"""

import os
import io
import json
import logging
import base64
import mimetypes
import requests
import threading
from datetime import datetime
from typing import Dict, Any, Tuple

from flask import Flask, request, jsonify
from flask_cors import CORS
from google.cloud import firestore, storage, secretmanager
from openai import OpenAI
from pdf2image import convert_from_bytes

# Import safe fail handler
import sys
sys.path.insert(0, '/workspace/shared')
from safe_fail_handler import SafeFailHandler, ErrorType

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

db = firestore.Client()
storage_client = storage.Client()
PROJECT_ID = os.getenv('PROJECT_ID', 'watch-mail-trial')

# Service URLs for pipeline chaining
ENRICHMENT_WORKER_URL = os.getenv(
    'ENRICHMENT_WORKER_URL',
    'https://enrichment-worker-812016027146.asia-south1.run.app'
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
        return OpenAI(api_key=os.getenv('OPENAI_API_KEY'))


openai_client = None


def detect_mime_type(file_content: bytes, filename: str = '') -> str:
    """Detect MIME type from file content or filename"""
    # Check magic bytes first
    if file_content[:4] == b'%PDF':
        return 'application/pdf'
    elif file_content[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png'
    elif file_content[:2] == b'\xff\xd8':
        return 'image/jpeg'
    elif file_content[:4] == b'GIF8':
        return 'image/gif'
    elif file_content[:4] == b'RIFF' and file_content[8:12] == b'WEBP':
        return 'image/webp'
    
    # Fallback to filename extension
    if filename:
        mime_type, _ = mimetypes.guess_type(filename)
        if mime_type:
            return mime_type
    
    # Default to jpeg for unknown images
    return 'image/jpeg'


def prepare_image_for_openai(file_content: bytes, filename: str = '') -> Tuple[str, str]:
    """
    Prepare image content for OpenAI Vision API.
    Returns (base64_content, mime_type)
    For PDFs, converts first page to PNG.
    """
    mime_type = detect_mime_type(file_content, filename)
    
    if mime_type == 'application/pdf':
        # Convert PDF first page to PNG
        logger.info("📄 Converting PDF to image for OpenAI Vision")
        try:
            images = convert_from_bytes(file_content, first_page=1, last_page=1, dpi=200)
            if images:
                img_buffer = io.BytesIO()
                images[0].save(img_buffer, format='PNG')
                img_buffer.seek(0)
                return base64.b64encode(img_buffer.getvalue()).decode('utf-8'), 'image/png'
        except Exception as e:
            logger.error(f"PDF conversion failed: {e}")
            raise ValueError(f"Failed to convert PDF to image: {e}")
    
    # For regular images, just encode
    return base64.b64encode(file_content).decode('utf-8'), mime_type


def get_tenant_id(req) -> str:
    """Extract tenant_id from request"""
    tenant_id = req.headers.get('X-Tenant-ID') or req.args.get('tenant_id')
    if not tenant_id:
        data = req.get_json(silent=True) or {}
        tenant_id = data.get('tenant_id')
    if not tenant_id:
        raise ValueError("tenant_id is required")
    return tenant_id


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


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'service': 'data-extractor-v2'})


def run_extraction(base64_content: str, mime_type: str, model: str = "gpt-4o") -> Tuple[bool, Dict, int]:
    """
    Reusable extraction logic - called both initially and during retries.
    Returns (success, extracted_data, line_items_count)
    """
    extraction_prompt = """You are an invoice data extraction expert. Extract all data from the invoice.
Return JSON with:
- headers_raw: {invoice_number, invoice_date, vendor_name, vendor_gstin, buyer_name, buyer_gstin, total_amount, tax_amount}
- line_items_raw: [{description, quantity, unit_price, amount, hsn_code, tax_rate}]"""
    
    try:
        response = openai_client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": extraction_prompt
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Extract all data from this invoice:"},
                        {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{base64_content}"}}
                    ]
                }
            ],
            max_tokens=4000
        )
        
        response_text = response.choices[0].message.content
        
        # Parse JSON from response
        try:
            if '```json' in response_text:
                json_str = response_text.split('```json')[1].split('```')[0]
            elif '{' in response_text:
                start = response_text.find('{')
                end = response_text.rfind('}') + 1
                json_str = response_text[start:end]
            else:
                json_str = response_text
            
            extracted_data = json.loads(json_str)
        except:
            extracted_data = {
                'headers_raw': {'raw_text': response_text},
                'line_items_raw': []
            }
        
        line_items_count = len(extracted_data.get('line_items_raw', []))
        return (True, extracted_data, line_items_count)
    
    except Exception as e:
        logger.error(f"❌ Extraction call failed: {e}")
        return (False, {}, 0)


@app.route('/extract', methods=['POST'])
def extract_invoice():
    """
    Extract data from invoice using OpenAI Vision
    Per Approach Doc Section 7.3: OpenAI Call #1
    Output: headers_raw + line_items_raw
    """
    global openai_client
    if not openai_client:
        openai_client = get_openai_client()
    
    try:
        tenant_id = get_tenant_id(request)
        data = request.get_json()
        job_id = data.get('job_id')
        gcs_path = data.get('gcs_input_path')
        
        if not job_id or not gcs_path:
            return jsonify({'error': 'job_id and gcs_input_path required'}), 400
        
        # Update job status to processing
        update_job_status(
            tenant_id,
            job_id,
            ui_status='processing',
            pipeline_status='EXTRACTING'
        )
        
        # Download file from GCS
        bucket_name = gcs_path.split('/')[2]
        blob_path = '/'.join(gcs_path.split('/')[3:])
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(blob_path)
        file_content = blob.download_as_bytes()
        
        # Prepare image for OpenAI Vision (handles PDF conversion)
        filename = blob_path.split('/')[-1] if blob_path else ''
        base64_content, mime_type = prepare_image_for_openai(file_content, filename)
        logger.info(f"📷 Prepared image for OpenAI: {mime_type}")
        
        # Initial extraction with full model
        success, extracted_data, line_items_count = run_extraction(base64_content, mime_type, model="gpt-4o")
        
        if not success:
            logger.error(f"❌ Initial extraction failed for job {job_id}")
            error_update = SafeFailHandler.build_error_update(
                ErrorType.EXTRACTION_EMPTY,
                "Initial extraction API call failed",
                retry_count=0
            )
            error_update['status'] = 'FAILED'
            error_update['failure_reason'] = 'Initial extraction failed'
            
            update_job_status(
                tenant_id,
                job_id,
                ui_status='failed',
                pipeline_status='FAILED',
                extra=error_update
            )
            return jsonify({'error': 'Extraction failed', 'job_id': job_id}), 500
        
        logger.info(f"✅ Initial extraction: {line_items_count} line items found")
        
        # Store extraction
        extraction_doc = {
            'headers_raw': extracted_data.get('headers_raw', {}),
            'line_items_raw': extracted_data.get('line_items_raw', []),
            'extracted_at': datetime.utcnow().isoformat(),
            'model_used': 'gpt-4o'
        }
        db.collection('users').document(tenant_id).collection('invoice_results').document(job_id).collection('extraction').document('main').set(extraction_doc)
        
        # ⚠️ SOFT ERROR CHECK: Zero items → retry with backoff using cheaper model
        if line_items_count == 0:
            logger.warning(f"⚠️ SOFT ERROR: Zero items extracted - attempting retry with backoff")
            
            # Define reusable extraction function that uses gpt-4o-mini for cost savings
            def retry_extraction_func():
                success, data, count = run_extraction(base64_content, mime_type, model="gpt-4o-mini")
                if success and count > 0:
                    return {'success': True, 'data': data, 'items_count': count}
                return {'success': False, 'error': 'No items found on retry'}
            
            # Retry with exponential backoff (5s, 15s, 45s)
            success, result, error = SafeFailHandler.retry_with_backoff(
                extraction_func=retry_extraction_func,
                job_id=job_id,
                max_retries=3
            )
            
            if success and result and result.get('data'):
                extracted_data = result['data']
                line_items_count = result['items_count']
                logger.info(f"✅ Retry successful: {line_items_count} items recovered")
            else:
                # Max retries exhausted
                logger.error(f"❌ HARD FAIL: All retries exhausted")
                error_update = SafeFailHandler.build_error_update(
                    ErrorType.ZERO_ITEMS,
                    "No items extracted after 3 retries",
                    retry_count=3
                )
                error_update['status'] = 'FAILED'
                error_update['failure_reason'] = 'No items extracted after 3 retries'
                
                update_job_status(
                    tenant_id,
                    job_id,
                    ui_status='failed',
                    pipeline_status='FAILED',
                    extra=error_update
                )
                return jsonify({'error': 'Extraction failed after retries', 'job_id': job_id}), 400
        
        # Update job status for successful extraction (still processing next stages)
        update_job_status(
            tenant_id,
            job_id,
            ui_status='processing',
            pipeline_status='EXTRACTED',
            extra={
                'line_items_count': line_items_count,
                'retry_count': 0
            }
        )
        
        # Trigger enrichment-worker for next pipeline step
        auth_header = request.headers.get('Authorization')
        client_id = data.get('client_id')
        
        def call_enrichment_worker():
            try:
                enrichment_payload = {
                    'tenant_id': tenant_id,
                    'job_id': job_id,
                    'client_id': client_id,
                    'line_items': extracted_data.get('line_items_raw', [])
                }
                
                headers = {'Content-Type': 'application/json'}
                if auth_header:
                    headers['Authorization'] = auth_header
                
                resp = requests.post(
                    f"{ENRICHMENT_WORKER_URL}/enrich-job",
                    json=enrichment_payload,
                    headers=headers,
                    timeout=600
                )
                
                if resp.ok:
                    logger.info(f"✅ Enrichment triggered for job {job_id}")
                else:
                    logger.error(f"❌ Enrichment trigger failed for {job_id}: {resp.status_code}")
                    update_job_status(
                        tenant_id,
                        job_id,
                        ui_status='failed',
                        pipeline_status='FAILED',
                        extra={
                            'failure_reason': f"Enrichment trigger failed: {resp.status_code}",
                            'failed_at': datetime.utcnow().isoformat()
                        }
                    )
            except Exception as e:
                logger.error(f"❌ Failed to trigger enrichment for {job_id}: {e}")
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
        
        # Call enrichment asynchronously
        threading.Thread(target=call_enrichment_worker, daemon=True).start()
        
        return jsonify({
            'success': True,
            'job_id': job_id,
            'line_items_count': line_items_count,
            'enrichment_triggered': True
        })
        
    except ValueError as e:
        # Update Firestore with error before returning
        try:
            tenant_id = get_tenant_id(request)
            data = request.get_json() or {}
            job_id = data.get('job_id')
            if tenant_id and job_id:
                update_job_status(
                    tenant_id,
                    job_id,
                    ui_status='failed',
                    pipeline_status='FAILED',
                    extra={
                        'error_type': 'invalid_request',
                        'failure_reason': str(e),
                        'failed_at': datetime.utcnow().isoformat()
                    }
                )
        except:
            pass  # Don't fail the error response if Firestore update fails
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"❌ Extraction failed: {e}")
        # Update Firestore with error before returning
        try:
            tenant_id = get_tenant_id(request)
            data = request.get_json() or {}
            job_id = data.get('job_id')
            if tenant_id and job_id:
                update_job_status(
                    tenant_id,
                    job_id,
                    ui_status='failed',
                    pipeline_status='FAILED',
                    extra={
                        'error_type': 'server_error',
                        'failure_reason': str(e)[:500],
                        'failed_at': datetime.utcnow().isoformat()
                    }
                )
        except:
            pass  # Don't fail the error response if Firestore update fails
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port)
