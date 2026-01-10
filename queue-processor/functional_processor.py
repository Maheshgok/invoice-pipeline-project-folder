"""
Functional Invoice Processor for Cloud Run
Uses optimized functional handlers for memory efficiency and fast processing
"""
import os
import time
import json
import base64
import logging
from datetime import datetime
from typing import Dict, Any, Tuple, Optional

# Import our optimized functional handlers
from functional_openai_handler import (
    create_extraction_function,
    create_enrichment_function, 
    create_analysis_function,
    ProcessingConfig,
    PhaseResult
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FunctionalProcessor:
    """
    Memory-efficient functional processor for Cloud Run deployment.
    Uses pure functions instead of class-based handlers for optimal performance.
    """
    
    def __init__(self):
        """Initialize functional processor with optimized configuration."""
        self.config = ProcessingConfig()
        logger.info("🚀 FunctionalProcessor initialized with optimized config")
    
    def process_invoice_complete_pipeline(self, job_id: str, image_data: str) -> Dict[str, Any]:
        """
        Complete 3-phase invoice processing pipeline using functional handlers.
        
        Args:
            job_id: Unique job identifier
            image_data: Base64 encoded image data
            
        Returns:
            Dict containing all processing results and performance stats
        """
        start_time = time.time()
        logger.info(f"🎯 Starting complete pipeline for job {job_id}")
        
        try:
            # Phase 1: Data Extraction
            phase1_start = time.time()
            extraction_func = create_extraction_function()
            logger.info("📋 Phase 1: Extracting invoice data...")
            
            extraction_result = extraction_func(image_data)
            phase1_time = time.time() - phase1_start
            
            if not extraction_result.success:
                raise Exception(f"Extraction failed: {extraction_result.error}")
            
            logger.info(f"✅ Phase 1 completed in {phase1_time:.2f}s, {extraction_result.tokens_used} tokens")
            
            # Phase 2: Data Enrichment
            phase2_start = time.time()
            enrichment_func = create_enrichment_function()
            logger.info("💡 Phase 2: Enriching with business intelligence...")
            
            enrichment_result = enrichment_func(extraction_result.content)
            phase2_time = time.time() - phase2_start
            
            if not enrichment_result.success:
                raise Exception(f"Enrichment failed: {enrichment_result.error}")
            
            logger.info(f"✅ Phase 2 completed in {phase2_time:.2f}s, {enrichment_result.tokens_used} tokens")
            
            # Phase 3: Final Analysis & Validation
            phase3_start = time.time()
            analysis_func = create_analysis_function()
            logger.info("🔍 Phase 3: Final validation and analysis...")
            
            combined_data = {
                "extracted_data": extraction_result.content,
                "enriched_data": enrichment_result.content
            }
            
            analysis_result = analysis_func(json.dumps(combined_data))
            phase3_time = time.time() - phase3_start
            
            if not analysis_result.success:
                raise Exception(f"Analysis failed: {analysis_result.error}")
            
            logger.info(f"✅ Phase 3 completed in {phase3_time:.2f}s, {analysis_result.tokens_used} tokens")
            
            # Create final tabulation
            final_tabulation = self._create_final_tabulation(
                extraction_result,
                enrichment_result,
                analysis_result
            )
            
            total_time = time.time() - start_time
            total_tokens = extraction_result.tokens_used + enrichment_result.tokens_used + analysis_result.tokens_used
            
            # Construct complete result
            result = {
                "job_id": job_id,
                "status": "COMPLETE",
                "processing_mode": "functional_handlers",
                "extracted_data": {
                    "success": extraction_result.success,
                    "content": extraction_result.content,
                    "tokens_used": extraction_result.tokens_used,
                    "processing_time": phase1_time
                },
                "enriched_data": {
                    "success": enrichment_result.success,
                    "content": enrichment_result.content,
                    "tokens_used": enrichment_result.tokens_used,
                    "processing_time": phase2_time
                },
                "analysis_data": {
                    "success": analysis_result.success,
                    "content": analysis_result.content,
                    "tokens_used": analysis_result.tokens_used,
                    "processing_time": phase3_time
                },
                "final_tabulation": final_tabulation,
                "performance_stats": {
                    "total_processing_time": total_time,
                    "total_tokens_used": total_tokens,
                    "tokens_per_second": total_tokens / total_time if total_time > 0 else 0,
                    "phase_breakdown": {
                        "extraction": {"time": phase1_time, "tokens": extraction_result.tokens_used},
                        "enrichment": {"time": phase2_time, "tokens": enrichment_result.tokens_used},
                        "analysis": {"time": phase3_time, "tokens": analysis_result.tokens_used}
                    }
                },
                "timestamp": datetime.now().isoformat()
            }
            
            logger.info(f"🎉 Complete pipeline finished in {total_time:.2f}s, {total_tokens} tokens")
            return result
            
        except Exception as e:
            logger.error(f"❌ Pipeline failed for job {job_id}: {e}", exc_info=True)
            return {
                "job_id": job_id,
                "status": "ERROR",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
    
    def _create_final_tabulation(self, extraction: PhaseResult, enrichment: PhaseResult, analysis: PhaseResult) -> Dict[str, Any]:
        """Create comprehensive tabulated summary of all processing phases."""
        try:
            # Try to parse JSON content
            extracted_json = self._safe_json_parse(extraction.content)
            enriched_json = self._safe_json_parse(enrichment.content)
            analysis_json = self._safe_json_parse(analysis.content)
            
            # Extract key information for tabulation
            invoice_header = {}
            line_items = []
            business_intelligence = {}
            
            # Process extraction data
            if extracted_json and isinstance(extracted_json, dict):
                invoice_data = extracted_json.get('invoice_data', extracted_json)
                if isinstance(invoice_data, dict):
                    invoice_header = {
                        'invoice_number': invoice_data.get('invoice_number'),
                        'vendor_name': invoice_data.get('vendor_name'),
                        'total_amount': invoice_data.get('total_amount'),
                        'date': invoice_data.get('invoice_date')
                    }
                    line_items = invoice_data.get('line_items', [])
            
            # Process enrichment data
            if enriched_json and isinstance(enriched_json, dict):
                enrichments = enriched_json.get('enrichments', enriched_json)
                if isinstance(enrichments, dict):
                    business_intelligence = {
                        'business_category': enrichments.get('business_category'),
                        'data_quality_score': enrichments.get('data_quality_score'),
                        'accounting_entries': enrichments.get('accounting_entries', [])
                    }
            
            return {
                "tabulation_summary": {
                    "document_type": "Invoice - Functionally Processed",
                    "processing_status": "Complete",
                    "processing_mode": "functional_handlers"
                },
                "invoice_header": invoice_header,
                "line_items_summary": {
                    "item_count": len(line_items) if isinstance(line_items, list) else 0,
                    "items": line_items[:5] if isinstance(line_items, list) else []  # First 5 items
                },
                "business_intelligence": business_intelligence,
                "validation_summary": {
                    "extraction_successful": extraction.success,
                    "enrichment_successful": enrichment.success,
                    "analysis_successful": analysis.success,
                    "overall_score": "High" if all([extraction.success, enrichment.success, analysis.success]) else "Medium"
                }
            }
            
        except Exception as e:
            logger.warning(f"⚠️ Tabulation creation failed: {e}")
            return {
                "tabulation_summary": {
                    "document_type": "Invoice - Functionally Processed",
                    "processing_status": "Complete with tabulation warning",
                    "warning": f"Tabulation failed: {e}"
                }
            }
    
    def _safe_json_parse(self, content: str) -> Optional[Dict[str, Any]]:
        """Safely parse JSON content with fallback handling."""
        if not content:
            return None
        
        try:
            # Try direct JSON parsing
            return json.loads(content)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown code blocks
            if '```json' in content:
                start = content.find('```json') + 7
                end = content.find('```', start)
                if end != -1:
                    json_content = content[start:end].strip()
                    try:
                        return json.loads(json_content)
                    except json.JSONDecodeError:
                        pass
            return None
    
    def health_check(self) -> Dict[str, Any]:
        """Health check for functional processor."""
        try:
            # Test function creation (very fast)
            test_func = create_extraction_function()
            
            return {
                "status": "healthy",
                "processor_type": "functional",
                "handlers_available": True,
                "config_valid": True,
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            return {
                "status": "error",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }

# Create singleton instance for Cloud Run
functional_processor = FunctionalProcessor()