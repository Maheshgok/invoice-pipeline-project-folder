"""
Invoice Processing Service
Core business logic for processing invoices
Handles the complete processing workflow with GST taxonomy integration
"""
import logging
from datetime import datetime
from typing import Dict, Any, Tuple

from openai_processor import OpenAIProcessor
from result_manager import ResultManager
from processing_tracker import ProcessingTracker
from gst_taxonomy_helper import GSTTaxonomyHelper

logger = logging.getLogger(__name__)

class InvoiceProcessingService:
    """Core service for invoice processing business logic"""
    
    def __init__(self):
        self.logger = logging.getLogger(self.__class__.__name__)
        self.openai_processor = OpenAIProcessor()
        self.result_manager = ResultManager()
        self.tracker = ProcessingTracker()
        
        self.logger.info("Invoice Processing Service initialized")
    
    def process_invoice_task(self, job_id: str, bucket_path: str, user_context: Dict[str, Any], source: str = 'cloud_tasks') -> Tuple[Dict[str, Any], int]:
        """
        Process a single invoice task with complete error handling and tracking
        
        Args:
            job_id: Unique job identifier
            bucket_path: GCS path to the invoice file
            user_context: User context including email, UID, and organization info
            source: Source of the task (for tracking)
        
        Returns:
            Tuple of (response_dict, status_code)
        """
        user_email = user_context['email']
        user_uid = user_context['uid']
        organization_id = user_context.get('organization_id')
        client_organization_context = user_context.get('client_organization_context')
        client_organization_id = user_context.get('client_organization_id')
        client_organization_name = user_context.get('client_organization_name')
        
        # 🔍 DEBUG: Comprehensive user context logging
        self.logger.info(f"🗺️ USER CONTEXT DEBUG for job {job_id}:")
        self.logger.info(f"   Raw user_context: {user_context}")
        self.logger.info(f"   Extracted email: '{user_email}'")
        self.logger.info(f"   Extracted UID: '{user_uid}'")
        self.logger.info(f"   Extracted org_id: '{organization_id}'")
        self.logger.info(f"   Client org context: {bool(client_organization_context)}")
        self.logger.info(f"   Client org ID: '{client_organization_id}'")
        self.logger.info(f"   Client org name: '{client_organization_name}'")
        
        self.logger.info(f"🚀 Starting invoice processing")
        self.logger.info(f"📋 Job ID: {job_id}")
        self.logger.info(f"📁 File path: {bucket_path}")
        self.logger.info(f"👤 User: {user_email} (UID: {user_uid[:8]}...)")
        self.logger.info(f"🏢 Organization: {organization_id or 'None'}")
        self.logger.info(f"🏢 Client: {client_organization_name or 'None'}")
        self.logger.info(f"🔍 Source: {source}")
        
        # Track processing start with full context
        self.tracker.track_start(job_id, bucket_path, user_email, source)
        
        try:
            # Step 1: Process with OpenAI (with client organization context)
            self.logger.info(f"🔄 Starting OpenAI processing for job {job_id}")
            
            processing_result = self.openai_processor.process_image(
                bucket_path, 
                user_uid,
                client_organization_context=client_organization_context,
                client_organization_id=client_organization_id
            )
            
            if processing_result.get('success', False):
                # Step 2: Handle successful processing
                extracted_data = processing_result.get('data', {})
                
                # Store result in Firestore with user/organization context
                self.result_manager.store_result(
                    job_id=job_id,
                    user_email=user_email,
                    extracted_data=extracted_data,
                    status='completed',
                    bucket_path=bucket_path,
                    user_uid=user_uid,
                    organization_id=organization_id
                )
                
                # Track completion
                self.tracker.track_completion(job_id, True, extracted_data)
                
                self.logger.info(f"✅ Successfully processed job {job_id}")
                
                return {
                    "status": "success",
                    "job_id": job_id,
                    "message": "Invoice processed successfully",
                    "processing_time": self.tracker.get_processing_time(job_id),
                    "data": extracted_data,
                    "timestamp": datetime.now().isoformat()
                }, 200
            
            else:
                # Step 3: Handle processing failure
                return self._handle_processing_failure(job_id, user_context, bucket_path, processing_result)
        
        except Exception as e:
            # Step 4: Handle unexpected errors
            return self._handle_unexpected_error(job_id, user_context, bucket_path, e)
    
    def _handle_processing_failure(self, job_id: str, user_context: Dict[str, Any], bucket_path: str, 
                                   processing_result: Dict[str, Any]) -> Tuple[Dict[str, Any], int]:
        """Handle OpenAI processing failures"""
        error_message = processing_result.get('error', 'Unknown processing error')
        
        # Store failed result with user context
        self.result_manager.store_result(
            job_id=job_id,
            user_email=user_context['email'],
            extracted_data={},
            status='failed',
            bucket_path=bucket_path,
            error=error_message,
            user_uid=user_context['uid'],
            organization_id=user_context.get('organization_id')
        )
        
        # Track failure
        self.tracker.track_completion(job_id, False, None, error_message)
        
        self.logger.error(f"❌ Processing failed for job {job_id}: {error_message}")
        
        # Return 200 to prevent Cloud Tasks retry for business logic errors
        return {
            "status": "processed_with_error",
            "job_id": job_id,
            "message": "Invoice processing completed with errors",
            "error": error_message,
            "processing_time": self.tracker.get_processing_time(job_id),
            "timestamp": datetime.now().isoformat()
        }, 200
    
    def _handle_unexpected_error(self, job_id: str, user_context: Dict[str, Any], bucket_path: str, 
                                 error: Exception) -> Tuple[Dict[str, Any], int]:
        """Handle unexpected system errors"""
        error_message = f"Unexpected processing error: {str(error)}"
        
        # Store error result with user context
        self.result_manager.store_result(
            job_id=job_id,
            user_email=user_context['email'],
            extracted_data={},
            status='failed',
            bucket_path=bucket_path,
            error=error_message,
            user_uid=user_context['uid'],
            organization_id=user_context.get('organization_id')
        )
        
        # Track failure
        self.tracker.track_completion(job_id, False, None, error_message)
        
        self.logger.error(f"💥 Unexpected error processing job {job_id}: {error}", exc_info=True)
        
        # Return 500 to trigger Cloud Tasks retry for system errors
        return {
            "status": "error",
            "job_id": job_id,
            "message": "System error occurred during processing",
            "error": error_message,
            "processing_time": self.tracker.get_processing_time(job_id),
            "timestamp": datetime.now().isoformat()
        }, 500
    
    def get_processing_stats(self) -> Dict[str, Any]:
        """Get processing statistics"""
        return self.tracker.get_stats()
    
    def health_check(self) -> Dict[str, Any]:
        """Service health check"""
        try:
            # Check OpenAI processor health
            openai_healthy = hasattr(self.openai_processor, 'client') and self.openai_processor.client is not None
            
            # Check result manager health
            result_manager_healthy = hasattr(self.result_manager, 'firestore_client') and self.result_manager.firestore_client is not None
            
            # Overall health
            healthy = openai_healthy and result_manager_healthy
            
            return {
                "status": "healthy" if healthy else "degraded",
                "components": {
                    "openai_processor": "healthy" if openai_healthy else "error",
                    "result_manager": "healthy" if result_manager_healthy else "error",
                    "tracker": "healthy"
                },
                "service": "invoice-processing-service",
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            self.logger.error(f"Health check failed: {e}")
            return {
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
    
    def process_invoice_orchestrated(self, job_id: str, bucket_path: str, user_context: Dict[str, Any], source: str = 'orchestrated_processing') -> Tuple[Dict[str, Any], int]:
        """
        Process invoice using the orchestrated pipeline (proper line items queue management)
        Routes through pipeline-orchestrator for 3-phase processing with line items handling
        
        Args:
            job_id: Unique job identifier
            bucket_path: GCS path to the invoice file
            user_context: User context including email, UID, and organization info
            source: Source of the task (for tracking)
        
        Returns:
            Tuple of (response_dict, status_code)
        """
        try:
            # Import orchestrator integration
            import requests
            import base64
            from google.cloud import storage
            
            user_email = user_context['email']
            user_uid = user_context['uid']
            
            self.logger.info(f"🎼 Starting orchestrated processing for job: {job_id}")
            self.logger.info(f"👤 User: {user_email} ({user_uid[:8]})")
            
            # Download file from user bucket (same pattern as functional processing)
            storage_client = storage.Client()
            
            # Parse bucket and file path
            if '/' not in bucket_path:
                raise ValueError(f"Invalid bucket_path format: {bucket_path}")
                
            bucket_name = bucket_path.split('/')[0]
            file_path = '/'.join(bucket_path.split('/')[1:])
            
            # Download file
            bucket = storage_client.bucket(bucket_name)
            blob = bucket.blob(file_path)
            
            if not blob.exists():
                raise ValueError(f"File not found: {bucket_path}")
                
            file_content = blob.download_as_bytes()
            
            # Encode as base64 for orchestrator
            image_base64 = base64.b64encode(file_content).decode('utf-8')
            
            self.logger.info(f"📁 Downloaded {len(file_content)} bytes from {bucket_path}")
            
            # Call pipeline orchestrator
            orchestrator_url = "https://pipeline-orchestrator-812016027146.asia-south1.run.app"
            
            payload = {
                'image_data': image_base64,
                'job_id': job_id,
                'user_context': user_context
            }
            
            self.logger.info(f"🚀 Calling orchestrator for 3-phase processing...")
            
            response = requests.post(
                f"{orchestrator_url}/process-invoice",
                json=payload,
                timeout=600  # 10 minutes for complete pipeline
            )
            
            if not response.ok:
                error_msg = f"Orchestrator failed: {response.status_code} - {response.text}"
                self.logger.error(f"❌ {error_msg}")
                
                # Store error result
                error_result = {
                    'job_id': job_id,
                    'status': 'error',
                    'error_message': error_msg,
                    'processing_mode': 'orchestrated_pipeline',
                    'timestamp': datetime.now().isoformat(),
                    'source': source
                }
                
                self.result_manager.store_result(error_result, user_context)
                
                return {
                    "status": "error", 
                    "message": error_msg,
                    "job_id": job_id
                }, 500
            
            orchestrator_result = response.json()
            
            if orchestrator_result.get('status') != 'SUCCESS':
                error_msg = f"Orchestrator processing failed: {orchestrator_result.get('error', 'Unknown error')}"
                self.logger.error(f"❌ {error_msg}")
                
                error_result = {
                    'job_id': job_id,
                    'status': 'error',
                    'error_message': error_msg,
                    'processing_mode': 'orchestrated_pipeline',
                    'timestamp': datetime.now().isoformat(),
                    'source': source
                }
                
                self.result_manager.store_result(error_result, user_context)
                
                return {
                    "status": "error", 
                    "message": error_msg,
                    "job_id": job_id
                }, 500
            
            # Extract results and store in Firestore format
            final_result = orchestrator_result.get('final_result', {})
            pipeline_stats = orchestrator_result.get('pipeline_stats', {})
            
            # Format result for Firestore storage (compatible with frontend expectations)
            processed_result = {
                'job_id': job_id,
                'filename': file_path.split('/')[-1],
                'status': 'completed',
                'processing_mode': 'orchestrated_pipeline',
                'timestamp': datetime.now().isoformat(),
                'source': source,
                
                # Raw data from orchestrator
                'orchestrator_result': final_result,
                'pipeline_statistics': pipeline_stats,
                
                # Extract key data for frontend compatibility
                'tabulation_summary': final_result.get('tabulation_summary', {}),
                'invoice_header': final_result.get('invoice_header', {}),
                'enriched_line_items': final_result.get('enriched_line_items', []),
                'tabulated_totals': final_result.get('tabulated_totals', {}),
                
                # For CSV export compatibility
                'tabulated_results': final_result,
                
                # User context
                'userUID': user_uid,
                'userEmail': user_email
            }
            
            # Store results using existing result manager
            self.result_manager.store_result(processed_result, user_context)
            
            self.logger.info(f"✅ Orchestrated processing completed successfully for job: {job_id}")
            self.logger.info(f"📊 Pipeline stats: {pipeline_stats.get('total_duration_seconds', 'N/A')}s total")
            
            return {
                "status": "success",
                "message": f"Orchestrated processing completed for job {job_id}",
                "job_id": job_id,
                "processing_mode": "orchestrated_pipeline",
                "result_summary": {
                    "line_items_processed": len(processed_result.get('enriched_line_items', [])),
                    "total_amount": processed_result.get('tabulated_totals', {}).get('total_amount', 0),
                    "processing_time": pipeline_stats.get('total_duration_seconds', 0)
                }
            }, 200
            
        except Exception as e:
            self.logger.error(f"❌ Orchestrated processing failed for job {job_id}: {e}")
            
            # Store error result
            error_result = {
                'job_id': job_id,
                'status': 'error',
                'error_message': str(e),
                'processing_mode': 'orchestrated_pipeline',
                'timestamp': datetime.now().isoformat(),
                'source': source
            }
            
            try:
                self.result_manager.store_result(error_result, user_context)
            except Exception as store_error:
                self.logger.error(f"❌ Failed to store error result: {store_error}")
            
            return {
                "status": "error", 
                "message": f"Orchestrated processing failed: {str(e)}",
                "job_id": job_id
            }, 500
    
    def process_invoice_functional(self, job_id: str, bucket_path: str, user_context: Dict[str, Any], source: str = 'cloud_tasks_functional') -> Tuple[Dict[str, Any], int]:
        """
        Process invoice using functional microservices while maintaining user isolation
        
        Args:
            job_id: Unique job identifier
            bucket_path: GCS path to the invoice file  
            user_context: User context including email, UID, and organization info
            source: Source of the task (for tracking)
        
        Returns:
            Tuple of (response_dict, status_code)
        """
        try:
            # Import functional processing manager
            from functional_processing_manager import FunctionalProcessingManager
            
            # Initialize functional processor
            functional_processor = FunctionalProcessingManager()
            
            self.logger.info(f"🚀 Starting functional processing for job: {job_id}")
            
            # Process using functional services
            result = functional_processor.process_invoice_functional(
                job_id=job_id,
                bucket_path=bucket_path,
                user_context=user_context,
                source=source
            )
            
            return {
                "status": "success",
                "job_id": job_id,
                "message": "Invoice processed successfully using functional services",
                "results": result,
                "processing_mode": "functional_services",
                "timestamp": datetime.now().isoformat()
            }, 200
            
        except Exception as e:
            self.logger.error(f"❌ Functional processing failed for job {job_id}: {e}")
            
            # Store error in Firestore for frontend display
            error_result = {
                "job_id": job_id,
                "status": "error",
                "error_message": str(e),
                "processing_mode": "functional_services",
                "timestamp": datetime.now().isoformat()
            }
            
            try:
                self.result_manager.store_result(error_result, user_context)
            except Exception as store_error:
                self.logger.error(f"❌ Failed to store error result: {store_error}")
            
            return {
                "status": "error", 
                "job_id": job_id,
                "error": str(e),
                "processing_mode": "functional_services",
                "timestamp": datetime.now().isoformat()
            }, 500