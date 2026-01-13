"""
Orchestrator Service - Lightweight Job Coordination Hub
Handles job creation, status tracking, and phase orchestration without heavy dependencies
"""

import os
import sys
import uuid
import logging
from datetime import datetime
from typing import Dict, Any, Optional

# Add shared utilities to path
sys.path.append('../shared')

from flask import Flask, request, jsonify
from flask_cors import CORS

# Import shared utilities
from shared import (
    auth_utils,
    firestore_utils,
    require_auth_and_tenant,
    success_response,
    ErrorHandler,
    APIError
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*", "methods": ["GET", "POST", "OPTIONS"], "allow_headers": ["Content-Type", "Authorization"]}})

class OrchestrationService:
    """Lightweight orchestration service for job management"""
    
    def __init__(self):
        self.project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
        self.environment = os.getenv('ENVIRONMENT', 'development')
        
        # Service URLs (will be set from environment in production)
        self.data_extractor_url = os.getenv('DATA_EXTRACTOR_URL', 'https://data-extractor-v2-812016027146.asia-south1.run.app')
        self.chunk_dispatcher_url = os.getenv('CHUNK_DISPATCHER_URL', 'https://chunk-dispatcher-812016027146.asia-south1.run.app')
        self.field_standardizer_url = os.getenv('FIELD_STANDARDIZER_URL', 'https://field-standardizer-v2-812016027146.asia-south1.run.app')
        self.data_combiner_url = os.getenv('DATA_COMBINER_URL', 'https://data-combiner-v2-812016027146.asia-south1.run.app')
        
        logger.info(f"🎼 Orchestrator Service initialized - {self.environment}")
        logger.info(f"📊 Services configured: extractor, dispatcher, standardizer, combiner")
    
    def create_job(self, tenant_id: str, auth_context: Dict[str, Any], initial_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create new processing job with unique ID"""
        try:
            # Generate unique job ID
            job_id = f"job_{uuid.uuid4().hex[:12]}"
            
            # Prepare job document data
            job_data = {
                'gcs_input_path': initial_data.get('gcs_input_path'),
                'original_filename': initial_data.get('original_filename'),
                'file_size_bytes': initial_data.get('file_size_bytes'),
                'processing_mode': 'tenant_isolated_pipeline',
                'pipeline_version': '2.0'
            }
            
            # Create job document in Firestore
            doc_path = firestore_utils.create_job_document(
                tenant_id, 
                job_id, 
                job_data, 
                auth_context
            )
            
            logger.info(f"✅ Created job {job_id} for tenant {tenant_id}")
            
            return {
                'job_id': job_id,
                'tenant_id': tenant_id,
                'status': 'CREATED',
                'doc_path': doc_path,
                'created_at': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to create job: {e}")
            raise APIError("Failed to create processing job", "JOB_CREATION_FAILED", 500)
    
    def trigger_extraction_phase(self, tenant_id: str, job_id: str, gcs_input_path: str) -> Dict[str, Any]:
        """Trigger data extraction phase"""
        try:
            # Update job status to EXTRACTING
            firestore_utils.update_job_status(tenant_id, job_id, 'EXTRACTING')
            
            # In a full implementation, this would make HTTP call to data-extractor-v2
            # For now, return success response
            logger.info(f"🚀 Triggered extraction for job {job_id}")
            
            return {
                'phase': 'extraction',
                'status': 'triggered',
                'service_url': self.data_extractor_url
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to trigger extraction: {e}")
            raise APIError("Failed to trigger extraction phase", "EXTRACTION_TRIGGER_FAILED", 500)
    
    def get_job_status(self, tenant_id: str, job_id: str) -> Dict[str, Any]:
        """Get current job status and progress"""
        try:
            # Get job data from Firestore
            job_data = firestore_utils.get_job_data(tenant_id, job_id, include_chunks=True)
            
            if not job_data:
                raise APIError("Job not found", "JOB_NOT_FOUND", 404)
            
            # Calculate progress based on chunks if available
            progress_info = self._calculate_progress(job_data)
            
            return {
                'job_id': job_id,
                'tenant_id': tenant_id,
                'status': job_data.get('status'),
                'created_at': job_data.get('created_at'),
                'updated_at': job_data.get('updated_at'),
                'progress': progress_info,
                'processing_stats': job_data.get('processing_stats', {})
            }
            
        except APIError:
            raise
        except Exception as e:
            logger.error(f"❌ Failed to get job status: {e}")
            raise APIError("Failed to retrieve job status", "JOB_STATUS_FAILED", 500)
    
    def _calculate_progress(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate job progress based on status and chunks"""
        status = job_data.get('status', 'CREATED')
        
        # Base progress by status
        status_progress = {
            'CREATED': 5,
            'EXTRACTING': 20,
            'ENRICHING': 40,
            'STANDARDIZING': 70,
            'COMBINING': 90,
            'COMPLETED': 100,
            'FAILED': 0
        }
        
        base_progress = status_progress.get(status, 0)
        
        # If we have chunks, calculate detailed progress
        chunks = job_data.get('chunks', [])
        if chunks and status == 'ENRICHING':
            completed_chunks = sum(1 for chunk in chunks if chunk.get('status') == 'COMPLETED')
            total_chunks = len(chunks)
            
            if total_chunks > 0:
                chunk_progress = (completed_chunks / total_chunks) * 30  # 30% of progress is enrichment
                base_progress = 20 + chunk_progress  # Start from 20% (extraction done)
        
        return {
            'percentage': min(100, max(0, int(base_progress))),
            'current_phase': status,
            'chunks': {
                'total': len(chunks),
                'completed': sum(1 for chunk in chunks if chunk.get('status') == 'COMPLETED'),
                'failed': sum(1 for chunk in chunks if chunk.get('status') == 'FAILED')
            } if chunks else None
        }

# Initialize service
orchestration_service = OrchestrationService()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'service': 'orchestrator-service',
        'status': 'healthy',
        'version': '2.0.0',
        'environment': orchestration_service.environment,
        'capabilities': ['job_creation', 'status_tracking', 'phase_orchestration']
    })

@app.route('/process-invoice', methods=['POST'])
@require_auth_and_tenant
def process_invoice(auth_context: Dict[str, Any]):
    """Create new invoice processing job"""
    try:
        # Validate request
        if not request.json:
            raise APIError("Request must contain JSON data", "INVALID_REQUEST", 400)
        
        tenant_id = auth_context['tenant_id']
        gcs_input_path = request.json.get('gcs_input_path')
        
        if not gcs_input_path:
            raise APIError("gcs_input_path is required", "MISSING_INPUT_PATH", 400)
        
        # Create job
        job_result = orchestration_service.create_job(
            tenant_id,
            auth_context,
            {
                'gcs_input_path': gcs_input_path,
                'original_filename': request.json.get('original_filename'),
                'file_size_bytes': request.json.get('file_size_bytes', 0)
            }
        )
        
        # Trigger extraction phase
        extraction_result = orchestration_service.trigger_extraction_phase(
            tenant_id,
            job_result['job_id'],
            gcs_input_path
        )
        
        response_data = {
            **job_result,
            'extraction_triggered': True,
            'next_phase': 'extraction'
        }
        
        return jsonify(success_response(response_data, "Invoice processing initiated"))
        
    except APIError as e:
        return ErrorHandler.format_error_response(e.message, e.error_code, e.status_code)
    except Exception as e:
        logger.error(f"❌ Process invoice error: {e}")
        return ErrorHandler.handle_generic_error(e, {'tenant_id': auth_context.get('tenant_id')})

@app.route('/jobs/<job_id>/status', methods=['GET'])
@require_auth_and_tenant
def get_job_status(job_id: str, auth_context: Dict[str, Any]):
    """Get status of specific job"""
    try:
        tenant_id = auth_context['tenant_id']
        
        # Get job status
        status_data = orchestration_service.get_job_status(tenant_id, job_id)
        
        return jsonify(success_response(status_data, "Job status retrieved"))
        
    except APIError as e:
        return ErrorHandler.format_error_response(e.message, e.error_code, e.status_code)
    except Exception as e:
        logger.error(f"❌ Get job status error: {e}")
        return ErrorHandler.handle_generic_error(e, {'tenant_id': auth_context.get('tenant_id'), 'job_id': job_id})

@app.route('/jobs/<job_id>/progress', methods=['GET'])
@require_auth_and_tenant  
def get_job_progress(job_id: str, auth_context: Dict[str, Any]):
    """Get detailed progress of specific job"""
    try:
        tenant_id = auth_context['tenant_id']
        
        # Get job status (includes progress)
        status_data = orchestration_service.get_job_status(tenant_id, job_id)
        
        # Return just the progress information
        progress_data = {
            'job_id': job_id,
            'progress': status_data['progress'],
            'status': status_data['status'],
            'updated_at': status_data['updated_at']
        }
        
        return jsonify(success_response(progress_data, "Job progress retrieved"))
        
    except APIError as e:
        return ErrorHandler.format_error_response(e.message, e.error_code, e.status_code)
    except Exception as e:
        logger.error(f"❌ Get job progress error: {e}")
        return ErrorHandler.handle_generic_error(e, {'tenant_id': auth_context.get('tenant_id'), 'job_id': job_id})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)