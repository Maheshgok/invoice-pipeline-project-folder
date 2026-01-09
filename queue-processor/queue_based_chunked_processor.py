"""
Queue-Based Chunked Invoice Processor
Processes line items in chunks of 4-or-less until queue is empty
"""

import json
import logging
from typing import Dict, Any, Optional, Tuple, List
from openai import OpenAI
from google.cloud import secretmanager
import os
import tiktoken
import time
import requests

from prompts.agent1_data_analyst_extraction import AGENT1_DATA_ANALYST_PROMPT, EXTRACTION_CHECKLIST
from prompts.agent2_accountant_journal import AGENT2_ACCOUNTANT_PROMPT, STANDARD_ACCOUNT_CODES  
from prompts.agent3_data_engineer_format import AGENT3_DATA_ENGINEER_PROMPT, OUTPUT_SCHEMA

logger = logging.getLogger(__name__)

class QueueBasedChunkedProcessor:
    def __init__(self):
        # Initialize separate OpenAI clients for each agent
        self.clients = self._initialize_agent_clients()
        
        # Token management
        self.encoding = tiktoken.encoding_for_model("gpt-4o")
        self.max_input_tokens = 8000  
        self.max_output_tokens = 4000  
        self.token_buffer = 500  
        self.continuity_retry_limit = 3
        
        # Queue processing configuration
        self.chunk_size = 4  # Process max 4 line items per chunk
        
        # Agent-specific token limits and configurations
        self.agent_limits = {
            'agent1a': {'input': 6000, 'output': 2000, 'purpose': 'header_extraction'},
            'agent1b': {'input': 6000, 'output': 3000, 'purpose': 'line_items_extraction'}, 
            'agent2': {'input': 4000, 'output': 3000, 'purpose': 'journal_chunk'},
            'agent3a': {'input': 3000, 'output': 2000, 'purpose': 'header_standardization'},
            'agent3b': {'input': 4000, 'output': 3000, 'purpose': 'journal_standardization'}
        }
        
        # Data combiner service URL
        self.data_combiner_url = os.getenv('DATA_COMBINER_URL', 'https://data-combiner-bhcetby62q-el.a.run.app')
        
    def _initialize_agent_clients(self) -> Dict[str, OpenAI]:
        """Initialize separate OpenAI clients with specific API keys"""
        try:
            project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
            secret_client = secretmanager.SecretManagerServiceClient()
            
            clients = {}
            
            # Agent 1: Data Analyst - Use DataAnalyst1 key
            agent1_key = "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"
            clients['agent1'] = OpenAI(api_key=agent1_key, base_url="https://api.openai.com/v1", timeout=300.0, max_retries=3)
            
            # Agent 2: Accountant - Use current Secret Manager key  
            main_secret = os.getenv('OPENAI_API_KEY_SECRET', 'openai-api-key-secret')
            secret_path = f"projects/{project_id}/secrets/{main_secret}/versions/latest"
            response = secret_client.access_secret_version(request={"name": secret_path})
            agent2_key = response.payload.data.decode('UTF-8').strip()
            clients['agent2'] = OpenAI(api_key=agent2_key, base_url="https://api.openai.com/v1", timeout=300.0, max_retries=3)
            
            # Agent 3: Data Engineer - Use DataAnalyst2 key
            agent3_key = "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"
            clients['agent3'] = OpenAI(api_key=agent3_key, base_url="https://api.openai.com/v1", timeout=300.0, max_retries=3)
            
            logger.info(f"🔑 Initialized {len(clients)} OpenAI clients for queue-based processing")
            return clients
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize agent clients: {str(e)}")
            raise
    
    def _count_tokens(self, text: str) -> int:
        """Count tokens in text using tiktoken"""
        try:
            return len(self.encoding.encode(text))
        except Exception:
            return len(text) // 4
    
    def _call_agent(self, agent_type: str, agent_id: str, prompt: str, content: str, context: str = "") -> Dict[str, Any]:
        """Call a specific agent with content"""
        agent_limit = self.agent_limits[agent_id]
        agent_client = self.clients[agent_type]
        full_prompt = f"{prompt}\n\n{context}\n\nDATA TO PROCESS:\n{content}"
        
        # Check input token limit
        input_tokens = self._count_tokens(full_prompt)
        if input_tokens > agent_limit['input']:
            logger.warning(f"⚠️ {agent_id} input tokens ({input_tokens}) exceed limit ({agent_limit['input']})")
            # Truncate if needed
            available_tokens = agent_limit['input'] - self._count_tokens(f"{prompt}\n\n{context}\n\nDATA TO PROCESS:\n")
            content = content[:available_tokens * 3]  # Rough truncation
        
        try:
            logger.info(f"🤖 Calling {agent_id} ({agent_limit['purpose']})")
            
            response = agent_client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "system", "content": full_prompt}],
                max_tokens=agent_limit['output'],
                temperature=0.1
            )
            
            result_text = response.choices[0].message.content.strip()
            
            # Try to parse as JSON
            try:
                result = json.loads(result_text)
                logger.info(f"✅ {agent_id} completed successfully")
                return {
                    'success': True,
                    'data': result,
                    'agent': agent_id,
                    'tokens_used': response.usage.total_tokens
                }
            except json.JSONDecodeError as e:
                logger.error(f"❌ {agent_id} JSON parse error: {str(e)}")
                return {
                    'success': False,
                    'error': f"JSON parse failed: {str(e)}",
                    'raw_response': result_text,
                    'agent': agent_id
                }
                
        except Exception as e:
            logger.error(f"❌ {agent_id} API call failed: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'agent': agent_id
            }
    
    def _chunk_line_items(self, line_items: List[Dict]) -> List[List[Dict]]:
        """Split line items into chunks of 4 or less"""
        chunks = []
        for i in range(0, len(line_items), self.chunk_size):
            chunk = line_items[i:i + self.chunk_size]
            chunks.append(chunk)
        return chunks
    
    def _combine_journal_chunks(self, job_id: str, journal_chunks: List[List[Dict]]) -> Dict[str, Any]:
        """Call data-combiner service to combine journal chunks"""
        try:
            payload = {
                'job_id': job_id,
                'journal_chunks': journal_chunks
            }
            
            response = requests.post(
                f"{self.data_combiner_url}/combine-journal-chunks",
                json=payload,
                timeout=30
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"❌ Data combiner failed: {response.status_code}")
                return None
                
        except Exception as e:
            logger.error(f"❌ Error calling data combiner: {str(e)}")
            return None
    
    def process_invoice(self, image_content: str, invoice_metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Process invoice through queue-based chunked pipeline"""
        try:
            job_id = invoice_metadata.get('filename', 'unknown')
            logger.info(f"🚀 Starting Queue-Based Chunked Processing for {job_id}")
            
            # STAGE 1A: Extract header data only
            logger.info("📊 Stage 1A: Extracting header data")
            header_prompt = f"{AGENT1_DATA_ANALYST_PROMPT}\n\nFOCUS: Extract ONLY header/document information (vendor, customer, dates, totals, etc.). DO NOT extract line items."
            
            agent1a_result = self._call_agent(
                'agent1', 'agent1a', 
                header_prompt, 
                image_content,
                "Extract header data only - no line items"
            )
            
            if not agent1a_result['success']:
                return {'status': 'FAILED', 'stage': '1A', 'error': agent1a_result['error']}
            
            # STAGE 1B: Extract line items only
            logger.info("📋 Stage 1B: Extracting line items")
            items_prompt = f"{AGENT1_DATA_ANALYST_PROMPT}\n\nFOCUS: Extract ONLY the line items table data. DO NOT extract header information."
            
            agent1b_result = self._call_agent(
                'agent1', 'agent1b',
                items_prompt,
                image_content, 
                "Extract line items only - no header data"
            )
            
            if not agent1b_result['success']:
                return {'status': 'FAILED', 'stage': '1B', 'error': agent1b_result['error']}
            
            # Get line items for chunking
            line_items = agent1b_result['data'].get('tabular_data', [])
            logger.info(f"📦 Found {len(line_items)} line items to process")
            
            # STAGE 2: Queue-based processing of line items
            logger.info(f"⚙️ Stage 2: Queue-based journal processing (chunks of {self.chunk_size})")
            chunks = self._chunk_line_items(line_items)
            logger.info(f"🔄 Processing {len(chunks)} chunks: {[len(chunk) for chunk in chunks]} items per chunk")
            
            journal_chunks = []
            for chunk_idx, chunk in enumerate(chunks):
                logger.info(f"🔄 Processing chunk {chunk_idx + 1}/{len(chunks)} ({len(chunk)} items)")
                
                chunk_data = json.dumps(chunk, indent=2)
                agent2_result = self._call_agent(
                    'agent2', 'agent2',
                    AGENT2_ACCOUNTANT_PROMPT,
                    chunk_data,
                    f"Process line items chunk {chunk_idx + 1} into journal entries"
                )
                
                if agent2_result['success']:
                    journal_entries = agent2_result['data'].get('journal_entries', [])
                    journal_chunks.append(journal_entries)
                    logger.info(f"✅ Chunk {chunk_idx + 1}: Generated {len(journal_entries)} journal entries")
                else:
                    logger.error(f"❌ Chunk {chunk_idx + 1} failed: {agent2_result['error']}")
                    return {'status': 'FAILED', 'stage': f'2-chunk-{chunk_idx + 1}', 'error': agent2_result['error']}
            
            # STAGE 2.5: Combine journal chunks via data-combiner service
            logger.info("🔗 Stage 2.5: Combining journal chunks")
            combined_result = self._combine_journal_chunks(job_id, journal_chunks)
            if not combined_result:
                return {'status': 'FAILED', 'stage': '2.5', 'error': 'Failed to combine journal chunks'}
            
            combined_journal_entries = combined_result['combined_journal_entries']
            logger.info(f"✅ Combined {len(combined_journal_entries)} total journal entries")
            
            # STAGE 3A: Standardize header
            logger.info("📝 Stage 3A: Standardizing header data")
            header_data = json.dumps(agent1a_result['data'], indent=2)
            agent3a_result = self._call_agent(
                'agent3', 'agent3a',
                AGENT3_DATA_ENGINEER_PROMPT,
                header_data,
                "Standardize header data nomenclature only"
            )
            
            if not agent3a_result['success']:
                return {'status': 'FAILED', 'stage': '3A', 'error': agent3a_result['error']}
            
            # STAGE 3B: Standardize journal entries  
            logger.info("📊 Stage 3B: Standardizing journal entries")
            journal_data = json.dumps({'journal_entries': combined_journal_entries}, indent=2)
            agent3b_result = self._call_agent(
                'agent3', 'agent3b', 
                AGENT3_DATA_ENGINEER_PROMPT,
                journal_data,
                "Standardize journal entries nomenclature only"
            )
            
            if not agent3b_result['success']:
                return {'status': 'FAILED', 'stage': '3B', 'error': agent3b_result['error']}
            
            # Success - compile final result
            logger.info("✅ Queue-Based Chunked Processing completed successfully")
            
            return {
                'status': 'SUCCESS',
                'final_result': {
                    'header_data': agent3a_result['data'],
                    'journal_entries': agent3b_result['data'].get('journal_entries', []),
                    'processing_metadata': combined_result['totals']
                },
                'pipeline_stats': {
                    'total_line_items': len(line_items),
                    'chunks_processed': len(chunks),
                    'total_journal_entries': len(combined_journal_entries),
                    'processing_stages': 5
                }
            }
            
        except Exception as e:
            logger.error(f"🚨 Critical error in queue-based pipeline: {str(e)}")
            return {
                'status': 'CRITICAL_FAIL',
                'error': str(e),
                'message': 'Critical system failure'
            }