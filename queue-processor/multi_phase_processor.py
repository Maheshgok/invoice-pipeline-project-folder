"""
Multi-Phase OpenAI Invoice Processor
Processes invoices in three distinct phases for maximum accuracy
"""

import json
import logging
from typing import Dict, Any, Optional, Tuple
from openai import OpenAI
from google.cloud import secretmanager
import os

from prompts.phase1_data_extraction import PHASE1_DATA_EXTRACTION_PROMPT
from prompts.phase2_data_enrichment import PHASE2_DATA_ENRICHMENT_PROMPT  
from prompts.phase3_json_conversion import PHASE3_JSON_CONVERSION_PROMPT

logger = logging.getLogger(__name__)

class MultiPhaseInvoiceProcessor:
    def __init__(self):
        self.client = self._initialize_openai_client()
        
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
    
    def process_invoice_multi_phase(self, image_data: bytes, image_name: str, organization_profile: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Process invoice through all three phases with organization context"""
        try:
            logger.info(f"🚀 Starting multi-phase processing for: {image_name}")
            if organization_profile:
                logger.info(f"🏢 Using organization profile: {organization_profile.get('name', 'Unknown')}")
            
            # Phase 1: Data Extraction
            logger.info("📊 Phase 1: Extracting raw data from image...")
            phase1_result = self._phase1_extract_data(image_data)
            logger.info(f"✅ Phase 1 completed. Extracted {len(phase1_result.get('line_items', []))} items")
            
            # Phase 2: Data Enrichment with Organization Context
            logger.info("🔧 Phase 2: Enriching data with business logic...")
            phase2_result = self._phase2_enrich_data(phase1_result, organization_profile)
            logger.info("✅ Phase 2 completed. Data enriched with HSN codes and categories")
            
            # Phase 3: JSON Conversion
            logger.info("📋 Phase 3: Converting to structured JSON...")
            phase3_result = self._phase3_convert_to_json(phase2_result)
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
                    'organization_used': organization_profile.get('name') if organization_profile else None
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
            # Encode image for OpenAI
            import base64
            base64_image = base64.b64encode(image_data).decode('utf-8')
            
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": PHASE1_DATA_EXTRACTION_PROMPT},
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
            
            return json.loads(result)
            
        except json.JSONDecodeError as e:
            logger.error(f"❌ Phase 1 JSON decode error: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"❌ Phase 1 processing error: {str(e)}")
            raise
    
    def _phase2_enrich_data(self, phase1_data: Dict[str, Any], organization_profile: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Phase 2: Enrich extracted data with business logic and organization context"""
        try:
            # Build enriched prompt with organization context
            prompt_parts = [PHASE2_DATA_ENRICHMENT_PROMPT]
            
            if organization_profile:
                org_context = f"""
ORGANIZATION PROFILE FOR THIS BATCH:
Organization Name: {organization_profile.get('name', 'Unknown')}
Business Type: {organization_profile.get('business_type', 'General')}
Industry: {organization_profile.get('industry', 'General')}
Business Description: {organization_profile.get('business_description', 'General business')}
GSTIN: {organization_profile.get('gstin', 'Not provided')}
Capitalization Threshold: ₹{organization_profile.get('capitalization_threshold', 50000)}
Common HSN Codes: {', '.join(organization_profile.get('common_hsn_codes', []))}
Expense Categories: {', '.join(organization_profile.get('expense_categories', []))}

Use this organization profile to make intelligent categorization decisions.
"""
                prompt_parts.append(org_context)
            
            prompt_parts.append(f"\nINPUT DATA:\n{json.dumps(phase1_data, indent=2)}")
            prompt = '\n'.join(prompt_parts)
            
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=2000,
                temperature=0.3  # Slightly higher for enrichment logic
            )
            
            result = response.choices[0].message.content.strip()
            logger.info(f"🔧 Phase 2 enrichment response length: {len(result)} characters")
            
            return json.loads(result)
            
        except json.JSONDecodeError as e:
            logger.error(f"❌ Phase 2 JSON decode error: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"❌ Phase 2 enrichment error: {str(e)}")
            raise
    
    def _phase3_convert_to_json(self, phase2_data: Dict[str, Any]) -> Dict[str, Any]:
        """Phase 3: Convert to strict JSON schema for frontend"""
        try:
            prompt = f"{PHASE3_JSON_CONVERSION_PROMPT}\n\nINPUT DATA:\n{json.dumps(phase2_data, indent=2)}"
            
            response = self.client.chat.completions.create(
                model="gpt-4o", 
                messages=[{"role": "user", "content": prompt}],
                max_tokens=3000,
                temperature=0.1  # Low temperature for strict schema compliance
            )
            
            result = response.choices[0].message.content.strip()
            logger.info(f"📋 Phase 3 conversion response length: {len(result)} characters")
            
            return json.loads(result)
            
        except json.JSONDecodeError as e:
            logger.error(f"❌ Phase 3 JSON decode error: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"❌ Phase 3 conversion error: {str(e)}")
            raise

# Create global instance for use in main processor
multi_phase_processor = MultiPhaseInvoiceProcessor()