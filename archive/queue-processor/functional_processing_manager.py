"""
Functional Processing Manager
Integrates new functional microservices with existing user-isolated infrastructure
Maintains compatibility with existing frontend listeners and data patterns
"""
import os
import logging
import json
import requests
from typing import Dict, Any, Optional
from datetime import datetime
from google.cloud import storage, firestore

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FunctionalProcessingManager:
    """
    Bridge between functional microservices and existing infrastructure
    Ensures user isolation, proper bucket management, and Firestore compatibility
    """
    
    def __init__(self):
        self.logger = logging.getLogger(self.__class__.__name__)
        
        # Initialize Google Cloud clients
        self.project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
        self.storage_client = storage.Client(project=self.project_id)
        self.firestore_client = firestore.Client(project=self.project_id)
        
        # Service URLs from environment
        self.extraction_service_url = os.getenv('EXTRACTION_SERVICE_URL', 'https://extraction-service-1064415048610.asia-south1.run.app')
        self.enrichment_service_url = os.getenv('ENRICHMENT_SERVICE_URL', 'https://enrichment-service-1064415048610.asia-south1.run.app')  
        self.analysis_service_url = os.getenv('ANALYSIS_SERVICE_URL', 'https://analysis-service-1064415048610.asia-south1.run.app')
        
        # Base bucket configuration
        self.base_bucket_name = os.environ.get('BASE_BUCKET_NAME', 'watch_mail_trial_invoice')
        
        self.logger.info("🚀 Functional Processing Manager initialized")
        self.logger.info(f"📊 Services: extraction={self.extraction_service_url}, enrichment={self.enrichment_service_url}, analysis={self.analysis_service_url}")

    def get_user_bucket_name(self, user_uid: str) -> str:
        """Generate user-specific bucket name matching existing pattern"""
        user_id_short = user_uid[:8].lower() if len(user_uid) >= 8 else user_uid.lower()
        return f"{self.base_bucket_name}_{user_id_short}"

    def download_file_from_user_bucket(self, bucket_path: str, user_context: Dict[str, Any]) -> bytes:
        """
        Download file from user's isolated bucket
        
        Args:
            bucket_path: Format like "bucket_name/file_path"
            user_context: User context for validation
            
        Returns:
            File content as bytes
        """
        try:
            # Parse bucket and file path
            if '/' not in bucket_path:
                raise ValueError(f"Invalid bucket_path format: {bucket_path}")
                
            bucket_name = bucket_path.split('/')[0]
            file_path = '/'.join(bucket_path.split('/')[1:])
            
            # Validate user has access to this bucket
            expected_bucket = self.get_user_bucket_name(user_context['uid'])
            if bucket_name != expected_bucket:
                raise ValueError(f"Access denied: bucket {bucket_name} not accessible by user {user_context['uid']}")
            
            # Download file
            bucket = self.storage_client.bucket(bucket_name)
            blob = bucket.blob(file_path)
            
            if not blob.exists():
                raise ValueError(f"File not found: {bucket_path}")
                
            content = blob.download_as_bytes()
            self.logger.info(f"📥 Downloaded {len(content)} bytes from {bucket_path}")
            return content
            
        except Exception as e:
            self.logger.error(f"❌ Failed to download from {bucket_path}: {e}")
            raise

    def call_functional_service(self, service_url: str, endpoint: str, data: Dict[str, Any], files: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Call a functional microservice with proper error handling
        
        Args:
            service_url: Base URL of the service
            endpoint: Endpoint path (e.g., '/extract')
            data: JSON data to send
            files: Optional files to upload
            
        Returns:
            Service response as dict
        """
        try:
            url = f"{service_url}{endpoint}"
            
            if files:
                # For file uploads
                response = requests.post(url, data=data, files=files, timeout=300)
            else:
                # For JSON requests
                response = requests.post(url, json=data, timeout=300)
            
            response.raise_for_status()
            result = response.json()
            
            self.logger.info(f"✅ Service call successful: {endpoint}")
            return result
            
        except requests.exceptions.Timeout:
            self.logger.error(f"⏰ Service timeout: {endpoint}")
            raise Exception(f"Service timeout calling {endpoint}")
        except requests.exceptions.RequestException as e:
            self.logger.error(f"🌐 Service request failed: {endpoint} - {e}")
            raise Exception(f"Service request failed: {str(e)}")
        except Exception as e:
            self.logger.error(f"❌ Service call error: {endpoint} - {e}")
            raise

    def store_results_in_firestore(self, result: Dict[str, Any], user_context: Dict[str, Any]) -> None:
        """
        Store results in user's Firestore collection (existing pattern)
        
        Args:
            result: Processing result to store
            user_context: User context for proper collection path
        """
        try:
            user_uid = user_context['uid']
            
            # Use existing user isolation pattern
            collection_path = f'users/{user_uid}/invoice_results'
            
            # Add user context for compatibility
            result.update({
                'userUID': user_uid,
                'userEmail': user_context['email'],
                'createdAt': firestore.SERVER_TIMESTAMP,
                'processing_mode': 'functional_services'
            })
            
            # Store in Firestore
            doc_ref = self.firestore_client.collection(collection_path).document(result['job_id'])
            doc_ref.set(result, merge=True)
            
            self.logger.info(f"💾 Results stored in Firestore: {collection_path}/{result['job_id']}")
            
        except Exception as e:
            self.logger.error(f"❌ Failed to store results in Firestore: {e}")
            raise

    def process_invoice_functional(self, job_id: str, bucket_path: str, user_context: Dict[str, Any], source: str = 'functional_processing') -> Dict[str, Any]:
        """
        Process invoice through functional microservices pipeline
        Maintains user isolation and stores results in expected Firestore format
        
        Args:
            job_id: Unique job identifier
            bucket_path: GCS path to invoice file  
            user_context: User context for isolation
            source: Processing source identifier
            
        Returns:
            Processing results dict
        """
        try:
            self.logger.info(f"🚀 Starting functional processing for job: {job_id}")
            self.logger.info(f"📁 Processing file: {bucket_path}")
            self.logger.info(f"👤 User: {user_context['email']} ({user_context['uid'][:8]})")
            
            # Step 1: Download file from user's bucket
            file_content = self.download_file_from_user_bucket(bucket_path, user_context)
            filename = bucket_path.split('/')[-1]
            
            # Prepare file for service calls
            files = {
                'file': (filename, file_content, 'application/octet-stream')
            }
            
            # Step 2: Extract data using extraction service
            self.logger.info(f"📊 Step 1: Extracting data...")
            extraction_result = self.call_functional_service(
                self.extraction_service_url,
                '/extract',
                {'job_id': job_id, 'filename': filename},
                files
            )
            
            extracted_data = extraction_result.get('extracted_data', {})
            self.logger.info(f"✅ Extraction complete: {len(extracted_data)} fields extracted")
            
            # Step 3: Enrich with GST taxonomy
            self.logger.info(f"🏷️ Step 2: Enriching with GST taxonomy...")
            enrichment_result = self.call_functional_service(
                self.enrichment_service_url,
                '/enrich',
                {
                    'job_id': job_id,
                    'extracted_data': extracted_data
                }
            )
            
            enriched_data = enrichment_result.get('enriched_data', extracted_data)
            self.logger.info(f"✅ Enrichment complete")
            
            # Step 4: Generate analysis and journal entries  
            self.logger.info(f"📝 Step 3: Generating analysis...")
            analysis_result = self.call_functional_service(
                self.analysis_service_url,
                '/analyze',
                {
                    'job_id': job_id,
                    'enriched_data': enriched_data
                }
            )
            
            analysis_data = analysis_result.get('analysis', {})
            self.logger.info(f"✅ Analysis complete")
            
            # Step 5: Generate tabulated results
            self.logger.info(f"📋 Step 4: Generating tabulated results...")
            tabulation_result = self.call_functional_service(
                self.analysis_service_url,
                '/tabulate',
                {
                    'job_id': job_id,
                    'analysis_data': analysis_data,
                    'enriched_data': enriched_data
                }
            )
            
            tabulated_data = tabulation_result.get('tabulated_data', {})
            self.logger.info(f"✅ Tabulation complete")
            
            # Compile final results in expected format
            final_result = {
                'job_id': job_id,
                'filename': filename,
                'status': 'completed',
                'processing_mode': 'functional_services',
                'timestamp': datetime.now().isoformat(),
                'source': source,
                
                # Raw extracted data
                'raw_extraction': extracted_data,
                
                # Enriched data  
                'enriched_data': enriched_data,
                
                # Analysis results
                'analysis': analysis_data,
                
                # Tabulated results (for CSV export compatibility)
                'tabulated_results': tabulated_data,
                
                # Processing metadata
                'processing_metadata': {
                    'extraction_service': self.extraction_service_url,
                    'enrichment_service': self.enrichment_service_url, 
                    'analysis_service': self.analysis_service_url,
                    'processed_at': datetime.now().isoformat(),
                    'file_size_bytes': len(file_content)
                }
            }
            
            # Store results in Firestore (triggers frontend listeners)
            self.store_results_in_firestore(final_result, user_context)
            
            self.logger.info(f"🎉 Functional processing completed successfully for job: {job_id}")
            return final_result
            
        except Exception as e:
            self.logger.error(f"❌ Functional processing failed for job {job_id}: {e}")
            
            # Store error result in Firestore
            error_result = {
                'job_id': job_id,
                'status': 'error',
                'error_message': str(e),
                'processing_mode': 'functional_services',
                'timestamp': datetime.now().isoformat(),
                'source': source
            }
            
            try:
                self.store_results_in_firestore(error_result, user_context)
            except Exception as store_error:
                self.logger.error(f"❌ Failed to store error result: {store_error}")
            
            raise Exception(f"Functional processing failed: {str(e)}")