"""
Chunk Dispatcher Service - Line Item Batching and Pub/Sub Publishing
Splits extracted line items into manageable chunks (3-5 items) and publishes to Pub/Sub for async enrichment
"""

import os
import sys
import json
import logging
from typing import Dict, Any, List
from datetime import datetime
import math

# Add shared utilities to path
sys.path.append('../shared')

from flask import Flask, request, jsonify
from flask_cors import CORS

# Import shared utilities
from shared import (
    auth_utils,
    firestore_utils,
    pubsub_utils,
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

class ChunkDispatcherService:
    """Service to split line items into chunks and dispatch for async processing"""
    
    def __init__(self):
        self.project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
        self.environment = os.getenv('ENVIRONMENT', 'development')
        
        # Chunking configuration
        self.chunk_size = int(os.getenv('CHUNK_SIZE', '4'))  # 3-5 items per chunk, default 4
        self.min_chunk_size = 3
        self.max_chunk_size = 5
        
        # Pub/Sub configuration  
        self.enrichment_topic = os.getenv('ENRICHMENT_TOPIC', 'enrichment-chunks')
        
        logger.info(f"📦 Chunk Dispatcher Service initialized - {self.environment}")
        logger.info(f"🔢 Chunk size: {self.chunk_size} items per chunk")
        logger.info(f"📡 Publishing to topic: {self.enrichment_topic}")
    
    def validate_line_items(self, line_items: List[Dict[str, Any]]) -> None:
        """Validate line items structure and content"""
        
        if not line_items:
            raise APIError("No line items provided for chunking", "NO_LINE_ITEMS", 400)
        
        if len(line_items) > 100:  # Reasonable limit
            raise APIError(f"Too many line items ({len(line_items)}). Maximum 100 supported.", "TOO_MANY_ITEMS", 400)
        
        # Validate each line item has required fields
        required_fields = ['line_number', 'description', 'amount']
        for idx, item in enumerate(line_items):
            missing_fields = [field for field in required_fields if field not in item or item[field] is None]
            if missing_fields:
                raise APIError(
                    f"Line item {idx + 1} missing required fields: {', '.join(missing_fields)}",
                    "INVALID_LINE_ITEM",
                    400
                )
        
        logger.info(f"✅ Line items validation passed: {len(line_items)} items")
    
    def create_chunks(self, line_items: List[Dict[str, Any]], job_id: str, tenant_id: str) -> List[Dict[str, Any]]:
        """Split line items into optimally-sized chunks"""
        
        total_items = len(line_items)
        
        # Calculate optimal chunk size based on total items
        if total_items <= self.max_chunk_size:
            # Single chunk if small enough
            chunk_size = total_items
        else:
            # Calculate chunks to minimize remainder
            optimal_chunks = math.ceil(total_items / self.chunk_size)
            chunk_size = math.ceil(total_items / optimal_chunks)
            
            # Ensure chunk size stays within bounds
            chunk_size = max(self.min_chunk_size, min(self.max_chunk_size, chunk_size))
        
        # Create chunks
        chunks = []
        for i in range(0, total_items, chunk_size):
            chunk_items = line_items[i:i + chunk_size]
            
            chunk_id = f"{job_id}_chunk_{len(chunks) + 1:03d}"
            chunk_data = {
                'chunk_id': chunk_id,
                'job_id': job_id,
                'tenant_id': tenant_id,
                'chunk_index': len(chunks),
                'total_chunks': math.ceil(total_items / chunk_size),
                'line_items': chunk_items,
                'item_count': len(chunk_items),
                'created_at': datetime.utcnow().isoformat(),
                'status': 'CREATED',
                'processing_metadata': {
                    'requires_enrichment': True,
                    'priority': 'normal',
                    'retry_count': 0,
                    'max_retries': 3
                }
            }
            
            chunks.append(chunk_data)
        
        logger.info(f"📦 Created {len(chunks)} chunks from {total_items} line items (avg {total_items/len(chunks):.1f} items per chunk)")
        
        return chunks
    
    def publish_chunks_to_pubsub(self, chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Publish chunks to Pub/Sub for async processing"""
        
        try:
            published_count = 0
            failed_chunks = []
            
            for chunk in chunks:
                try:
                    # Prepare message data
                    message_data = {
                        'chunk_id': chunk['chunk_id'],
                        'job_id': chunk['job_id'],
                        'tenant_id': chunk['tenant_id'],
                        'chunk_index': chunk['chunk_index'],
                        'total_chunks': chunk['total_chunks'],
                        'line_items': chunk['line_items'],
                        'processing_metadata': chunk['processing_metadata']
                    }
                    
                    # Add message attributes for filtering/routing
                    attributes = {
                        'tenant_id': chunk['tenant_id'],
                        'job_id': chunk['job_id'],
                        'chunk_index': str(chunk['chunk_index']),
                        'item_count': str(chunk['item_count']),
                        'message_type': 'enrichment_chunk'
                    }
                    
                    # Publish to Pub/Sub
                    message_id = pubsub_utils.publish_message(
                        self.enrichment_topic,
                        message_data,
                        attributes
                    )
                    
                    # Update chunk status
                    chunk['status'] = 'PUBLISHED'
                    chunk['pubsub_message_id'] = message_id
                    chunk['published_at'] = datetime.utcnow().isoformat()
                    
                    published_count += 1
                    logger.info(f"📤 Published chunk {chunk['chunk_id']} (message: {message_id})")
                    
                except Exception as e:
                    logger.error(f"❌ Failed to publish chunk {chunk['chunk_id']}: {e}")
                    chunk['status'] = 'PUBLISH_FAILED'
                    chunk['error'] = str(e)
                    failed_chunks.append(chunk['chunk_id'])
            
            # Summary
            publish_result = {
                'total_chunks': len(chunks),
                'published_successfully': published_count,
                'failed_chunks': failed_chunks,
                'success_rate': published_count / len(chunks) if chunks else 0
            }
            
            logger.info(f"📡 Pub/Sub publishing complete: {published_count}/{len(chunks)} successful")
            
            return publish_result
            
        except Exception as e:
            logger.error(f"❌ Pub/Sub publishing failed: {e}")
            raise APIError("Failed to publish chunks to Pub/Sub", "PUBSUB_PUBLISH_FAILED", 500)
    
    def store_chunks_in_firestore(self, tenant_id: str, job_id: str, chunks: List[Dict[str, Any]]) -> None:
        """Store chunk metadata in Firestore for tracking"""
        
        try:
            # Store chunks in job document
            job_update_data = {
                'status': 'CHUNKED',
                'chunks': chunks,
                'chunk_summary': {
                    'total_chunks': len(chunks),
                    'total_line_items': sum(chunk['item_count'] for chunk in chunks),
                    'average_chunk_size': sum(chunk['item_count'] for chunk in chunks) / len(chunks) if chunks else 0,
                    'chunks_published': sum(1 for chunk in chunks if chunk['status'] == 'PUBLISHED'),
                    'chunks_failed': sum(1 for chunk in chunks if chunk['status'] == 'PUBLISH_FAILED')
                },
                'updated_at': datetime.utcnow().isoformat()
            }
            
            firestore_utils.update_job_data(tenant_id, job_id, job_update_data)
            
            logger.info(f"💾 Stored {len(chunks)} chunks metadata in Firestore")
            
        except Exception as e:
            logger.error(f"❌ Failed to store chunks in Firestore: {e}")
            raise APIError("Failed to store chunk metadata", "FIRESTORE_STORAGE_FAILED", 500)
    
    def dispatch_line_items(self, tenant_id: str, job_id: str, line_items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Main method to chunk and dispatch line items"""
        
        try:
            # Validate input
            self.validate_line_items(line_items)
            
            # Create chunks
            chunks = self.create_chunks(line_items, job_id, tenant_id)
            
            # Publish chunks to Pub/Sub
            publish_result = self.publish_chunks_to_pubsub(chunks)
            
            # Store chunk metadata in Firestore
            self.store_chunks_in_firestore(tenant_id, job_id, chunks)
            
            # Update job status
            if publish_result['published_successfully'] == len(chunks):
                firestore_utils.update_job_status(tenant_id, job_id, 'ENRICHING')
            else:
                firestore_utils.update_job_status(tenant_id, job_id, 'CHUNKING_PARTIAL_FAILURE')
            
            # Prepare response
            dispatch_result = {
                'job_id': job_id,
                'tenant_id': tenant_id,
                'chunking_completed': True,
                'chunk_summary': {
                    'total_chunks_created': len(chunks),
                    'chunks_published_successfully': publish_result['published_successfully'],
                    'failed_chunks': publish_result['failed_chunks'],
                    'total_line_items': len(line_items),
                    'average_chunk_size': len(line_items) / len(chunks) if chunks else 0
                },
                'pubsub_topic': self.enrichment_topic,
                'processing_status': 'ENRICHING' if publish_result['success_rate'] == 1.0 else 'PARTIAL_FAILURE',
                'dispatched_at': datetime.utcnow().isoformat()
            }
            
            logger.info(f"✅ Line items dispatch completed for job {job_id}")
            
            return dispatch_result
            
        except APIError:
            raise
        except Exception as e:
            logger.error(f"❌ Line items dispatch failed: {e}")
            firestore_utils.update_job_status(tenant_id, job_id, 'CHUNKING_FAILED')
            raise APIError("Failed to dispatch line items", "DISPATCH_FAILED", 500)

# Initialize service
chunk_dispatcher_service = ChunkDispatcherService()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'service': 'chunk-dispatcher',
        'status': 'healthy',
        'version': '2.0.0',
        'environment': chunk_dispatcher_service.environment,
        'capabilities': ['line_item_chunking', 'pubsub_publishing', 'chunk_optimization'],
        'configuration': {
            'chunk_size': chunk_dispatcher_service.chunk_size,
            'chunk_size_range': [chunk_dispatcher_service.min_chunk_size, chunk_dispatcher_service.max_chunk_size],
            'enrichment_topic': chunk_dispatcher_service.enrichment_topic
        }
    })

@app.route('/dispatch', methods=['POST'])
@require_auth_and_tenant
def dispatch_line_items(auth_context: Dict[str, Any]):
    """Chunk and dispatch line items for enrichment"""
    try:
        # Validate request
        if not request.json:
            raise APIError("Request must contain JSON data", "INVALID_REQUEST", 400)
        
        tenant_id = auth_context['tenant_id']
        job_id = request.json.get('job_id')
        line_items = request.json.get('line_items', [])
        
        if not job_id:
            raise APIError("job_id is required", "MISSING_JOB_ID", 400)
        
        # Dispatch line items
        dispatch_result = chunk_dispatcher_service.dispatch_line_items(
            tenant_id,
            job_id,
            line_items
        )
        
        return jsonify(success_response(dispatch_result, "Line items dispatched for enrichment"))
        
    except APIError as e:
        return ErrorHandler.format_error_response(e.message, e.error_code, e.status_code)
    except Exception as e:
        logger.error(f"❌ Dispatch line items error: {e}")
        return ErrorHandler.handle_generic_error(e, {'tenant_id': auth_context.get('tenant_id')})

@app.route('/jobs/<job_id>/chunks', methods=['GET'])
@require_auth_and_tenant
def get_job_chunks(job_id: str, auth_context: Dict[str, Any]):
    """Get chunks status for specific job"""
    try:
        tenant_id = auth_context['tenant_id']
        
        # Get job data with chunks
        job_data = firestore_utils.get_job_data(tenant_id, job_id, include_chunks=True)
        
        if not job_data:
            raise APIError("Job not found", "JOB_NOT_FOUND", 404)
        
        chunks_data = {
            'job_id': job_id,
            'chunks': job_data.get('chunks', []),
            'chunk_summary': job_data.get('chunk_summary', {}),
            'status': job_data.get('status'),
            'updated_at': job_data.get('updated_at')
        }
        
        return jsonify(success_response(chunks_data, "Job chunks retrieved"))
        
    except APIError as e:
        return ErrorHandler.format_error_response(e.message, e.error_code, e.status_code)
    except Exception as e:
        logger.error(f"❌ Get job chunks error: {e}")
        return ErrorHandler.handle_generic_error(e, {'tenant_id': auth_context.get('tenant_id'), 'job_id': job_id})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)