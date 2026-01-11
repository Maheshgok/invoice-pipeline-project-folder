"""
Pipeline Orchestrator Service - Version 2.0
Coordinates the restructured 3-phase microservices using simple OpenAI handlers:
Phase 1: Data Extractor (simple handler for OCR/extraction)
Phase 2: Queue Enrichment Processor (simple handler for enrichment/validation) 
Phase 3: Data Combiner (simple handler for final validation/combination)
"""

import os
import json
import logging
import asyncio
import base64
from datetime import datetime
from flask import Flask, request, jsonify
import requests
from typing import Dict, Any
from google.cloud import storage
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth

# Import temp storage manager (local copy)
from temp_storage_manager import TempStorageManager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Firebase Admin SDK
project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
if not firebase_admin._apps:
    cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred, {'projectId': project_id})

app = Flask(__name__)

# Configure CORS for potential frontend access
from flask_cors import CORS
CORS(app, 
     resources={
         r"/*": {
             "origins": ["*"],
             "methods": ["GET", "POST", "PUT", "OPTIONS"],
             "allow_headers": ["Authorization", "Content-Type", "X-Requested-With", "Accept", "Origin"],
             "supports_credentials": False
         }
     })

@app.after_request
def after_request(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, X-Requested-With, Accept, Origin'
    return response

# Initialize GCS client
storage_client = storage.Client()

def verify_auth_token(auth_header):
    """Verify Firebase ID token"""
    if not auth_header or not auth_header.startswith('Bearer '):
        raise ValueError("Missing or invalid authorization token")
    
    id_token_str = auth_header.split(' ')[1]
    
    try:
        decoded_token = firebase_auth.verify_id_token(id_token_str)
        user_email = decoded_token.get('email')
        user_uid = decoded_token.get('uid')
        
        if not user_email or not user_uid:
            raise ValueError("Invalid token: missing email or UID")
            
        return {
            'email': user_email,
            'uid': user_uid,
            'organization_id': decoded_token.get('custom_claims', {}).get('organizationId'),
            'organization_role': decoded_token.get('custom_claims', {}).get('organizationRole')
        }
    except Exception as e:
        logger.error(f"❌ Token verification failed: {e}")
        raise ValueError(f"Invalid authentication token: {e}")

def verify_auth_token(auth_header):
    """Verify Firebase ID token"""
    if not auth_header or not auth_header.startswith('Bearer '):
        raise ValueError("Missing or invalid authorization token")
    
    id_token_str = auth_header.split(' ')[1]
    
    try:
        decoded_token = firebase_auth.verify_id_token(id_token_str)
        user_email = decoded_token.get('email')
        user_uid = decoded_token.get('uid')
        
        if not user_email or not user_uid:
            raise ValueError("Invalid token: missing email or UID")
            
        return {
            'email': user_email,
            'uid': user_uid,
            'organization_id': decoded_token.get('custom_claims', {}).get('organizationId'),
            'organization_role': decoded_token.get('custom_claims', {}).get('organizationRole')
        }
    except Exception as e:
        logger.error(f"❌ Token verification failed: {e}")
        raise ValueError(f"Invalid authentication token: {e}")

class PipelineOrchestrator:
    def __init__(self):
        # Restructured microservice URLs (v2.0 with simple handlers) - Updated URLs
        self.data_extractor_url = os.getenv('DATA_EXTRACTOR_URL', 'https://data-extractor-bhcetby62q-el.a.run.app')
        self.queue_processor_url = os.getenv('QUEUE_PROCESSOR_URL', 'https://queue-enrichment-processor-bhcetby62q-el.a.run.app')  
        self.data_combiner_url = os.getenv('DATA_COMBINER_URL', 'https://data-combiner-bhcetby62q-el.a.run.app')
        self.field_standardizer_url = os.getenv('FIELD_STANDARDIZER_URL', 'https://field-standardizer-bhcetby62q-el.a.run.app')
        
        # Initialize temp storage manager
        self.temp_storage = TempStorageManager()
        
        logger.info("🎼 Pipeline Orchestrator v3.0 initialized with multi-stage processing")
        logger.info(f"📊 Data Extractor v2.0: {self.data_extractor_url}")
        logger.info(f"⚙️ Queue Processor v2.0: {self.queue_processor_url}")
        logger.info(f"🔗 Data Combiner v2.0: {self.data_combiner_url}")
        logger.info(f"🏷️ Field Standardizer v1.0: {self.field_standardizer_url}")

    async def process_invoice_pipeline(self, image_content: str, job_id: str, user_context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Orchestrate complete 6-stage pipeline with temp storage and batched processing"""
        try:
            logger.info(f"🚀 Starting 6-stage multi-stage pipeline for job: {job_id}")
            pipeline_start = datetime.now()
            
            # Update job state to started
            self.temp_storage.update_job_state(job_id, 'started', 'processing', {'started_at': pipeline_start.isoformat()})
            
            # Stage 1: Basic Data Extraction (header + line items)
            logger.info(f"📊 Stage 1: Basic Data Extraction")
            stage1_start = datetime.now()
            
            extraction_response = requests.post(
                f"{self.data_extractor_url}/extract-invoice-data", 
                json={'image_data': image_content, 'job_id': job_id},
                timeout=300
            )
            
            if not extraction_response.ok:
                error_msg = f"Stage 1 failed: {extraction_response.status_code}"
                self.temp_storage.update_job_state(job_id, 'extraction', 'failed', {'error': error_msg})
                return {'status': 'FAILED', 'stage': 1, 'error': error_msg}
            
            extraction_result = extraction_response.json()
            if extraction_result['status'] != 'SUCCESS':
                error_msg = f"Stage 1 processing failed: {extraction_result.get('error')}"
                self.temp_storage.update_job_state(job_id, 'extraction', 'failed', {'error': error_msg})
                return {'status': 'FAILED', 'stage': 1, 'error': error_msg}
            
            stage1_duration = (datetime.now() - stage1_start).total_seconds()
            extracted_data = extraction_result['extracted_data']
            
            # Store extraction results in temp storage
            self.temp_storage.store_stage_data(job_id, 'extraction', extracted_data, user_context)
            self.temp_storage.update_job_state(job_id, 'extraction', 'completed', {'duration': stage1_duration})
            
            logger.info(f"✅ Stage 1 completed in {stage1_duration:.2f}s")
            
            # For now, call the existing 3-phase pipeline (will expand later)
            # Stage 2-5 will be implemented with queue enrichment service updates
            
            # Simplified completion for now
            combination_payload = {
                'extracted_data': extracted_data,
                'enriched_data': extracted_data,  # Placeholder
                'job_id': job_id,
                'user_context': user_context
            }
            
            combination_response = requests.post(
                f"{self.data_combiner_url}/combine-invoice-data", 
                json=combination_payload,
                timeout=300
            )
            
            if not combination_response.ok:
                error_msg = f"Final stage failed: {combination_response.status_code}"
                return {'status': 'FAILED', 'stage': 5, 'error': error_msg}
            
            combination_result = combination_response.json()
            total_duration = (datetime.now() - pipeline_start).total_seconds()
            
            logger.info(f"🎉 Pipeline completed in {total_duration:.2f}s (simplified version)")
            
            return {
                'status': 'SUCCESS',
                'job_id': job_id,
                'final_result': combination_result['final_result'],
                'pipeline_stats': {
                    'total_duration_seconds': total_duration,
                    'pipeline_version': '3.0.0-beta'
                },
                'storage_handled_by': 'data_combiner',
                'firestore_storage': 'completed'
            }
            
            extraction_payload = {
                'image_content': image_content,
                'job_id': job_id
            }
            
            extraction_response = requests.post(
                f"{self.data_extractor_url}/extract-invoice-data",
                json=extraction_payload,
                timeout=300
            )
            
            if not extraction_response.ok:
                error_msg = f"Phase 1 failed: {extraction_response.status_code}"
                logger.error(f"❌ {error_msg}")
                return {'status': 'FAILED', 'phase': 1, 'error': error_msg}
            
            extraction_result = extraction_response.json()
            if extraction_result['status'] != 'SUCCESS':
                return {'status': 'FAILED', 'phase': 1, 'error': extraction_result.get('error')}
            
            phase1_duration = (datetime.now() - phase1_start).total_seconds()
            logger.info(f"✅ Phase 1 completed in {phase1_duration:.2f}s")
            
            # Phase 2: Data Enrichment using simple handler
            logger.info(f"⚙️ Phase 2: Data Enrichment (Simple Handler)")
            phase2_start = datetime.now()
            
            enrichment_payload = {
                'extracted_data': extraction_result['extracted_data'],
                'job_id': job_id
            }
            
            enrichment_response = requests.post(
                f"{self.queue_processor_url}/enrich-invoice-data",
                json=enrichment_payload,
                timeout=600
            )
            
            if not enrichment_response.ok:
                error_msg = f"Phase 2 failed: {enrichment_response.status_code}"
                logger.error(f"❌ {error_msg}")
                return {'status': 'FAILED', 'phase': 2, 'error': error_msg}
            
            enrichment_result = enrichment_response.json()
            if enrichment_result['status'] != 'SUCCESS':
                return {'status': 'FAILED', 'phase': 2, 'error': enrichment_result.get('error')}
            
            phase2_duration = (datetime.now() - phase2_start).total_seconds()
            logger.info(f"✅ Phase 2 completed in {phase2_duration:.2f}s")
            
            # Phase 3: Data Combination using simple handler
            logger.info(f"🔗 Phase 3: Data Combination (Simple Handler)")
            phase3_start = datetime.now()
            
            combination_payload = {
                'extracted_data': extraction_result['extracted_data'],
                'enriched_data': enrichment_result['enriched_data'],
                'job_id': job_id,
                'user_context': user_context  # Pass user context for Firestore storage
            }
            
            combination_response = requests.post(
                f"{self.data_combiner_url}/combine-invoice-data", 
                json=combination_payload,
                timeout=300
            )
            
            if not combination_response.ok:
                error_msg = f"Phase 3 failed: {combination_response.status_code}"
                logger.error(f"❌ {error_msg}")
                return {'status': 'FAILED', 'phase': 3, 'error': error_msg}
            
            combination_result = combination_response.json()
            if combination_result['status'] != 'SUCCESS':
                return {'status': 'FAILED', 'phase': 3, 'error': combination_result.get('error')}
            
            phase3_duration = (datetime.now() - phase3_start).total_seconds()
            total_duration = (datetime.now() - pipeline_start).total_seconds()
            
            logger.info(f"✅ Phase 3 completed in {phase3_duration:.2f}s")
            logger.info(f"🎉 Complete simple handler pipeline finished in {total_duration:.2f}s")
            
            # Return final result (data combiner handles Firestore storage)
            logger.info(f"🎉 Orchestrated pipeline completed for job: {job_id}")
            logger.info(f"📊 Results stored by data combiner, orchestrator task complete")
            
            return {
                'status': 'SUCCESS',
                'job_id': job_id,
                'final_result': combination_result['final_result'],
                'pipeline_stats': {
                    'total_duration_seconds': total_duration,
                    'phase_durations': {
                        'phase1_extraction': phase1_duration,
                        'phase2_enrichment': phase2_duration,
                        'phase3_combination': phase3_duration
                    },
                    'extraction_stats': extraction_result.get('processing_stats', {}),
                    'enrichment_stats': enrichment_result.get('processing_stats', {}),
                    'combination_stats': combination_result.get('processing_stats', {}),
                    'handler_version': '2.0.0'
                },
                'storage_handled_by': 'data_combiner',
                'firestore_storage': 'completed'
            }
            
        except requests.Timeout as e:
            logger.error(f"⏰ Pipeline timeout for job {job_id}: {str(e)}")
            return {'status': 'TIMEOUT', 'error': f'Pipeline timeout: {str(e)}'}
        except requests.RequestException as e:
            logger.error(f"🌐 Network error for job {job_id}: {str(e)}")
            return {'status': 'NETWORK_ERROR', 'error': f'Network error: {str(e)}'}
        except Exception as e:
            logger.error(f"🚨 Critical pipeline error for job {job_id}: {str(e)}")
            return {'status': 'CRITICAL_FAIL', 'error': str(e)}

    def health_check_services(self) -> Dict[str, Any]:
        """Check health of all microservices"""
        services = {
            'data_extractor': self.data_extractor_url,
            'queue_processor': self.queue_processor_url,
            'data_combiner': self.data_combiner_url
        }
        
        health_status = {}
        
        for service_name, service_url in services.items():
            try:
                response = requests.get(f"{service_url}/health", timeout=10)
                if response.ok:
                    health_data = response.json()
                    health_status[service_name] = {
                        'status': 'healthy',
                        'response_time_ms': response.elapsed.total_seconds() * 1000,
                        'service_info': health_data
                    }
                else:
                    health_status[service_name] = {
                        'status': 'unhealthy',
                        'http_status': response.status_code
                    }
            except Exception as e:
                health_status[service_name] = {
                    'status': 'error',
                    'error': str(e)
                }
        
        # Overall health
        all_healthy = all(s.get('status') == 'healthy' for s in health_status.values())
        
        return {
            'overall_status': 'healthy' if all_healthy else 'degraded',
            'services': health_status,
            'timestamp': datetime.now().isoformat()
        }

# Initialize orchestrator
orchestrator = PipelineOrchestrator()

@app.route('/health', methods=['GET'])
def health_check():
    """Orchestrator health check"""
    return jsonify({
        'service': 'pipeline-orchestrator',
        'status': 'healthy',
        'version': '2.0.0',
        'architecture': 'simple_handler_microservices',
        'phases': ['data_extraction_v2', 'data_enrichment_v2', 'data_combination_v2']
    })

@app.route('/health/services', methods=['GET'])
def services_health_check():
    """Check health of all microservices"""
    health_result = orchestrator.health_check_services()
    status_code = 200 if health_result['overall_status'] == 'healthy' else 503
    return jsonify(health_result), status_code

@app.route('/process-invoice-from-gcs', methods=['POST'])
def process_invoice_from_gcs():
    """Pipeline orchestrator endpoint that accepts GCS paths and processes invoices"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'status': 'error',
                'error': 'No JSON data provided'
            }), 400
        
        bucket_path = data.get('bucket_path')
        job_id = data.get('job_id', f"job_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
        
        if not bucket_path:
            return jsonify({
                'status': 'error',
                'error': 'bucket_path is required'
            }), 400
        
        logger.info(f"📥 Processing GCS-based orchestration request for job: {job_id}")
        logger.info(f"📂 GCS Path: {bucket_path}")
        
        # Extract bucket and blob path
        try:
            if bucket_path.startswith('gs://'):
                # Remove gs:// prefix
                path_without_prefix = bucket_path[5:]
                bucket_name, blob_path = path_without_prefix.split('/', 1)
            elif '/' in bucket_path:
                # Assume bucket/path format
                bucket_name, blob_path = bucket_path.split('/', 1)
            else:
                raise ValueError("Invalid bucket_path format")
            
            logger.info(f"📦 Bucket: {bucket_name}, Blob: {blob_path}")
            
            # Read file from GCS
            bucket = storage_client.bucket(bucket_name)
            blob = bucket.blob(blob_path)
            
            if not blob.exists():
                return jsonify({
                    'status': 'error',
                    'error': f'File not found in GCS: {bucket_path}'
                }), 404
            
            # Download file content
            file_content = blob.download_as_bytes()
            
            # Convert to base64
            image_content = base64.b64encode(file_content).decode('utf-8')
            
            logger.info(f"✅ Successfully read file from GCS, size: {len(file_content)} bytes")
            
        except Exception as gcs_error:
            logger.error(f"❌ Failed to read from GCS: {str(gcs_error)}")
            return jsonify({
                'status': 'error',
                'error': f'Failed to read from GCS: {str(gcs_error)}'
            }), 500
        
        # Process through orchestrator
        result = asyncio.run(orchestrator.process_invoice_pipeline(image_content, job_id))
        
        if result['status'] == 'SUCCESS':
            return jsonify(result), 200
        else:
            return jsonify(result), 500
            
    except Exception as e:
        logger.error(f"🚨 Critical error in GCS-based orchestrator: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': 'Critical orchestrator failure',
            'message': str(e)
        }), 500

@app.route('/process-invoice', methods=['POST'])
def process_invoice():
    """Main orchestrator endpoint - processes invoice through 3-phase pipeline"""
    try:
        # Verify authentication first
        auth_header = request.headers.get('Authorization')
        try:
            user_auth = verify_auth_token(auth_header)
            logger.info(f"🔐 Authenticated user: {user_auth['email']}")
        except ValueError as e:
            logger.error(f"❌ Authentication failed: {e}")
            return jsonify({"error": "Authentication required", "details": str(e)}), 401
        data = request.get_json()
        if not data:
            return jsonify({
                'status': 'error',
                'error': 'No JSON data provided'
            }), 400
        
        image_content = data.get('image_data') or data.get('image_content')  # Support both field names
        job_id = data.get('job_id', f"job_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
        user_context = data.get('user_context', {})  # Get user context for downstream services
        
        if not image_content:
            return jsonify({
                'status': 'error',
                'error': 'image_data or image_content is required'
            }), 400
        
        logger.info(f"📥 Processing orchestration request for job: {job_id}")
        if user_context:
            logger.info(f"👤 User: {user_context.get('email', 'unknown')} ({user_context.get('uid', 'unknown')[:8]})")
        
        # Process through orchestrator with user context
        result = asyncio.run(orchestrator.process_invoice_pipeline(image_content, job_id, user_context))
        
        if result['status'] == 'SUCCESS':
            return jsonify(result), 200
        else:
            return jsonify(result), 500
            
    except Exception as e:
        logger.error(f"🚨 Critical error in orchestrator: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': 'Critical orchestrator failure',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)