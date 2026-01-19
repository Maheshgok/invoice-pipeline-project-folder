"""
Orchestrator Service - Lightweight Job Coordination
Per Approach Doc: 256MB, no LLM, no heavy dependencies

Pipeline: initial-api → orchestrator → [pdf-extractor|data-extractor-v2] → enrichment-worker → field-standardizer-v2

Routing:
- PDF files → pdf-extractor (native PDF handling, multi-page support)
- Image files (JPG/PNG/etc) → data-extractor-v2 (OpenAI Vision)
"""

import os
import logging
import requests
import threading
from datetime import datetime
from typing import Dict, Any, Tuple

from flask import Flask, request, jsonify
from flask_cors import CORS
from google.cloud import firestore

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Initialize Firestore client
db = firestore.Client()

PROJECT_ID = os.getenv('PROJECT_ID', 'watch-mail-trial')

# Downstream service URLs - route based on file type
DATA_EXTRACTOR_URL = os.getenv(
    'DATA_EXTRACTOR_URL',
    'https://data-extractor-v2-812016027146.asia-south1.run.app'
)

# PDF Extractor for native PDF processing (multi-page support)
PDF_EXTRACTOR_URL = os.getenv(
    'PDF_EXTRACTOR_URL',
    'https://pdf-extractor-812016027146.asia-south1.run.app'
)

# Image extensions that should use data-extractor-v2
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif'}
# PDF extensions that should use pdf-extractor
PDF_EXTENSIONS = {'.pdf'}


def detect_file_type_and_extractor(gcs_path: str) -> Tuple[str, str, str]:
    """
    Detect file type from GCS path and return appropriate extractor URL.
    
    Returns:
        (extractor_url, extractor_type, file_extension)
    """
    # Extract filename from GCS path
    filename = gcs_path.split('/')[-1].lower() if gcs_path else ''
    
    # Get file extension
    if '.' in filename:
        file_ext = '.' + filename.rsplit('.', 1)[-1]
    else:
        file_ext = ''
    
    # Route based on extension
    if file_ext in PDF_EXTENSIONS:
        logger.info(f"📄 PDF detected: {filename} → routing to pdf-extractor")
        return PDF_EXTRACTOR_URL, 'pdf-native', file_ext
    elif file_ext in IMAGE_EXTENSIONS:
        logger.info(f"🖼️ Image detected: {filename} → routing to data-extractor-v2")
        return DATA_EXTRACTOR_URL, 'vision', file_ext
    else:
        # Default to data-extractor-v2 for unknown types (it handles more formats)
        logger.warning(f"⚠️ Unknown file type: {filename} → defaulting to data-extractor-v2")
        return DATA_EXTRACTOR_URL, 'vision', file_ext


def get_tenant_id(req) -> str:
    """Extract tenant_id from request - required per approach doc"""
    tenant_id = req.headers.get('X-Tenant-ID') or req.args.get('tenant_id')
    if not tenant_id:
        # Try to get from JSON body
        data = req.get_json(silent=True) or {}
        tenant_id = data.get('tenant_id')
    if not tenant_id:
        raise ValueError("tenant_id is required")
    return tenant_id


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'service': 'orchestrator'})


@app.route('/jobs/<job_id>/status', methods=['GET'])
def get_job_status(job_id: str):
    """Get job status from Firestore"""
    try:
        tenant_id = get_tenant_id(request)
        
        doc = db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).get()
        
        if not doc.exists:
            return jsonify({'error': 'Job not found'}), 404
        
        job_data = doc.to_dict()
        return jsonify({
            'job_id': job_id,
            'status': job_data.get('status'),
            'progress': _calculate_progress(job_data),
            'created_at': job_data.get('created_at'),
            'updated_at': job_data.get('updated_at')
        })
        
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"❌ Status check failed: {e}")
        return jsonify({'error': 'Status check failed'}), 500


@app.route('/jobs/<job_id>/trigger-extraction', methods=['POST'])
def trigger_extraction(job_id: str):
    """
    Update status to EXTRACTING and trigger appropriate extractor service.
    Routes based on file type:
    - PDF files → pdf-extractor (native PDF handling, multi-page support)
    - Image files → data-extractor-v2 (OpenAI Vision)
    
    Called by initial-api after file upload to GCS.
    """
    try:
        tenant_id = get_tenant_id(request)
        data = request.get_json() or {}
        
        gcs_input_path = data.get('gcs_input_path')
        client_id = data.get('client_id')
        
        if not gcs_input_path:
            return jsonify({'error': 'gcs_input_path is required'}), 400
        
        # Detect file type and get appropriate extractor
        extractor_url, extractor_type, file_ext = detect_file_type_and_extractor(gcs_input_path)
        
        # Update job status to EXTRACTING with extractor info
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
            'status': 'EXTRACTING',
            'extractor_type': extractor_type,
            'file_extension': file_ext,
            'updated_at': datetime.utcnow().isoformat()
        })
        
        logger.info(f"🚀 Triggering extraction for job {job_id} using {extractor_type}")
        
        # Get auth header to pass downstream
        auth_header = request.headers.get('Authorization')
        
        # Call appropriate extractor service asynchronously
        def call_extractor():
            try:
                extractor_payload = {
                    'job_id': job_id,
                    'gcs_input_path': gcs_input_path,
                    'tenant_id': tenant_id,
                    'client_id': client_id
                }
                
                headers = {
                    'Content-Type': 'application/json',
                    'X-Tenant-ID': tenant_id
                }
                if auth_header:
                    headers['Authorization'] = auth_header
                
                resp = requests.post(
                    f"{extractor_url}/extract",
                    json=extractor_payload,
                    headers=headers,
                    timeout=600
                )
                
                if resp.ok:
                    logger.info(f"✅ Extractor ({extractor_type}) started for job {job_id}")
                else:
                    logger.error(f"❌ Extractor ({extractor_type}) failed for {job_id}: {resp.status_code}")
                    db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
                        'status': 'FAILED',
                        'error': f"Extraction failed ({extractor_type}): {resp.status_code}",
                        'updated_at': datetime.utcnow().isoformat()
                    })
            except Exception as e:
                logger.error(f"❌ Failed to call extractor ({extractor_type}) for {job_id}: {e}")
                db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update({
                    'status': 'FAILED',
                    'error': str(e),
                    'updated_at': datetime.utcnow().isoformat()
                })
        
        # Start extraction in background thread
        threading.Thread(target=call_extractor, daemon=True).start()
        
        return jsonify({
            'success': True, 
            'status': 'EXTRACTING',
            'extractor_type': extractor_type,
            'extractor_url': extractor_url.split('//')[-1].split('.')[0]  # Service name only for logging
        })
        
    except Exception as e:
        logger.error(f"❌ Trigger extraction failed: {e}")
        return jsonify({'error': 'Trigger failed'}), 500


@app.route('/jobs/<job_id>/update-status', methods=['POST'])
def update_status(job_id: str):
    """Generic status update endpoint for downstream services"""
    try:
        tenant_id = get_tenant_id(request)
        data = request.get_json() or {}
        new_status = data.get('status')
        
        if not new_status:
            return jsonify({'error': 'status is required'}), 400
        
        update_data = {
            'status': new_status,
            'updated_at': datetime.utcnow().isoformat()
        }
        
        # Add any additional data passed
        if data.get('line_items_count'):
            update_data['line_items_count'] = data.get('line_items_count')
        if data.get('chunks_total'):
            update_data['chunks_total'] = data.get('chunks_total')
        if data.get('chunks_completed'):
            update_data['chunks_completed'] = data.get('chunks_completed')
        if data.get('journal_entries_count'):
            update_data['journal_entries_count'] = data.get('journal_entries_count')
        
        # Add error info if FAILED
        if new_status == 'FAILED' and data.get('error'):
            update_data['error'] = data.get('error')
        
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update(update_data)
        
        logger.info(f"📝 Updated job {job_id} status to {new_status}")
        return jsonify({'success': True, 'status': new_status})
        
    except Exception as e:
        logger.error(f"❌ Status update failed: {e}")
        return jsonify({'error': 'Update failed'}), 500


@app.route('/jobs/<job_id>/complete', methods=['POST'])
def complete_job(job_id: str):
    """Mark job as completed with final results"""
    try:
        tenant_id = get_tenant_id(request)
        data = request.get_json() or {}
        
        update_data = {
            'status': 'COMPLETED',
            'completed_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }
        
        # Add final counts
        if data.get('journal_entries_count'):
            update_data['journal_entries_count'] = data.get('journal_entries_count')
        if data.get('total_amount'):
            update_data['total_amount'] = data.get('total_amount')
        
        db.collection('tenants').document(tenant_id).collection('jobs').document(job_id).update(update_data)
        
        logger.info(f"✅ Completed job {job_id}")
        return jsonify({'success': True, 'status': 'COMPLETED'})
        
    except Exception as e:
        logger.error(f"❌ Job completion failed: {e}")
        return jsonify({'error': 'Completion failed'}), 500


def _calculate_progress(job_data: Dict[str, Any]) -> int:
    """Calculate progress percentage based on status"""
    status = job_data.get('status', 'CREATED')
    progress_map = {
        'CREATED': 0,
        'UPLOADING': 10,
        'EXTRACTING': 25,
        'EXTRACTED': 40,
        'RETRYING': 30,  # In retry state
        'DISPATCHED': 50,
        'ENRICHING': 60,
        'ENRICHED': 75,
        'STANDARDIZING': 85,
        'STANDARDIZED': 95,
        'COMPLETED': 100,
        'ERROR': 0,
        'FAILED': 0
    }
    return progress_map.get(status, 0)


@app.route('/jobs/<job_id>/retry', methods=['POST'])
def retry_job(job_id: str):
    """
    Retry a failed job.
    Called by a scheduled task when job is in RETRYING status and retry_scheduled_for time has passed.
    """
    try:
        tenant_id = get_tenant_id(request)
        data = request.get_json() or {}
        
        job_ref = db.collection('tenants').document(tenant_id).collection('jobs').document(job_id)
        job_doc = job_ref.get()
        
        if not job_doc.exists:
            return jsonify({'error': 'Job not found'}), 404
        
        job_data = job_doc.to_dict()
        
        # Check if job is in RETRYING status
        if job_data.get('status') != 'RETRYING':
            return jsonify({'error': f"Job is not in RETRYING status (current: {job_data.get('status')})"}), 400
        
        # Check if scheduled time has passed
        scheduled_time_str = job_data.get('retry_scheduled_for')
        if scheduled_time_str:
            from datetime import datetime as dt
            scheduled_time = dt.fromisoformat(scheduled_time_str)
            if dt.utcnow() < scheduled_time:
                return jsonify({
                    'error': 'Not yet time to retry',
                    'retry_scheduled_for': scheduled_time_str
                }), 429  # Too early
        
        logger.info(f"🔄 Retrying job {job_id} (attempt {job_data.get('retry_count', 1)})")
        
        # Get GCS path from job data
        gcs_input_path = job_data.get('gcs_input_path')
        if not gcs_input_path:
            logger.error(f"❌ Cannot retry: No gcs_input_path found for job {job_id}")
            job_ref.update({
                'status': 'ERROR',
                'error_message': 'Cannot retry: gcs_input_path not found',
                'updated_at': datetime.utcnow().isoformat()
            })
            return jsonify({'error': 'Cannot retry: gcs_input_path not found'}), 400
        
        # Determine file type and get appropriate extractor
        extractor_url, extractor_type, file_ext = detect_file_type_and_extractor(gcs_input_path)
        
        # Update job status back to EXTRACTING
        job_ref.update({
            'status': 'EXTRACTING',
            'updated_at': datetime.utcnow().isoformat()
        })
        
        logger.info(f"🚀 Triggering retry extraction for job {job_id} using {extractor_type}")
        
        # Get auth header to pass downstream
        auth_header = request.headers.get('Authorization')
        client_id = job_data.get('client_id')
        
        # Call appropriate extractor service asynchronously
        def call_extractor_retry():
            try:
                extractor_payload = {
                    'job_id': job_id,
                    'gcs_input_path': gcs_input_path,
                    'tenant_id': tenant_id,
                    'client_id': client_id,
                    'is_retry': True
                }
                
                headers = {
                    'Content-Type': 'application/json',
                    'X-Tenant-ID': tenant_id
                }
                if auth_header:
                    headers['Authorization'] = auth_header
                
                resp = requests.post(
                    f"{extractor_url}/extract",
                    json=extractor_payload,
                    headers=headers,
                    timeout=600
                )
                
                if resp.ok:
                    logger.info(f"✅ Extractor ({extractor_type}) retry started for job {job_id}")
                else:
                    logger.error(f"❌ Extractor ({extractor_type}) retry failed for {job_id}: {resp.status_code}")
                    job_ref.update({
                        'status': 'ERROR',
                        'error_message': f"Extraction retry failed: {resp.status_code}",
                        'updated_at': datetime.utcnow().isoformat()
                    })
            except Exception as e:
                logger.error(f"❌ Failed to call extractor retry for {job_id}: {e}")
                job_ref.update({
                    'status': 'ERROR',
                    'error_message': str(e),
                    'updated_at': datetime.utcnow().isoformat()
                })
        
        # Start extraction in background thread
        threading.Thread(target=call_extractor_retry, daemon=True).start()
        
        return jsonify({
            'success': True,
            'job_id': job_id,
            'status': 'EXTRACTING',
            'attempt': job_data.get('retry_count', 1)
        })
        
    except Exception as e:
        logger.error(f"❌ Retry job failed: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/process-retries', methods=['POST'])
def process_retries():
    """
    Cloud Scheduler endpoint - finds all jobs with status=RETRYING where
    retry_scheduled_for <= now() and triggers retry for them.
    Called every minute by Cloud Scheduler.
    """
    try:
        logger.info("🔍 Processing retries...")
        
        # Return quick response to Cloud Scheduler to avoid timeout
        # Process retries in background thread
        def process_in_background():
            try:
                jobs_processed = 0
                
                # Query all RETRYING jobs across all tenants
                # Note: This requires a collection-group index on 'status' and 'retry_scheduled_for'
                retrying_jobs = db.collection_group('jobs').where('status', '==', 'RETRYING').limit(10).stream()
                
                now = datetime.utcnow().isoformat()
                
                for job_doc in retrying_jobs:
                    job_id = job_doc.id
                    job_data = job_doc.to_dict()
                    tenant_id = job_doc.reference.parent.parent.id  # Get tenant from path
                    
                    # Check if scheduled time has passed
                    scheduled_time = job_data.get('retry_scheduled_for')
                    if scheduled_time and scheduled_time <= now:
                        logger.info(f"⏰ Triggering retry for job {job_id} (tenant: {tenant_id})")
                        
                        try:
                            # Call the retry endpoint
                            job_ref = db.collection('tenants').document(tenant_id).collection('jobs').document(job_id)
                            job_data_current = job_ref.get().to_dict()
                            
                            # Get GCS path
                            gcs_path = job_data_current.get('gcs_input_path')
                            if not gcs_path:
                                logger.warning(f"⚠️ No gcs_input_path for retry job {job_id}")
                                continue
                            
                            # Determine extractor
                            extractor_url, extractor_type, _ = detect_file_type_and_extractor(gcs_path)
                            
                            # Reset job to EXTRACTING
                            job_ref.update({
                                'status': 'EXTRACTING',
                                'updated_at': datetime.utcnow().isoformat()
                            })
                            
                            # Prepare payload
                            extractor_payload = {
                                'job_id': job_id,
                                'gcs_input_path': gcs_path,
                                'tenant_id': tenant_id,
                                'client_id': job_data_current.get('client_id'),
                                'is_retry': True
                            }
                            
                            headers = {
                                'Content-Type': 'application/json',
                                'X-Tenant-ID': tenant_id
                            }
                            
                            # Call extractor
                            resp = requests.post(
                                f"{extractor_url}/extract",
                                json=extractor_payload,
                                headers=headers,
                                timeout=30  # Shorter timeout for background task
                            )
                            
                            if resp.ok:
                                logger.info(f"✅ Retry extraction started for {job_id}")
                                jobs_processed += 1
                            else:
                                logger.error(f"❌ Failed to start retry for {job_id}: {resp.status_code}")
                                job_ref.update({
                                    'status': 'ERROR',
                                    'error_message': f"Scheduled retry failed: {resp.status_code}",
                                    'updated_at': datetime.utcnow().isoformat()
                                })
                        
                        except Exception as e:
                            logger.error(f"❌ Error processing retry for {job_id}: {e}")
                            try:
                                job_ref.update({
                                    'status': 'ERROR',
                                    'error_message': str(e),
                                    'updated_at': datetime.utcnow().isoformat()
                                })
                            except:
                                pass
                
                logger.info(f"✅ Processed {jobs_processed} retries")
            except Exception as e:
                logger.error(f"❌ Background retry processing failed: {e}")
        
        # Start background thread
        thread = threading.Thread(target=process_in_background)
        thread.daemon = True
        thread.start()
        
        # Return immediate success to Cloud Scheduler
        return jsonify({
            'success': True,
            'message': 'Retry processing started'
        }), 200
        
    except Exception as e:
        logger.error(f"❌ Error in process_retries: {e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)
