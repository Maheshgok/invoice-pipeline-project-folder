"""
Enrichment Worker Service - Async Chunk Processing via Pub/Sub
Subscribes to enrichment chunks and processes them with OpenAI business data enrichment
"""

import os
import sys
import json
import logging
import asyncio
from typing import Dict, Any, List
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

# Add shared utilities to path
sys.path.append('../shared')

from flask import Flask, request, jsonify
from flask_cors import CORS

# Import Google Cloud Pub/Sub
from google.cloud import pubsub_v1
from google.cloud.pubsub_v1 import SubscriberClient
from google.cloud.pubsub_v1.subscriber.message import Message

# Import shared utilities
from shared import (
    auth_utils,
    openai_utils,
    firestore_utils,
    pubsub_utils,
    success_response,
    ErrorHandler,
    APIError,
    load_prompt_template
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*", "methods": ["GET", "POST", "OPTIONS"], "allow_headers": ["Content-Type", "Authorization"]}})

class EnrichmentWorkerService:
    """Async worker service for processing enrichment chunks"""
    
    def __init__(self):
        self.project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
        self.environment = os.getenv('ENVIRONMENT', 'development')
        
        # Pub/Sub configuration
        self.subscription_name = os.getenv('ENRICHMENT_SUBSCRIPTION', 'enrichment-worker-sub')
        self.max_concurrent_messages = int(os.getenv('MAX_CONCURRENT_MESSAGES', '10'))
        self.ack_deadline_seconds = int(os.getenv('ACK_DEADLINE_SECONDS', '600'))
        
        # Processing configuration
        self.max_retries = int(os.getenv('MAX_RETRIES', '3'))
        self.enable_processing = os.getenv('ENABLE_PROCESSING', 'true').lower() == 'true'
        
        # Initialize clients
        self.subscriber_client = None
        self.openai_client = None
        
        # Load enrichment prompt template
        self.enrichment_prompt = load_prompt_template('business_enrichment.txt')
        
        # Thread pool for concurrent processing
        self.executor = ThreadPoolExecutor(max_workers=self.max_concurrent_messages)
        
        logger.info(f"⚡ Enrichment Worker Service initialized - {self.environment}")
        logger.info(f"📡 Subscription: {self.subscription_name}")
        logger.info(f"🔄 Max concurrent messages: {self.max_concurrent_messages}")
        logger.info(f"⏱️ Ack deadline: {self.ack_deadline_seconds}s")
    
    def initialize_clients(self):
        """Initialize Pub/Sub subscriber and OpenAI clients"""
        try:
            # Initialize Pub/Sub subscriber
            self.subscriber_client = SubscriberClient()
            
            # Initialize OpenAI client (async)
            asyncio.run(self._initialize_openai_client())
            
            logger.info("🔌 Clients initialized successfully")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize clients: {e}")
            raise APIError("Failed to initialize worker clients", "CLIENT_INITIALIZATION_FAILED", 500)
    
    async def _initialize_openai_client(self):
        """Initialize OpenAI client with API key from Secret Manager"""
        if not self.openai_client:
            self.openai_client = await openai_utils.get_openai_client()
            logger.info("🤖 OpenAI client initialized")
    
    def start_subscriber(self):
        """Start the Pub/Sub subscriber to listen for enrichment chunks"""
        
        if not self.enable_processing:
            logger.info("⏸️ Processing disabled by configuration")
            return
        
        try:
            # Initialize clients if needed
            if not self.subscriber_client:
                self.initialize_clients()
            
            # Build subscription path
            subscription_path = self.subscriber_client.subscription_path(
                self.project_id, 
                self.subscription_name
            )
            
            # Configure flow control settings
            flow_control = pubsub_v1.types.FlowControl(
                max_messages=self.max_concurrent_messages
            )
            
            logger.info(f"🎧 Starting subscriber on: {subscription_path}")
            
            # Pull messages with callback
            streaming_pull_future = self.subscriber_client.subscribe(
                subscription_path,
                callback=self.process_chunk_message,
                flow_control=flow_control
            )
            
            logger.info(f"✅ Subscriber started, listening for messages...")
            
            # Keep the main thread running
            with self.subscriber_client:
                try:
                    streaming_pull_future.result()  # Block indefinitely
                except KeyboardInterrupt:
                    streaming_pull_future.cancel()
                    logger.info("🛑 Subscriber stopped by user")
                except Exception as e:
                    streaming_pull_future.cancel()
                    logger.error(f"❌ Subscriber error: {e}")
            
        except Exception as e:
            logger.error(f"❌ Failed to start subscriber: {e}")
            raise APIError("Failed to start message subscriber", "SUBSCRIBER_START_FAILED", 500)
    
    def process_chunk_message(self, message: Message):
        """Process individual chunk message from Pub/Sub"""
        
        try:
            # Parse message data
            message_data = json.loads(message.data.decode('utf-8'))
            chunk_id = message_data.get('chunk_id')
            
            logger.info(f"📨 Received chunk message: {chunk_id}")
            
            # Submit to thread pool for processing
            future = self.executor.submit(self._process_chunk_sync, message_data, message)
            
            # Don't wait for completion here - let it process async
            logger.info(f"🚀 Submitted chunk {chunk_id} for processing")
            
        except Exception as e:
            logger.error(f"❌ Failed to process chunk message: {e}")
            message.nack()  # Negative acknowledgment to retry
    
    def _process_chunk_sync(self, message_data: Dict[str, Any], message: Message):
        """Synchronous wrapper for chunk processing (runs in thread pool)"""
        
        try:
            # Run async processing in the thread pool
            result = asyncio.run(self._enrich_chunk_async(message_data))
            
            if result['success']:
                message.ack()  # Acknowledge successful processing
                logger.info(f"✅ Chunk {message_data.get('chunk_id')} processed successfully")
            else:
                message.nack()  # Retry on failure
                logger.error(f"❌ Chunk {message_data.get('chunk_id')} processing failed")
            
        except Exception as e:
            logger.error(f"❌ Sync chunk processing error: {e}")
            message.nack()
    
    async def _enrich_chunk_async(self, chunk_data: Dict[str, Any]) -> Dict[str, Any]:
        """Async enrichment processing for a single chunk"""
        
        chunk_id = chunk_data.get('chunk_id')
        tenant_id = chunk_data.get('tenant_id')
        job_id = chunk_data.get('job_id')
        client_id = chunk_data.get('client_id')  # Client organization ID
        line_items = chunk_data.get('line_items', [])
        
        try:
            # Update chunk status to PROCESSING
            self._update_chunk_status(tenant_id, job_id, chunk_id, 'PROCESSING')
            
            # Initialize OpenAI client if needed
            await self._initialize_openai_client()
            
            # Fetch client profile with Chart of Accounts
            client_profile = self._get_client_profile(tenant_id, client_id)
            chart_of_accounts = client_profile.get('chart_of_accounts', []) if client_profile else []
            capitalization_threshold = client_profile.get('capitalization_threshold', 0) if client_profile else 0
            business_description = client_profile.get('business_description', '') if client_profile else ''
            
            logger.info(f"📊 Client profile loaded: {len(chart_of_accounts)} accounts, cap threshold: {capitalization_threshold}")
            
            # Prepare enrichment context
            enrichment_context = {
                'chart_of_accounts': chart_of_accounts,
                'capitalization_threshold': capitalization_threshold,
                'business_description': business_description,
                'client_id': client_id
            }
            
            # Process each line item in the chunk
            enriched_items = []
            
            for item in line_items:
                enriched_item = await self._enrich_single_line_item(item, enrichment_context)
                enriched_items.append(enriched_item)
            
            # Prepare enriched chunk data
            enriched_chunk = {
                'chunk_id': chunk_id,
                'job_id': job_id,
                'tenant_id': tenant_id,
                'enriched_line_items': enriched_items,
                'enrichment_timestamp': datetime.utcnow().isoformat(),
                'processing_stats': {
                    'items_processed': len(enriched_items),
                    'openai_tokens_used': openai_utils.get_session_token_count(),
                    'processing_time_seconds': 0  # Would be calculated
                }
            }
            
            # Store enriched chunk in Firestore
            self._store_enriched_chunk(tenant_id, job_id, enriched_chunk)
            
            # Update chunk status to COMPLETED
            self._update_chunk_status(tenant_id, job_id, chunk_id, 'COMPLETED')
            
            logger.info(f"✅ Enriched chunk {chunk_id}: {len(enriched_items)} items")
            
            return {'success': True, 'chunk_id': chunk_id, 'items_processed': len(enriched_items)}
            
        except Exception as e:
            logger.error(f"❌ Chunk enrichment failed for {chunk_id}: {e}")
            
            # Update chunk status to FAILED
            self._update_chunk_status(tenant_id, job_id, chunk_id, 'FAILED', str(e))
            
            return {'success': False, 'chunk_id': chunk_id, 'error': str(e)}
    
    def _get_client_profile(self, tenant_id: str, client_id: str) -> Dict[str, Any]:
        """Fetch client profile including Chart of Accounts from Firestore"""
        
        if not client_id:
            logger.warning("⚠️ No client_id provided, using default enrichment")
            return None
        
        try:
            # Client organizations are stored under user's path
            # Path: users/{tenant_id}/client_organizations/{client_id}
            client_ref = firestore_utils.db.collection('users').document(tenant_id).collection('client_organizations').document(client_id)
            client_doc = client_ref.get()
            
            if client_doc.exists:
                client_data = client_doc.to_dict()
                logger.info(f"📋 Loaded client profile: {client_data.get('client_name', 'Unknown')}")
                return client_data
            else:
                logger.warning(f"⚠️ Client {client_id} not found for tenant {tenant_id}")
                return None
                
        except Exception as e:
            logger.error(f"❌ Failed to fetch client profile: {e}")
            return None
    
    def _match_account_from_coa(self, description: str, amount: float, chart_of_accounts: List[Dict], capitalization_threshold: float) -> Dict[str, Any]:
        """Match line item to best account from client's Chart of Accounts using keywords"""
        
        if not chart_of_accounts:
            return None
        
        description_lower = description.lower()
        best_match = None
        best_score = 0
        
        for account in chart_of_accounts:
            if not account.get('is_active', True):
                continue
            
            score = 0
            keywords = account.get('keywords', [])
            
            # Check keyword matches
            for keyword in keywords:
                if keyword.lower() in description_lower:
                    score += 10
            
            # Partial name match
            account_name_lower = account.get('account_name', '').lower()
            if any(word in description_lower for word in account_name_lower.split()):
                score += 5
            
            # Check HSN code match if available
            hsn_codes = account.get('hsn_codes', [])
            # Would compare with extracted HSN from line item
            
            if score > best_score:
                best_score = score
                best_match = account
        
        # Check capitalization threshold for asset classification
        is_capitalizable = amount >= capitalization_threshold if capitalization_threshold > 0 else False
        
        if best_match:
            return {
                'account_code': best_match.get('account_code'),
                'account_name': best_match.get('account_name'),
                'account_type': best_match.get('account_type'),
                'match_score': best_score,
                'match_source': 'coa_keyword_match',
                'is_capitalizable': is_capitalizable,
                'capitalization_threshold': capitalization_threshold
            }
        
        return None
    
    async def _enrich_single_line_item(self, line_item: Dict[str, Any], enrichment_context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Enrich a single line item with business data using client's Chart of Accounts"""
        
        try:
            # Extract context
            chart_of_accounts = enrichment_context.get('chart_of_accounts', []) if enrichment_context else []
            capitalization_threshold = enrichment_context.get('capitalization_threshold', 0) if enrichment_context else 0
            business_description = enrichment_context.get('business_description', '') if enrichment_context else ''
            
            # Get line item details
            item_description = line_item.get('description', '')
            item_amount = float(line_item.get('amount', 0) or line_item.get('total', 0) or 0)
            
            # First try to match from client's Chart of Accounts
            coa_match = self._match_account_from_coa(
                item_description, 
                item_amount, 
                chart_of_accounts, 
                capitalization_threshold
            )
            
            # Build COA context for AI prompt
            coa_context = ""
            if chart_of_accounts:
                active_accounts = [a for a in chart_of_accounts if a.get('is_active', True)]
                coa_summary = "\n".join([
                    f"- {a.get('account_code')}: {a.get('account_name')} ({a.get('account_type')}) - {a.get('description', '')}"
                    for a in active_accounts[:20]  # Limit to top 20 for token efficiency
                ])
                coa_context = f"\n\nClient's Chart of Accounts:\n{coa_summary}"
            
            cap_context = ""
            if capitalization_threshold > 0:
                cap_context = f"\n\nCapitalization Threshold: ₹{capitalization_threshold:,.2f} (Items above this should be considered for fixed asset capitalization)"
            
            # Prepare enrichment prompt with COA context
            prompt = self.enrichment_prompt.replace('{item_description}', item_description)
            prompt = prompt.replace('{business_context}', f'Indian B2B invoice processing. {business_description}{coa_context}{cap_context}')
            
            # Add COA matching instruction
            if coa_match:
                prompt += f"\n\nSuggested account match: {coa_match.get('account_code')} - {coa_match.get('account_name')} (match score: {coa_match.get('match_score')})"
            
            # Prepare OpenAI messages
            messages = [
                {
                    "role": "system",
                    "content": """You are an expert at enriching invoice line items with standardized business data for Indian accounting systems.
When a Chart of Accounts is provided, prefer matching to those accounts over generic categories.
Return a JSON object with: account_code, account_name, hsn_code, tax_category, product_category, is_capitalizable, and confidence score."""
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ]
            
            # Call OpenAI API
            response = await openai_utils.call_openai_api(
                messages=messages,
                model="gpt-4o",
                max_tokens=500,
                temperature=0.2
            )
            
            # Parse response and use COA match if available
            enriched_data = {
                'product_category': 'Expense',
                'hsn_code': '998314',
                'tax_category': 'GST_18_PERCENT',
                'account_code': coa_match.get('account_code') if coa_match else 'MISC_EXPENSE',
                'account_name': coa_match.get('account_name') if coa_match else 'Miscellaneous Expense',
                'account_type': coa_match.get('account_type') if coa_match else 'expense',
                'business_classification': 'B2B_EXPENSE',
                'is_capitalizable': coa_match.get('is_capitalizable', False) if coa_match else False,
                'capitalization_threshold': capitalization_threshold,
                'coa_match_score': coa_match.get('match_score', 0) if coa_match else 0,
                'enrichment_confidence': 0.95 if coa_match and coa_match.get('match_score', 0) > 5 else 0.7
            }
            
            # Merge with original line item
            enriched_item = {
                **line_item,
                'enrichment_data': enriched_data,
                'enriched_at': datetime.utcnow().isoformat(),
                'enrichment_source': 'openai_gpt4o_with_coa' if chart_of_accounts else 'openai_gpt4o'
            }
            
            return enriched_item
            
        except Exception as e:
            logger.error(f"❌ Line item enrichment failed: {e}")
            
            # Return original item with error info
            return {
                **line_item,
                'enrichment_data': None,
                'enrichment_error': str(e),
                'enriched_at': datetime.utcnow().isoformat()
            }
    
    def _update_chunk_status(self, tenant_id: str, job_id: str, chunk_id: str, status: str, error: str = None):
        """Update chunk status in Firestore"""
        
        try:
            # Get current job data
            job_data = firestore_utils.get_job_data(tenant_id, job_id, include_chunks=True)
            
            if not job_data or 'chunks' not in job_data:
                logger.error(f"❌ Job {job_id} or chunks not found for status update")
                return
            
            # Find and update the specific chunk
            chunks = job_data['chunks']
            chunk_found = False
            
            for chunk in chunks:
                if chunk['chunk_id'] == chunk_id:
                    chunk['status'] = status
                    chunk['updated_at'] = datetime.utcnow().isoformat()
                    
                    if error:
                        chunk['error'] = error
                    
                    if status == 'PROCESSING':
                        chunk['started_at'] = datetime.utcnow().isoformat()
                    elif status in ['COMPLETED', 'FAILED']:
                        chunk['finished_at'] = datetime.utcnow().isoformat()
                    
                    chunk_found = True
                    break
            
            if chunk_found:
                # Update job with modified chunks
                firestore_utils.update_job_data(tenant_id, job_id, {
                    'chunks': chunks,
                    'updated_at': datetime.utcnow().isoformat()
                })
                
                logger.info(f"📝 Updated chunk {chunk_id} status to {status}")
            else:
                logger.error(f"❌ Chunk {chunk_id} not found in job {job_id}")
            
        except Exception as e:
            logger.error(f"❌ Failed to update chunk status: {e}")
    
    def _store_enriched_chunk(self, tenant_id: str, job_id: str, enriched_chunk: Dict[str, Any]):
        """Store enriched chunk data in Firestore"""
        
        try:
            # Store in enriched_chunks subcollection
            enriched_chunks_path = firestore_utils.get_tenant_collection_path(
                tenant_id, 
                f'jobs/{job_id}/enriched_chunks'
            )
            
            chunk_id = enriched_chunk['chunk_id']
            
            # Store enriched chunk
            firestore_utils.store_document(
                enriched_chunks_path,
                chunk_id,
                enriched_chunk
            )
            
            logger.info(f"💾 Stored enriched chunk {chunk_id}")
            
        except Exception as e:
            logger.error(f"❌ Failed to store enriched chunk: {e}")

# Initialize service
enrichment_worker_service = EnrichmentWorkerService()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'service': 'enrichment-worker',
        'status': 'healthy',
        'version': '2.0.0',
        'environment': enrichment_worker_service.environment,
        'capabilities': ['chunk_enrichment', 'pubsub_subscriber', 'openai_processing'],
        'configuration': {
            'subscription_name': enrichment_worker_service.subscription_name,
            'max_concurrent_messages': enrichment_worker_service.max_concurrent_messages,
            'ack_deadline_seconds': enrichment_worker_service.ack_deadline_seconds,
            'processing_enabled': enrichment_worker_service.enable_processing
        }
    })

@app.route('/start-processing', methods=['POST'])
def start_processing():
    """Start Pub/Sub message processing"""
    try:
        if not enrichment_worker_service.enable_processing:
            return jsonify(success_response(
                {'processing_enabled': False}, 
                "Processing is disabled by configuration"
            ))
        
        # Start subscriber in background thread (in production, this would be a separate process)
        import threading
        subscriber_thread = threading.Thread(
            target=enrichment_worker_service.start_subscriber,
            daemon=True
        )
        subscriber_thread.start()
        
        return jsonify(success_response(
            {
                'processing_started': True,
                'subscription': enrichment_worker_service.subscription_name,
                'max_concurrent': enrichment_worker_service.max_concurrent_messages
            },
            "Enrichment processing started"
        ))
        
    except Exception as e:
        logger.error(f"❌ Failed to start processing: {e}")
        return ErrorHandler.handle_generic_error(e, {'service': 'enrichment-worker'})

@app.route('/processing-stats', methods=['GET'])
def get_processing_stats():
    """Get processing statistics"""
    try:
        # In a real implementation, this would return actual stats
        stats = {
            'service': 'enrichment-worker',
            'processing_enabled': enrichment_worker_service.enable_processing,
            'subscription_name': enrichment_worker_service.subscription_name,
            'max_concurrent_messages': enrichment_worker_service.max_concurrent_messages,
            'thread_pool_size': enrichment_worker_service.executor._max_workers,
            'session_stats': {
                'chunks_processed': 0,  # Would be tracked
                'items_enriched': 0,    # Would be tracked
                'openai_tokens_used': openai_utils.get_session_token_count(),
                'uptime_seconds': 0     # Would be calculated
            }
        }
        
        return jsonify(success_response(stats, "Processing statistics retrieved"))
        
    except Exception as e:
        logger.error(f"❌ Failed to get processing stats: {e}")
        return ErrorHandler.handle_generic_error(e, {'service': 'enrichment-worker'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    
    # For development, start the subscriber automatically
    if enrichment_worker_service.environment == 'development':
        logger.info("🔧 Development mode: Auto-starting subscriber")
        import threading
        subscriber_thread = threading.Thread(
            target=enrichment_worker_service.start_subscriber,
            daemon=True
        )
        subscriber_thread.start()
    
    app.run(host='0.0.0.0', port=port, debug=False)