"""
Queue Enrichment Processor Service - Phase 2 (Stages 2A + 2B + 2C + 2D)
Specialized Cloud Run service for data processing and standardization
Handles queuing, enrichment, and normalization tasks
"""

import os
import json
import logging
from flask import Flask, request, jsonify
from openai import OpenAI
from google.cloud import secretmanager
import tiktoken
import requests
from typing import List, Dict, Any

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

class QueueEnrichmentProcessor:
    def __init__(self):
        # Initialize OpenAI clients
        self.accountant_client = self._initialize_accountant_client()
        self.standardizer_client = self._initialize_standardizer_client()
        self.encoding = tiktoken.encoding_for_model("gpt-4o")
        
        # Processing configuration
        self.chunk_size = 4  # Process max 4 line items per chunk
        
        # Prompts for different stages
        self.accountant_prompt = """
You are an expert Indian accountant. Convert these line items into proper double-entry journal entries.

IMPORTANT REQUIREMENTS:
1. Use standard Indian account codes (Sales - 4000, CGST Payable - 2100, SGST Payable - 2200, etc.)
2. Ensure all debits equal credits (balanced entries)
3. Handle GST properly (CGST + SGST for intra-state, IGST for inter-state)
4. Create separate entries for each line item

Return JSON format:
{
  "journal_entries": [
    {
      "description": "Line item description",
      "entries": [
        {"account": "Account Name", "account_code": "4000", "debit": 0, "credit": 1000},
        {"account": "CGST Payable", "account_code": "2100", "debit": 0, "credit": 90}
      ]
    }
  ]
}
"""
        
        self.standardizer_prompt = """
You are a data standardization specialist. Standardize field names and structure according to Indian accounting standards.

STANDARDIZATION RULES:
1. Consistent field naming (snake_case)
2. Proper data types (numbers as numbers, not strings)
3. Standard account codes and names
4. Consistent date formats (YYYY-MM-DD)
5. Proper GST number formatting

Return JSON with standardized structure and nomenclature.
"""

    def _initialize_accountant_client(self) -> OpenAI:
        """Initialize OpenAI client for accountant tasks - uses current key"""
        try:
            project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
            secret_client = secretmanager.SecretManagerServiceClient()
            
            main_secret = os.getenv('OPENAI_API_KEY_SECRET', 'openai-api-key-secret')
            secret_path = f"projects/{project_id}/secrets/{main_secret}/versions/latest"
            response = secret_client.access_secret_version(request={"name": secret_path})
            api_key = response.payload.data.decode('UTF-8').strip()
            
            client = OpenAI(api_key=api_key, base_url="https://api.openai.com/v1", timeout=300.0, max_retries=3)
            
            logger.info("🔑 Accountant client initialized with current key")
            return client
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize accountant client: {str(e)}")
            raise

    def _initialize_standardizer_client(self) -> OpenAI:
        """Initialize OpenAI client for standardization - uses DataAnalyst2 key"""
        try:
            api_key = "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"
            
            client = OpenAI(api_key=api_key, base_url="https://api.openai.com/v1", timeout=300.0, max_retries=3)
            
            logger.info("🔑 Standardizer client initialized with DataAnalyst2 key")
            return client
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize standardizer client: {str(e)}")
            raise

    def _count_tokens(self, text: str) -> int:
        """Count tokens in text"""
        try:
            return len(self.encoding.encode(text))
        except Exception:
            return len(text) // 4

    def _chunk_line_items(self, line_items: List[Dict]) -> List[List[Dict]]:
        """Stage 2A: Create queue of line items (4 or less at a time)"""
        logger.info(f"📦 Stage 2A: Creating queue - {len(line_items)} items into chunks of {self.chunk_size}")
        
        chunks = []
        for i in range(0, len(line_items), self.chunk_size):
            chunk = line_items[i:i + self.chunk_size]
            chunks.append(chunk)
        
        logger.info(f"✅ Created {len(chunks)} chunks: {[len(chunk) for chunk in chunks]} items per chunk")
        return chunks

    def _enrich_chunk(self, chunk: List[Dict], chunk_idx: int) -> Dict[str, Any]:
        """Stage 2B: Accountant enrichment for chunk"""
        try:
            logger.info(f"💰 Stage 2B: Processing chunk {chunk_idx + 1} ({len(chunk)} items)")
            
            chunk_data = json.dumps(chunk, indent=2)
            full_prompt = f"{self.accountant_prompt}\n\nLINE ITEMS TO PROCESS:\n{chunk_data}"
            
            response = self.accountant_client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "system", "content": full_prompt}],
                max_tokens=3000,
                temperature=0.1
            )
            
            result_text = response.choices[0].message.content.strip()
            
            try:
                result = json.loads(result_text)
                journal_entries = result.get('journal_entries', [])
                logger.info(f"✅ Chunk {chunk_idx + 1}: Generated {len(journal_entries)} journal entries")
                
                return {
                    'success': True,
                    'journal_entries': journal_entries,
                    'tokens_used': response.usage.total_tokens,
                    'chunk_idx': chunk_idx
                }
            except json.JSONDecodeError as e:
                logger.error(f"❌ Chunk {chunk_idx + 1} JSON parse error: {str(e)}")
                return {
                    'success': False,
                    'error': f"JSON parse failed: {str(e)}",
                    'raw_response': result_text,
                    'chunk_idx': chunk_idx
                }
                
        except Exception as e:
            logger.error(f"❌ Chunk {chunk_idx + 1} enrichment failed: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'chunk_idx': chunk_idx
            }

    def _standardize_data(self, data: Dict[str, Any], data_type: str) -> Dict[str, Any]:
        """Stage 2C/2D: Standardize data structure and field names"""
        try:
            logger.info(f"📝 Stage 2C/2D: Standardizing {data_type}")
            
            data_json = json.dumps(data, indent=2)
            full_prompt = f"{self.standardizer_prompt}\n\nDATA TYPE: {data_type}\n\nDATA TO STANDARDIZE:\n{data_json}"
            
            response = self.standardizer_client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "system", "content": full_prompt}],
                max_tokens=2000,
                temperature=0.1
            )
            
            result_text = response.choices[0].message.content.strip()
            
            try:
                result = json.loads(result_text)
                logger.info(f"✅ {data_type} standardization completed")
                
                return {
                    'success': True,
                    'standardized_data': result,
                    'tokens_used': response.usage.total_tokens,
                    'data_type': data_type
                }
            except json.JSONDecodeError as e:
                logger.error(f"❌ {data_type} standardization JSON parse error: {str(e)}")
                return {
                    'success': False,
                    'error': f"JSON parse failed: {str(e)}",
                    'raw_response': result_text,
                    'data_type': data_type
                }
                
        except Exception as e:
            logger.error(f"❌ {data_type} standardization failed: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'data_type': data_type
            }

    def process_extracted_data(self, extracted_data: Dict[str, Any], job_id: str) -> Dict[str, Any]:
        """Process extracted data through all Stage 2 steps"""
        try:
            logger.info(f"🚀 Starting Stage 2 processing for job: {job_id}")
            
            header_data = extracted_data.get('header_data', {})
            line_items = extracted_data.get('line_items', [])
            
            # Stage 2A: Create queue of line items
            chunks = self._chunk_line_items(line_items)
            
            # Stage 2B: Process each chunk through accountant
            all_journal_entries = []
            for chunk_idx, chunk in enumerate(chunks):
                chunk_result = self._enrich_chunk(chunk, chunk_idx)
                
                if chunk_result['success']:
                    all_journal_entries.extend(chunk_result['journal_entries'])
                else:
                    return {
                        'status': 'FAILED',
                        'stage': f'2B-chunk-{chunk_idx + 1}',
                        'error': chunk_result['error'],
                        'job_id': job_id
                    }
            
            logger.info(f"💰 Stage 2B completed: {len(all_journal_entries)} total journal entries")
            
            # Stage 2C: Standardize journal entries
            journal_standardization = self._standardize_data(
                {'journal_entries': all_journal_entries}, 
                'journal_entries'
            )
            
            if not journal_standardization['success']:
                return {
                    'status': 'FAILED',
                    'stage': '2C',
                    'error': journal_standardization['error'],
                    'job_id': job_id
                }
            
            # Stage 2D: Standardize header data
            header_standardization = self._standardize_data(header_data, 'header_data')
            
            if not header_standardization['success']:
                return {
                    'status': 'FAILED',
                    'stage': '2D', 
                    'error': header_standardization['error'],
                    'job_id': job_id
                }
            
            # Success - return processed data
            processed_data = {
                'standardized_header': header_standardization['standardized_data'],
                'standardized_journal_entries': journal_standardization['standardized_data'].get('journal_entries', [])
            }
            
            logger.info(f"✅ Stage 2 processing completed for {job_id}")
            
            return {
                'status': 'SUCCESS',
                'job_id': job_id,
                'processed_data': processed_data,
                'processing_stats': {
                    'total_line_items': len(line_items),
                    'chunks_processed': len(chunks),
                    'journal_entries_generated': len(processed_data['standardized_journal_entries'])
                }
            }
            
        except Exception as e:
            logger.error(f"🚨 Critical error in Stage 2 processing: {str(e)}")
            return {
                'status': 'CRITICAL_FAIL',
                'job_id': job_id,
                'error': str(e)
            }

# Initialize service
processor_service = QueueEnrichmentProcessor()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'service': 'queue-enrichment-processor',
        'status': 'healthy',
        'version': '1.0.0',
        'capabilities': ['queuing', 'enrichment', 'standardization', 'normalization']
    })

@app.route('/process-extracted-data', methods=['POST'])
def process_extracted_data():
    """Main processing endpoint for Stages 2A + 2B + 2C + 2D"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'status': 'error',
                'error': 'No JSON data provided'
            }), 400
        
        extracted_data = data.get('extracted_data')
        job_id = data.get('job_id', 'unknown')
        
        if not extracted_data:
            return jsonify({
                'status': 'error', 
                'error': 'extracted_data is required'
            }), 400
        
        logger.info(f"📥 Processing Stage 2 request for job: {job_id}")
        
        # Process through service
        result = processor_service.process_extracted_data(extracted_data, job_id)
        
        if result['status'] == 'SUCCESS':
            return jsonify(result), 200
        else:
            return jsonify(result), 500
            
    except Exception as e:
        logger.error(f"🚨 Critical error in processing endpoint: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': 'Critical system failure',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(host='0.0.0.0', port=port, debug=False)