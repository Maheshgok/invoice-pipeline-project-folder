"""
New 3-Agent Invoice Processing System with Token Management and Continuity
Agent 1: Data Analyst (Extraction) -> Agent 2: Accountant (Journal Entries) -> Agent 3: Data Engineer (Format)
"""

import json
import logging
from typing import Dict, Any, Optional, Tuple, List
from openai import OpenAI
from google.cloud import secretmanager
import os
import tiktoken
import time

from prompts.agent1_data_analyst_extraction import AGENT1_DATA_ANALYST_PROMPT, EXTRACTION_CHECKLIST
from prompts.agent2_accountant_journal import AGENT2_ACCOUNTANT_PROMPT, STANDARD_ACCOUNT_CODES  
from prompts.agent3_data_engineer_format import AGENT3_DATA_ENGINEER_PROMPT, OUTPUT_SCHEMA

logger = logging.getLogger(__name__)

class ThreeAgentInvoiceProcessor:
    def __init__(self):
        # Initialize separate OpenAI clients for each agent
        self.clients = self._initialize_agent_clients()
        
        # Token management
        self.encoding = tiktoken.encoding_for_model("gpt-4o")
        self.max_input_tokens = 8000  # Conservative limit for input
        self.max_output_tokens = 4000  # Response limit per agent
        self.token_buffer = 500  # Safety buffer
        self.continuity_retry_limit = 3  # Max retries for continuity
        
        # Agent-specific token limits and configurations
        self.agent_limits = {
            'agent1': {'input': 6000, 'output': 3000, 'key': 'AGENT1_OPENAI_KEY'},  # Data extraction
            'agent2': {'input': 4000, 'output': 3000, 'key': 'AGENT2_OPENAI_KEY'},  # Journal entries 
            'agent3': {'input': 4000, 'output': 2000, 'key': 'AGENT3_OPENAI_KEY'}   # Format conversion
        }
        
    def _initialize_agent_clients(self) -> Dict[str, OpenAI]:
        """Initialize separate OpenAI clients for each agent with specific API keys"""
        try:
            project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
            secret_client = secretmanager.SecretManagerServiceClient()
            
            clients = {}
            
            # Agent 1: Data Analyst - Use specific DataAnalyst1 key
            agent1_key = "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"
            clients['agent1'] = OpenAI(
                api_key=agent1_key,
                base_url="https://api.openai.com/v1",
                timeout=300.0,
                max_retries=3
            )
            logger.info(f"✅ Agent 1 (Data Analyst) using dedicated DataAnalyst1 API key")
            
            # Agent 2: Accountant - Use current/existing key from Secret Manager  
            try:
                main_secret = os.getenv('OPENAI_API_KEY_SECRET', 'openai-api-key-secret')
                secret_path = f"projects/{project_id}/secrets/{main_secret}/versions/latest"
                response = secret_client.access_secret_version(request={"name": secret_path})
                agent2_key = response.payload.data.decode('UTF-8').strip()
                logger.info(f"✅ Agent 2 (Accountant) using current OpenAI key from Secret Manager")
            except Exception as e:
                logger.error(f"❌ Failed to get current key for Agent 2: {e}")
                raise
            
            clients['agent2'] = OpenAI(
                api_key=agent2_key,
                base_url="https://api.openai.com/v1",
                timeout=300.0,
                max_retries=3
            )
            
            # Agent 3: Data Engineer - Use specific DataAnalyst2 key
            agent3_key = "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"
            clients['agent3'] = OpenAI(
                api_key=agent3_key,
                base_url="https://api.openai.com/v1",
                timeout=300.0,
                max_retries=3
            )
            logger.info(f"✅ Agent 3 (Data Engineer) using dedicated DataAnalyst2 API key")
            
            logger.info(f"🔑 Initialized {len(clients)} OpenAI clients for 3-agent system")
            logger.info(f"🔑 Key Distribution: Agent1=DataAnalyst1, Agent2=Current, Agent3=DataAnalyst2")
            return clients
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize agent clients: {str(e)}")
            raise
    
    def _count_tokens(self, text: str) -> int:
        """Count tokens in text using tiktoken"""
        try:
            return len(self.encoding.encode(text))
        except Exception:
            return len(text) // 4  # Fallback approximation
    
    def _truncate_for_continuity(self, text: str, max_tokens: int) -> Tuple[str, bool]:
        """Truncate text to fit token limits while preserving JSON structure"""
        try:
            if self._count_tokens(text) <= max_tokens:
                return text, False
                
            # Try to find natural truncation points
            lines = text.split('\n')
            truncated_lines = []
            current_tokens = 0
            
            for line in lines:
                line_tokens = self._count_tokens(line)
                if current_tokens + line_tokens > max_tokens - 100:  # Buffer for continuation
                    break
                truncated_lines.append(line)
                current_tokens += line_tokens
            
            truncated_text = '\n'.join(truncated_lines)
            
            # Try to close JSON properly if needed
            if '{' in truncated_text and truncated_text.count('{') > truncated_text.count('}'):
                truncated_text += '\n}'  # Close JSON
                
            return truncated_text, True
            
        except Exception as e:
            logger.error(f"Error in truncation: {str(e)}")
            return text[:max_tokens * 3], True  # Rough character-based fallback
    
    def _repair_json(self, json_text: str) -> str:
        """Repair malformed JSON from truncated responses"""
        try:
            # Common repairs for truncated JSON
            if json_text.strip().endswith(','):
                json_text = json_text.strip()[:-1]  # Remove trailing comma
            
            # Count braces and brackets
            open_braces = json_text.count('{') - json_text.count('}')
            open_brackets = json_text.count('[') - json_text.count(']')
            
            # Close unclosed structures
            json_text += '}' * open_braces
            json_text += ']' * open_brackets
            
            # Fix unterminated strings (common issue)
            if json_text.count('"') % 2 == 1:
                json_text += '"'
            
            return json_text
            
        except Exception:
            return json_text
    
    def _call_agent_with_continuity(self, agent_id: str, prompt: str, content: str, context: str = "") -> Dict[str, Any]:
        """Call an agent with token management and continuity support using dedicated client"""
        agent_limit = self.agent_limits[agent_id]
        agent_client = self.clients[agent_id]  # Use dedicated client for this agent
        full_prompt = f"{prompt}\n\n{context}\n\nDATA TO PROCESS:\n{content}"
        
        # Check input token limit
        input_tokens = self._count_tokens(full_prompt)
        if input_tokens > agent_limit['input']:
            logger.warning(f"⚠️ {agent_id} input tokens ({input_tokens}) exceed limit ({agent_limit['input']})")
            # Truncate content while preserving prompt
            available_tokens = agent_limit['input'] - self._count_tokens(f"{prompt}\n\n{context}\n\nDATA TO PROCESS:\n")
            truncated_content, was_truncated = self._truncate_for_continuity(content, available_tokens)
            full_prompt = f"{prompt}\n\n{context}\n\nDATA TO PROCESS:\n{truncated_content}"
            
            if was_truncated:
                logger.info(f"📏 {agent_id} input truncated to fit token limit")
        
        # Call OpenAI with retry mechanism using agent's dedicated client
        for attempt in range(self.continuity_retry_limit):
            try:
                logger.info(f"🤖 Calling {agent_id} (attempt {attempt + 1}) with dedicated API key")
                
                response = agent_client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": full_prompt}
                    ],
                    max_tokens=agent_limit['output'],
                    temperature=0.1
                )
                
                result_text = response.choices[0].message.content.strip()
                
                # Check if response was truncated
                if response.choices[0].finish_reason == 'length':
                    logger.warning(f"⚠️ {agent_id} response truncated due to token limit")
                    # Attempt to repair JSON
                    result_text = self._repair_json(result_text)
                
                # Try to parse as JSON
                try:
                    result = json.loads(result_text)
                    logger.info(f"✅ {agent_id} completed successfully")
                    return {
                        'success': True,
                        'data': result,
                        'agent': agent_id,
                        'tokens_used': response.usage.total_tokens,
                        'truncated': response.choices[0].finish_reason == 'length',
                        'api_key_used': f"{agent_id}_specific_key"
                    }
                    
                except json.JSONDecodeError as e:
                    logger.error(f"❌ {agent_id} JSON parse error: {str(e)}")
                    if attempt < self.continuity_retry_limit - 1:
                        logger.info(f"🔄 Retrying {agent_id} with JSON repair...")
                        result_text = self._repair_json(result_text)
                        try:
                            result = json.loads(result_text)
                            return {
                                'success': True,
                                'data': result,
                                'agent': agent_id,
                                'tokens_used': response.usage.total_tokens,
                                'repaired': True,
                                'api_key_used': f"{agent_id}_specific_key"
                            }
                        except json.JSONDecodeError:
                            continue
                    else:
                        # Last attempt - return raw text for manual handling
                        return {
                            'success': False,
                            'error': f"JSON parse failed after {self.continuity_retry_limit} attempts",
                            'raw_response': result_text,
                            'agent': agent_id,
                            'api_key_used': f"{agent_id}_specific_key"
                        }
                        
            except Exception as e:
                logger.error(f"❌ {agent_id} API call failed: {str(e)}")
                if attempt < self.continuity_retry_limit - 1:
                    time.sleep(2 ** attempt)  # Exponential backoff
                    continue
                else:
                    return {
                        'success': False,
                        'error': str(e),
                        'agent': agent_id,
                        'api_key_used': f"{agent_id}_specific_key"
                    }
        
        # Should not reach here
        return {'success': False, 'error': 'Unexpected failure', 'agent': agent_id}
    
    def _safe_fail_exit(self, failures: List[Dict]) -> Dict[str, Any]:
        """Generate safe fail response when all continuity attempts fail"""
        logger.error("🚨 Safe fail exit triggered - all agents failed")
        
        return {
            'status': 'SAFE_FAIL',
            'message': 'Invoice processing failed after all retry attempts',
            'partial_results': [f for f in failures if f.get('data')],
            'error_summary': {
                'failed_agents': [f['agent'] for f in failures if not f['success']],
                'last_errors': [f.get('error', 'Unknown') for f in failures if not f['success']]
            },
            'recommended_action': 'Manual review required - check token limits and prompt complexity'
        }
    
    def process_invoice(self, image_content: str, invoice_metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Process invoice through 3-agent pipeline with continuity management"""
        try:
            logger.info("🚀 Starting 3-Agent Invoice Processing Pipeline")
            pipeline_results = []
            
            # AGENT 1: Data Analyst - Extract all visible data
            logger.info("📊 Phase 1: Data Analyst - Extracting raw data")
            checklist_context = "EXTRACTION CHECKLIST:\n" + "\n".join([f"- {item}" for item in EXTRACTION_CHECKLIST])
            
            agent1_result = self._call_agent_with_continuity(
                'agent1', 
                AGENT1_DATA_ANALYST_PROMPT,
                image_content,
                checklist_context
            )
            pipeline_results.append(agent1_result)
            
            if not agent1_result['success']:
                logger.error("❌ Agent 1 (Data Analyst) failed")
                return self._safe_fail_exit(pipeline_results)
            
            # AGENT 2: Accountant - Create journal entries
            logger.info("💰 Phase 2: Accountant - Creating journal entries")
            extracted_data = json.dumps(agent1_result['data'], indent=2)
            account_context = "STANDARD ACCOUNT CODES:\n" + "\n".join([f"- {k}: {v}" for k, v in STANDARD_ACCOUNT_CODES.items()])
            
            agent2_result = self._call_agent_with_continuity(
                'agent2',
                AGENT2_ACCOUNTANT_PROMPT, 
                extracted_data,
                account_context
            )
            pipeline_results.append(agent2_result)
            
            if not agent2_result['success']:
                logger.error("❌ Agent 2 (Accountant) failed")
                return self._safe_fail_exit(pipeline_results)
            
            # AGENT 3: Data Engineer - Format conversion
            logger.info("🔧 Phase 3: Data Engineer - Converting to final format")
            journal_data = json.dumps(agent2_result['data'], indent=2)
            schema_context = "OUTPUT SCHEMA:\n" + json.dumps(OUTPUT_SCHEMA, indent=2)
            
            agent3_result = self._call_agent_with_continuity(
                'agent3',
                AGENT3_DATA_ENGINEER_PROMPT,
                journal_data, 
                schema_context
            )
            pipeline_results.append(agent3_result)
            
            if not agent3_result['success']:
                logger.error("❌ Agent 3 (Data Engineer) failed") 
                return self._safe_fail_exit(pipeline_results)
            
            # Success - compile final result
            logger.info("✅ 3-Agent Pipeline completed successfully")
            
            return {
                'status': 'SUCCESS',
                'final_result': agent3_result['data'],
                'pipeline_stats': {
                    'total_agents': 3,
                    'successful_agents': 3,
                    'total_tokens': sum(r.get('tokens_used', 0) for r in pipeline_results),
                    'agents_truncated': [r['agent'] for r in pipeline_results if r.get('truncated')],
                    'agents_repaired': [r['agent'] for r in pipeline_results if r.get('repaired')]
                },
                'intermediate_results': {
                    'extracted_data': agent1_result['data'],
                    'journal_entries': agent2_result['data'], 
                    'formatted_output': agent3_result['data']
                }
            }
            
        except Exception as e:
            logger.error(f"🚨 Critical error in 3-agent pipeline: {str(e)}")
            return {
                'status': 'CRITICAL_FAIL',
                'error': str(e),
                'message': 'Critical system failure - immediate attention required'
            }