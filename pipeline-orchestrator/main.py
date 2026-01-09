"""
Pipeline Orchestrator Service
Coordinates the 3-phase microservices architecture:
Phase 1: Data Extractor (1A + 1B) 
Phase 2: Queue Enrichment Processor (2A + 2B + 2C + 2D)
Phase 3: Data Combiner & Storage (3)
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

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Initialize GCS client
storage_client = storage.Client()

class PipelineOrchestrator:
    def __init__(self):
        # Microservice URLs
        self.data_extractor_url = os.getenv('DATA_EXTRACTOR_URL', 'https://data-extractor-812016027146.asia-south1.run.app')
        self.queue_processor_url = os.getenv('QUEUE_PROCESSOR_URL', 'https://queue-enrichment-processor-812016027146.asia-south1.run.app')  
        self.data_combiner_url = os.getenv('DATA_COMBINER_URL', 'https://data-combiner-812016027146.asia-south1.run.app')
        
        logger.info("🎼 Pipeline Orchestrator initialized")
        logger.info(f"📊 Data Extractor: {self.data_extractor_url}")
        logger.info(f"⚙️ Queue Processor: {self.queue_processor_url}")
        logger.info(f"🔗 Data Combiner: {self.data_combiner_url}")

    async def process_invoice_pipeline(self, image_content: str, job_id: str) -> Dict[str, Any]:
        """Orchestrate complete 3-phase pipeline"""
        try:
            logger.info(f"🚀 Starting 3-phase pipeline for job: {job_id}")
            pipeline_start = datetime.now()
            
            # Phase 1: Data Extraction (1A + 1B)
            logger.info(f"📊 Phase 1: Data Extraction")
            phase1_start = datetime.now()
            
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
            
            # Phase 2: Queue Processing & Standardization (2A + 2B + 2C + 2D)
            logger.info(f"⚙️ Phase 2: Queue Processing & Standardization")
            phase2_start = datetime.now()
            
            processing_payload = {
                'extracted_data': extraction_result['extracted_data'],
                'job_id': job_id
            }
            
            processing_response = requests.post(
                f"{self.queue_processor_url}/process-extracted-data",
                json=processing_payload,
                timeout=600
            )
            
            if not processing_response.ok:
                error_msg = f"Phase 2 failed: {processing_response.status_code}"
                logger.error(f"❌ {error_msg}")
                return {'status': 'FAILED', 'phase': 2, 'error': error_msg}
            
            processing_result = processing_response.json()
            if processing_result['status'] != 'SUCCESS':
                return {'status': 'FAILED', 'phase': 2, 'error': processing_result.get('error')}
            
            phase2_duration = (datetime.now() - phase2_start).total_seconds()
            logger.info(f"✅ Phase 2 completed in {phase2_duration:.2f}s")
            
            # Phase 3: Data Combination & Storage (3)
            logger.info(f"🔗 Phase 3: Data Combination & Storage")
            phase3_start = datetime.now()
            
            combination_payload = {
                'processed_data': processing_result['processed_data'],
                'job_id': job_id
            }
            
            combination_response = requests.post(
                f"{self.data_combiner_url}/combine-and-store", 
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
            logger.info(f"🎉 Complete pipeline finished in {total_duration:.2f}s")
            
            # Return final result
            return {
                'status': 'SUCCESS',
                'job_id': job_id,
                'final_result': combination_result['combined_document'],
                'pipeline_stats': {
                    'total_duration_seconds': total_duration,
                    'phase_durations': {
                        'phase1_extraction': phase1_duration,
                        'phase2_processing': phase2_duration,
                        'phase3_combination': phase3_duration
                    },
                    'extraction_stats': extraction_result.get('extraction_stats', {}),
                    'processing_stats': processing_result.get('processing_stats', {}),
                    'storage_stats': combination_result.get('summary', {})
                }
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
        'version': '1.0.0',
        'architecture': 'microservices_3_phase'
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
        data = request.get_json()
        if not data:
            return jsonify({
                'status': 'error',
                'error': 'No JSON data provided'
            }), 400
        
        image_content = data.get('image_content')
        job_id = data.get('job_id', f"job_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
        
        if not image_content:
            return jsonify({
                'status': 'error',
                'error': 'image_content is required'
            }), 400
        
        logger.info(f"📥 Processing orchestration request for job: {job_id}")
        
        # Process through orchestrator
        result = asyncio.run(orchestrator.process_invoice_pipeline(image_content, job_id))
        
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