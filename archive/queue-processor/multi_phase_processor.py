"""
Multi-Phase OpenAI Invoice Processor with GST Taxonomy Integration
Processes invoices in three distinct phases for maximum accuracy with official GST classification
"""

import json
import logging
from typing import Dict, Any, Optional, Tuple
from openai import OpenAI
from google.cloud import secretmanager
import os
import tiktoken

from prompts.phase1_data_extraction import PHASE1_DATA_EXTRACTION_PROMPT
from prompts.phase2_data_enrichment import PHASE2_DATA_ENRICHMENT_PROMPT  
from prompts.phase3_json_conversion import PHASE3_JSON_CONVERSION_PROMPT, ACCOUNT_CODE_ENABLED
from gst_taxonomy_helper import GSTTaxonomyHelper

logger = logging.getLogger(__name__)

class MultiPhaseInvoiceProcessor:
    def __init__(self):
        self.client = self._initialize_openai_client()
        # Token management
        self.encoding = tiktoken.encoding_for_model("gpt-4o")
        self.max_tokens = 4000  # Response limit
        self.token_buffer = 500  # Safety buffer
        self.use_optimized_prompts = True  # Toggle for optimization
        
    def _initialize_openai_client(self) -> OpenAI:
        """Initialize OpenAI client with API key from Secret Manager"""
        try:
            project_id = os.getenv('PROJECT_ID', 'watch-mail-trial')
            secret_name = os.getenv('OPENAI_API_KEY_SECRET', 'openai-api-key-secret')
            
            # Get API key from Secret Manager
            secret_client = secretmanager.SecretManagerServiceClient()
            secret_path = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
            
            response = secret_client.access_secret_version(request={"name": secret_path})
            api_key = response.payload.data.decode('UTF-8').strip()
            
            logger.info(f"✅ Retrieved OpenAI API key from Secret Manager: {secret_name}")
            
            return OpenAI(
                api_key=api_key,
                base_url="https://api.openai.com/v1",
                timeout=300.0,
                max_retries=5
            )
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize OpenAI client: {str(e)}")
            raise
    
    def process_invoice_multi_phase(self, image_data: bytes, image_name: str, client_organization_context: Optional[str] = None, client_organization_id: Optional[str] = None) -> Dict[str, Any]:
        """Process invoice through all three phases with client organization context"""
        try:
            logger.info(f"🚀 Starting multi-phase processing for: {image_name}")
            if client_organization_context:
                logger.info(f"🏢 Using client organization context for processing")
                logger.info(f"🏢 Client Organization ID: {client_organization_id}")
            
            # Phase 1: Data Extraction
            logger.info("📊 Phase 1: Extracting raw data from image...")
            phase1_result = self._phase1_extract_data(image_data)
            logger.info(f"✅ Phase 1 completed. Extracted {len(phase1_result.get('line_items', []))} items")
            
            # Phase 2: Data Enrichment with Client Organization Context
            logger.info("🔧 Phase 2: Enriching data with client business logic...")
            phase2_result = self._phase2_enrich_data(phase1_result, client_organization_context)
            logger.info("✅ Phase 2 completed. Data enriched with client-specific HSN codes and categories")
            
            # Phase 3: JSON Conversion
            logger.info("📋 Phase 3: Converting to structured JSON...")
            phase3_result = self._phase3_convert_to_json(phase2_result, client_organization_context)
            logger.info("✅ Phase 3 completed. Final structured data ready")
            
            # Combine results with processing metadata
            final_result = {
                **phase3_result,
                'processing_metadata': {
                    'phases_completed': 3,
                    'phase1_items': len(phase1_result.get('line_items', [])),
                    'phase2_enrichments': len(phase2_result.get('enrichment_notes', [])),
                    'phase3_journal_entries': len(phase3_result.get('journal_entries', [])),
                    'processing_approach': 'multi_phase_v1',
                    'client_organization_id': client_organization_id,
                    'client_organization_context_used': bool(client_organization_context)
                }
            }
            
            logger.info(f"🎉 Multi-phase processing completed successfully for {image_name}")
            return final_result
            
        except Exception as e:
            logger.error(f"❌ Multi-phase processing failed for {image_name}: {str(e)}")
            raise
    
    def _phase1_extract_data(self, image_data: bytes) -> Dict[str, Any]:
        """Phase 1: Extract raw data from invoice image"""
        try:
            logger.info(f"🔍 PHASE 1/3: Starting data extraction from invoice image")
            logger.info(f"🔧 Using GPT-4o with OCR capabilities for raw data extraction")
            
            # Get optimized prompt if available
            prompt = self._get_optimized_prompt(1, PHASE1_DATA_EXTRACTION_PROMPT)
            prompt_tokens = self._count_tokens(prompt)
            logger.info(f"📊 Phase 1 prompt tokens: {prompt_tokens}")
            
            # Encode image for OpenAI
            import base64
            base64_image = base64.b64encode(image_data).decode('utf-8')
            
            # Adjust max_tokens based on prompt size
            response_tokens = min(self.max_tokens, 8000 - prompt_tokens - self.token_buffer)
            
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}
                            }
                        ]
                    }
                ],
                max_tokens=2000,
                temperature=0.1  # Low temperature for accurate extraction
            )
            
            result = response.choices[0].message.content.strip()
            logger.info(f"📊 Phase 1 raw response length: {len(result)} characters")
            # DEBUG: Print full Phase 1 OpenAI response
            logger.info(f"🤖 DEBUG - Phase 1 OpenAI Response: {result}")
            logger.info(f"✅ PHASE 1/3: Data extraction completed successfully")
            
            # Clean up the response to extract JSON (similar to _parse_openai_response)
            cleaned_result = result
            if '```json' in cleaned_result:
                cleaned_result = cleaned_result.split('```json')[1].split('```')[0]
            elif '```' in cleaned_result:
                cleaned_result = cleaned_result.split('```')[1]
            cleaned_result = cleaned_result.strip()
            
            # Attempt to parse JSON with error recovery
            try:
                return json.loads(cleaned_result)
            except json.JSONDecodeError as parse_error:
                logger.warning(f"⚠️ Phase 1 JSON parse failed, attempting repair: {str(parse_error)}")
                # Try to repair common JSON issues
                repaired_json = self._attempt_json_repair(cleaned_result, parse_error)
                return json.loads(repaired_json)
            
        except json.JSONDecodeError as e:
            logger.error(f"❌ Phase 1 JSON decode error: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"❌ Phase 1 processing error: {str(e)}")
            raise
    
    def _phase2_enrich_data(self, phase1_data: Dict[str, Any], client_organization_context: Optional[str] = None) -> Dict[str, Any]:
        """Phase 2: Enrich extracted data with GST taxonomy and client organization context"""
        try:
            logger.info(f"🔧 PHASE 2/3: Starting data enrichment with GST taxonomy integration")
            logger.info(f"📋 Client organization context: {'Available' if client_organization_context else 'Not available'}")
            # DEBUG: Print client organization context details
            if client_organization_context:
                logger.info(f"🏢 DEBUG - Client Organization Context: {client_organization_context}")
            else:
                logger.info(f"🏢 DEBUG - No client organization context provided")
            # Build enriched prompt with GST taxonomy and client organization context
            prompt_parts = [PHASE2_DATA_ENRICHMENT_PROMPT]
            
            # Add GST taxonomy guidance
            gst_taxonomy_section = """
GST TAXONOMY GUIDANCE FOR HSN CODE CLASSIFICATION:
Use India's official GST commodity classification system for accurate HSN code assignment:

MAJOR GST SECTIONS:
• Section I (Ch. 1-5): Animals & Animal Products → HSN prefix 01-05
• Section II (Ch. 6-14): Vegetables & Plant Products → HSN prefix 06-14
• Section IV (Ch. 16-24): Prepared Food & Beverages → HSN prefix 16-24
• Section V (Ch. 25-27): Minerals & Fuels → HSN prefix 25-27
• Section VI (Ch. 28-38): Chemicals & Pharmaceuticals → HSN prefix 28-38
• Section VII (Ch. 39-40): Plastics & Rubber → HSN prefix 39-40
• Section XI (Ch. 50-63): Textiles & Garments → HSN prefix 50-63
• Section XV (Ch. 72-83): Base Metals & Articles → HSN prefix 72-83
• Section XVI (Ch. 84-85): Machinery & Electrical Equipment → HSN prefix 84-85
• Section XVII (Ch. 86-89): Vehicles & Transport → HSN prefix 86-89
• Section XVIII (Ch. 90-92): Precision Instruments → HSN prefix 90-92
• Section XX (Ch. 94-96): Furniture & Miscellaneous → HSN prefix 94-96
• Chapter 99: Services → HSN prefix 99

COMMON HSN EXAMPLES:
• IT Services: 998313, Software: 998313, Hardware: 84713000
• Office Supplies: 48239090, Stationery: 96081000
• Food Items: 21069030, Beverages: 22011000
• Professional Services: 998721, Consulting: 998313
• Construction Materials: 25232900 (Cement), 72142000 (Steel)
• Medical Equipment: 90189099, Pharmaceuticals: 30041000
• Automotive: 87032300 (Vehicles), 87089900 (Parts)

Assign HSN codes based on the most specific commodity classification that matches the item description.
"""
            
            prompt_parts.append(gst_taxonomy_section)
            
            if client_organization_context:
                org_context_section = f"""
CLIENT ORGANIZATION CONTEXT FOR THIS INVOICE PROCESSING:
{client_organization_context}

Use this client organization context to make intelligent categorization decisions specific to their business type and industry. 
Consider their common HSN codes, expense categories, and capitalization thresholds when processing line items.
"""
                prompt_parts.append(org_context_section)
            
            # Use GST taxonomy helper to enhance line items
            enhanced_data = self._enhance_with_gst_taxonomy(phase1_data, client_organization_context)
            
            prompt_parts.append(f"\nINPUT DATA (Pre-enhanced with GST taxonomy):\n{json.dumps(enhanced_data, indent=2)}")
            prompt = '\n'.join(prompt_parts)
            
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=2000,
                temperature=0.3  # Slightly higher for enrichment logic
            )
            
            result = response.choices[0].message.content.strip()
            logger.info(f"🔧 Phase 2 enrichment response length: {len(result)} characters")
            # DEBUG: Print full Phase 2 OpenAI response
            logger.info(f"🤖 DEBUG - Phase 2 OpenAI Response: {result}")
            logger.info(f"✅ PHASE 2/3: Data enrichment completed successfully")
            
            # Clean up the response to extract JSON (similar to _parse_openai_response)
            cleaned_result = result
            if '```json' in cleaned_result:
                cleaned_result = cleaned_result.split('```json')[1].split('```')[0]
            elif '```' in cleaned_result:
                cleaned_result = cleaned_result.split('```')[1]
            cleaned_result = cleaned_result.strip()
            
            # Attempt to parse JSON with error recovery
            try:
                return json.loads(cleaned_result)
            except json.JSONDecodeError as parse_error:
                logger.warning(f"⚠️ Phase 2 JSON parse failed, attempting repair: {str(parse_error)}")
                # Try to repair common JSON issues
                repaired_json = self._attempt_json_repair(cleaned_result, parse_error)
                return json.loads(repaired_json)
            
        except json.JSONDecodeError as e:
            logger.error(f"❌ Phase 2 JSON decode error: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"❌ Phase 2 enrichment error: {str(e)}")
            raise
    
    def _enhance_with_gst_taxonomy(self, phase1_data: Dict[str, Any], client_organization_context: Optional[str] = None) -> Dict[str, Any]:
        """Pre-enhance data using GST taxonomy helper before AI enrichment"""
        enhanced_data = phase1_data.copy()
        
        try:
            # Extract business type from client organization context if available
            business_type = None
            if client_organization_context and 'business_type' in client_organization_context:
                # Try to extract business_type from context string
                import re
                match = re.search(r'"business_type":\s*"([^"]+)"', client_organization_context)
                if match:
                    business_type = match.group(1)
            
            # Enhance line items with GST taxonomy
            line_items = enhanced_data.get('line_items', [])
            for item in line_items:
                item_description = item.get('item_description', '') or item.get('description', '')
                
                if item_description:
                    # Get suggested HSN code using GST taxonomy
                    suggested_hsn = GSTTaxonomyHelper.get_hsn_code(item_description, business_type)
                    
                    # Only suggest if no HSN code exists or if existing seems generic
                    current_hsn = item.get('hsn_code', '')
                    if not current_hsn or current_hsn in ['', '0', 'N/A', '48239090']:
                        item['suggested_hsn_code'] = suggested_hsn
                        
                        # Add GST section info for context
                        section_info = GSTTaxonomyHelper.get_gst_section_info(suggested_hsn)
                        item['gst_section'] = section_info.get('section', 'Unknown')
                        item['gst_chapter'] = section_info.get('chapter', 0)
                    
                    # Get suggested expense category
                    current_hsn_for_category = current_hsn or suggested_hsn
                    suggested_category = GSTTaxonomyHelper.get_expense_category(current_hsn_for_category, business_type)
                    item['suggested_expense_category'] = suggested_category
            
            # Add taxonomy enhancement metadata
            enhanced_data['gst_taxonomy_enhancement'] = {
                'enhanced': True,
                'business_type_used': business_type,
                'items_enhanced': len([item for item in line_items if 'suggested_hsn_code' in item]),
                'enhancement_timestamp': '2026-01-02'  # Current date
            }
            
            logger.info(f"🔍 GST taxonomy enhancement: {enhanced_data['gst_taxonomy_enhancement']['items_enhanced']} items enhanced")
            
        except Exception as e:
            logger.warning(f"⚠️ GST taxonomy enhancement failed: {str(e)}")
            # Return original data if enhancement fails
            
        return enhanced_data
    
    def _phase3_convert_to_json(self, phase2_data: Dict[str, Any], client_organization_context: Optional[str] = None) -> Dict[str, Any]:
        """Phase 3: Convert to strict JSON schema for frontend with conditional account codes"""
        try:
            logger.info(f"📋 PHASE 3/3: Starting JSON schema conversion for frontend compliance")
            
            # Import the conditional check function
            from prompts.phase3_json_conversion import should_include_account_codes
            
            # Determine if account codes should be included
            include_account_codes = should_include_account_codes(client_organization_context)
            logger.info(f"💼 Account codes {'ENABLED' if include_account_codes else 'DISABLED'} for this processing")
            
            # Build prompt with conditional account code instructions
            prompt_parts = [PHASE3_JSON_CONVERSION_PROMPT]
            
            if include_account_codes:
                account_code_instructions = """
ACCOUNT CODE HANDLING (ENABLED):
- Include "account_code" field in journal entries
- Generate appropriate codes based on account types (Assets: 1xxx, Liabilities: 2xxx, Expenses: 5xxx-6xxx)
- Use logical account coding structure
"""
                prompt_parts.append(account_code_instructions)
            else:
                account_code_instructions = """
ACCOUNT CODE HANDLING (DISABLED):
- Do NOT include "account_code" field in journal entries
- Focus on account names and descriptions only
- Exclude account codes entirely from the schema
"""
                prompt_parts.append(account_code_instructions)
            
            prompt_parts.append(f"\nINPUT DATA:\n{json.dumps(phase2_data, indent=2)}")
            prompt = '\n'.join(prompt_parts)
            
            response = self.client.chat.completions.create(
                model="gpt-4o", 
                messages=[{"role": "user", "content": prompt}],
                max_tokens=3000,
                temperature=0.1  # Low temperature for strict schema compliance
            )
            
            result = response.choices[0].message.content.strip()
            logger.info(f"📋 Phase 3 conversion response length: {len(result)} characters")
            # DEBUG: Print full Phase 3 OpenAI response
            logger.info(f"🤖 DEBUG - Phase 3 OpenAI Response: {result}")
            logger.info(f"✅ PHASE 3/3: JSON schema conversion completed successfully")
            
            # Clean up the response to extract JSON (similar to _parse_openai_response)
            cleaned_result = result
            if '```json' in cleaned_result:
                cleaned_result = cleaned_result.split('```json')[1].split('```')[0]
            elif '```' in cleaned_result:
                cleaned_result = cleaned_result.split('```')[1]
            cleaned_result = cleaned_result.strip()
            
            # Attempt to parse JSON with error recovery
            try:
                return json.loads(cleaned_result)
            except json.JSONDecodeError as parse_error:
                logger.warning(f"⚠️ Phase 3 JSON parse failed, attempting repair: {str(parse_error)}")
                # Try to repair common JSON issues
                repaired_json = self._attempt_json_repair(cleaned_result, parse_error)
                return json.loads(repaired_json)
            
        except json.JSONDecodeError as e:
            logger.error(f"❌ Phase 3 JSON decode error: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"❌ Phase 3 conversion error: {str(e)}")
            raise

    def _attempt_json_repair(self, json_str: str, error: json.JSONDecodeError) -> str:
        """Attempt to repair common JSON formatting issues"""
        logger.info(f"🔧 Attempting to repair JSON at position {error.pos}")
        
        # Common fixes for malformed JSON
        repaired = json_str
        
        # 1. Fix unterminated strings by finding unmatched quotes
        if "Unterminated string" in str(error):
            lines = repaired.split('\n')
            error_line_idx = error.lineno - 1 if error.lineno <= len(lines) else len(lines) - 1
            
            # Try to close unterminated string on the error line
            if error_line_idx < len(lines):
                line = lines[error_line_idx]
                # Count quotes to find if we have an odd number
                quote_count = line.count('"')
                if quote_count % 2 == 1:  # Odd number of quotes means unterminated
                    # Add closing quote at the end of the line
                    lines[error_line_idx] = line.rstrip() + '"'
                    logger.info(f"🔧 Added closing quote to line {error.lineno}")
            
            # Also try to truncate at the error position if it's near the end
            if error.pos and error.pos > len(json_str) - 100:  # Near end of string
                repaired = json_str[:error.pos] + '"}]}'
                logger.info(f"🔧 Truncated and closed JSON structure at position {error.pos}")
            else:
                repaired = '\n'.join(lines)
        
        # 2. Fix missing closing brackets/braces
        if "Expecting" in str(error):
            # Try adding common closing patterns
            if repaired.count('{') > repaired.count('}'):
                repaired += '}'
                logger.info("🔧 Added missing closing brace")
            if repaired.count('[') > repaired.count(']'):
                repaired += ']'
                logger.info("🔧 Added missing closing bracket")
        
        # 3. Remove trailing commas
        repaired = repaired.replace(',}', '}').replace(',]', ']')
        
        logger.info(f"🔧 JSON repair completed, length: {len(repaired)}")
        return repaired

    def _count_tokens(self, text: str) -> int:
        """Count tokens in text using tiktoken"""
        try:
            return len(self.encoding.encode(text))
        except Exception as e:
            logger.warning(f"⚠️ Token counting failed: {e}")
            return len(text) // 3  # Rough estimate: ~3 chars per token

    def _truncate_response_if_needed(self, response: str, max_length: int) -> str:
        """Truncate response if it exceeds token limits, trying to preserve JSON structure"""
        if len(response) <= max_length:
            return response
            
        logger.warning(f"⚠️ Response too long ({len(response)} chars), truncating to {max_length}")
        
        # Try to find a good JSON truncation point
        truncated = response[:max_length]
        
        # Look for last complete JSON object/array element
        for ending in ['"}]}', '"}]', '"}', '}]', '}']:
            last_pos = truncated.rfind(ending)
            if last_pos > max_length * 0.8:  # Don't truncate too aggressively
                truncated = truncated[:last_pos + len(ending)]
                break
                
        logger.info(f"🔧 Truncated response to {len(truncated)} characters")
        return truncated

    def _get_optimized_prompt(self, phase: int, original_prompt: str) -> str:
        """Get optimized prompt if enabled, otherwise return original"""
        if not self.use_optimized_prompts:
            return original_prompt
            
        # Import optimized prompts dynamically
        try:
            if phase == 1:
                from prompts.phase1_data_extraction_optimized import PHASE1_DATA_EXTRACTION_PROMPT
                return PHASE1_DATA_EXTRACTION_PROMPT
            elif phase == 2:
                from prompts.phase2_data_enrichment_optimized import PHASE2_DATA_ENRICHMENT_PROMPT
                return PHASE2_DATA_ENRICHMENT_PROMPT  
            elif phase == 3:
                from prompts.phase3_json_conversion_optimized import PHASE3_JSON_CONVERSION_PROMPT
                return PHASE3_JSON_CONVERSION_PROMPT
        except ImportError:
            logger.warning(f"⚠️ Optimized prompt for phase {phase} not found, using original")
            
        return original_prompt

# Create global instance for use in main processor
multi_phase_processor = MultiPhaseInvoiceProcessor()