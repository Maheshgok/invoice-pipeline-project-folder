"""
Local Pipeline Test Rig - Full 3-Phase Simulation
Complete local testing environment with detailed logging and JSON queue
Simulates: Data Extraction -> Enrichment -> Combination
"""

import os
import sys
import json
import time
import base64
from datetime import datetime
from typing import Dict, List, Any
import logging
from dataclasses import dataclass
from pathlib import Path

# Add shared directory to path
sys.path.append('shared')
from functional_openai_handler import (
    create_extraction_function,
    create_enrichment_function, 
    create_analysis_function
)

# Configure detailed logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(name)s | %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger('PipelineTestRig')

@dataclass
class ProcessingJob:
    """Represents a processing job in the queue"""
    job_id: str
    image_content: str
    status: str = "PENDING"
    phase: int = 0
    created_at: str = None
    results: Dict = None
    errors: List = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now().isoformat()
        if self.results is None:
            self.results = {}
        if self.errors is None:
            self.errors = []

class JSONQueue:
    """Simple JSON-based queue for debugging and monitoring"""
    
    def __init__(self, queue_file: str = "test_queue.json"):
        self.queue_file = queue_file
        self.jobs = {}
        self.load_queue()
    
    def load_queue(self):
        """Load existing queue from file"""
        try:
            if os.path.exists(self.queue_file):
                with open(self.queue_file, 'r') as f:
                    data = json.load(f)
                    self.jobs = {job_id: ProcessingJob(**job_data) for job_id, job_data in data.items()}
                logger.info(f"📂 Loaded {len(self.jobs)} jobs from queue file")
            else:
                logger.info("📂 No existing queue file found, starting fresh")
        except Exception as e:
            logger.error(f"❌ Error loading queue: {e}")
            self.jobs = {}
    
    def save_queue(self):
        """Save current queue to file"""
        try:
            queue_data = {}
            for job_id, job in self.jobs.items():
                queue_data[job_id] = {
                    'job_id': job.job_id,
                    'status': job.status,
                    'phase': job.phase,
                    'created_at': job.created_at,
                    'results': job.results,
                    'errors': job.errors,
                    'image_content': job.image_content[:100] + "..." if len(job.image_content) > 100 else job.image_content
                }
            
            with open(self.queue_file, 'w') as f:
                json.dump(queue_data, f, indent=2)
            logger.info(f"💾 Saved queue with {len(self.jobs)} jobs")
        except Exception as e:
            logger.error(f"❌ Error saving queue: {e}")
    
    def add_job(self, job: ProcessingJob):
        """Add job to queue"""
        self.jobs[job.job_id] = job
        self.save_queue()
        logger.info(f"➕ Added job {job.job_id} to queue")
    
    def update_job(self, job_id: str, **updates):
        """Update job in queue"""
        if job_id in self.jobs:
            for key, value in updates.items():
                setattr(self.jobs[job_id], key, value)
            self.save_queue()
            logger.info(f"🔄 Updated job {job_id}: {updates}")
    
    def get_job(self, job_id: str) -> ProcessingJob:
        """Get job from queue"""
        return self.jobs.get(job_id)
    
    def list_jobs(self) -> List[ProcessingJob]:
        """List all jobs"""
        return list(self.jobs.values())

class LocalPipelineTestRig:
    """Local simulation of the 3-phase pipeline"""
    
    def __init__(self):
        self.queue = JSONQueue()
        self.setup_handlers()
        self.setup_test_data()
        
        logger.info("🧪 LOCAL PIPELINE TEST RIG INITIALIZED")
        logger.info("=" * 60)
    
    def setup_handlers(self):
        """Initialize functional handlers for each phase"""
        logger.info("🔧 Setting up functional handlers...")
        
        # Phase 1: Data Extraction Handler
        self.extract_func = create_extraction_function("local_extractor")
        logger.info("✅ Phase 1 Handler: Data Extraction (functional)")
        
        # Phase 2: Enrichment Handler  
        self.enrich_func = create_enrichment_function("local_enricher")
        logger.info("✅ Phase 2 Handler: Data Enrichment (functional)")
        
        # Phase 3: Analysis Handler
        self.analyze_func = create_analysis_function("local_analyzer")
        logger.info("✅ Phase 3 Handler: Data Analysis (functional)")
        
        # Define prompts
        self.extraction_prompt = """
Extract structured data from this invoice image and return as JSON.

Extract these fields:
1. Invoice metadata (number, date, due date)
2. Vendor information (name, address, contact details) 
3. Line items with descriptions, quantities, prices
4. Tax information (GST/VAT details)
5. Total amounts

Return JSON format:
{
  "invoice_data": {
    "invoice_number": "",
    "invoice_date": "", 
    "vendor_name": "",
    "vendor_address": "",
    "line_items": [
      {"description": "", "quantity": 0, "unit_price": 0, "total": 0}
    ],
    "tax_details": {"gst_rate": 0, "gst_amount": 0},
    "total_amount": 0
  }
}
"""
        
        self.enrichment_prompt = """
Enhance this extracted invoice data with business insights and validation.

Input data: {extracted_data}

Add these enrichments:
1. Data quality assessment and validation
2. Business category classification for each item
3. Tax compliance verification  
4. Accounting journal entry suggestions
5. Risk assessment and flags

Return JSON format:
{
  "enrichments": {
    "data_quality": {"score": 0, "issues": [], "validation_status": ""},
    "business_insights": {"item_categories": [], "expense_classification": ""},
    "accounting_suggestions": {"journal_entries": [], "tax_treatment": ""}
  }
}
"""
        
        self.analysis_prompt = """
Validate and finalize this combined invoice data for accuracy.

Combined data: {combined_data}

Validate:
1. Double-entry balance (total debits = total credits)
2. Account code consistency
3. GST calculation accuracy
4. Compliance with Indian accounting standards

Return JSON format:
{
  "validation_summary": {
    "balance_check": true,
    "gst_accuracy": true, 
    "compliance_score": 95,
    "issues_found": [],
    "recommendations": []
  }
}
"""
    
    def setup_test_data(self):
        """Load test image data"""
        logger.info("📁 Loading test data...")
        
        test_image_path = r"C:\Users\Dell 5330\OneDrive\Documents\InvoiceSetup\invoice-pipeline-project-folder\gst-invoice-bill-format-2.png"
        if os.path.exists(test_image_path):
            with open(test_image_path, 'rb') as f:
                self.test_image_content = base64.b64encode(f.read()).decode('utf-8')
            logger.info(f"✅ Loaded SUNRISE ENTERPRISE invoice: {len(self.test_image_content)} chars")
        else:
            logger.error(f"❌ Test invoice not found at: {test_image_path}")
            self.test_image_content = None
    
    def print_separator(self, title: str):
        """Print formatted separator"""
        print("\n" + "=" * 80)
        print(f"  {title}")
        print("=" * 80)
    
    def print_phase_header(self, phase: int, title: str):
        """Print phase header"""
        print(f"\n🚀 PHASE {phase}: {title}")
        print("-" * 60)
    
    def print_json_pretty(self, data: Any, title: str = None):
        """Print JSON data in pretty format"""
        if title:
            print(f"\n📋 {title}:")
            print("-" * len(title) + "--")
        
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except:
                pass
        
        print(json.dumps(data, indent=2, ensure_ascii=False))
    
    def phase1_extraction(self, job: ProcessingJob) -> Dict[str, Any]:
        """Phase 1: Data Extraction"""
        self.print_phase_header(1, "DATA EXTRACTION")
        
        job.phase = 1
        job.status = "PROCESSING_PHASE_1"
        self.queue.update_job(job.job_id, phase=1, status="PROCESSING_PHASE_1")
        
        logger.info(f"🖼️ Starting extraction for job: {job.job_id}")
        logger.info(f"📏 Image size: {len(job.image_content)} characters")
        
        start_time = time.time()
        
        # Call extraction function
        result = self.extract_func(
            prompt=self.extraction_prompt,
            image_content=job.image_content,
            context=f"phase1_{job.job_id}"
        )
        
        processing_time = time.time() - start_time
        
        if result['success']:
            logger.info(f"✅ Extraction successful in {processing_time:.2f}s")
            logger.info(f"🔢 Tokens used: {result['tokens_used']}")
            
            try:
                extracted_data = json.loads(result['content'])
                self.print_json_pretty(extracted_data, "EXTRACTED DATA")
                
                phase1_result = {
                    'status': 'SUCCESS',
                    'extracted_data': extracted_data,
                    'processing_time': processing_time,
                    'tokens_used': result['tokens_used']
                }
                
                job.results['phase1'] = phase1_result
                self.queue.update_job(job.job_id, results=job.results, status="PHASE_1_COMPLETE")
                
                return phase1_result
                
            except json.JSONDecodeError as e:
                logger.error(f"❌ JSON parse error: {e}")
                error_result = {
                    'status': 'PARSE_ERROR',
                    'error': str(e),
                    'raw_content': result['content']
                }
                job.errors.append(f"Phase 1 JSON Parse Error: {e}")
                self.queue.update_job(job.job_id, errors=job.errors, status="PHASE_1_FAILED")
                return error_result
        else:
            logger.error(f"❌ Extraction failed: {result['error']}")
            error_result = {
                'status': 'API_ERROR',
                'error': result['error']
            }
            job.errors.append(f"Phase 1 API Error: {result['error']}")
            self.queue.update_job(job.job_id, errors=job.errors, status="PHASE_1_FAILED")
            return error_result
    
    def phase2_enrichment(self, job: ProcessingJob, extracted_data: Dict) -> Dict[str, Any]:
        """Phase 2: Data Enrichment"""
        self.print_phase_header(2, "DATA ENRICHMENT")
        
        job.phase = 2
        job.status = "PROCESSING_PHASE_2"
        self.queue.update_job(job.job_id, phase=2, status="PROCESSING_PHASE_2")
        
        logger.info(f"💡 Starting enrichment for job: {job.job_id}")
        
        start_time = time.time()
        
        # Prepare enrichment prompt with extracted data
        enrichment_prompt = self.enrichment_prompt.format(
            extracted_data=json.dumps(extracted_data, indent=2)
        )
        
        # Call enrichment function
        result = self.enrich_func(
            prompt=enrichment_prompt,
            context=f"phase2_{job.job_id}"
        )
        
        processing_time = time.time() - start_time
        
        if result['success']:
            logger.info(f"✅ Enrichment successful in {processing_time:.2f}s")
            logger.info(f"🔢 Tokens used: {result['tokens_used']}")
            
            try:
                enriched_data = json.loads(result['content'])
                self.print_json_pretty(enriched_data, "ENRICHED DATA")
                
                phase2_result = {
                    'status': 'SUCCESS',
                    'enriched_data': enriched_data,
                    'processing_time': processing_time,
                    'tokens_used': result['tokens_used']
                }
                
                job.results['phase2'] = phase2_result
                self.queue.update_job(job.job_id, results=job.results, status="PHASE_2_COMPLETE")
                
                return phase2_result
                
            except json.JSONDecodeError as e:
                logger.error(f"❌ JSON parse error: {e}")
                error_result = {
                    'status': 'PARSE_ERROR', 
                    'error': str(e),
                    'raw_content': result['content']
                }
                job.errors.append(f"Phase 2 JSON Parse Error: {e}")
                self.queue.update_job(job.job_id, errors=job.errors, status="PHASE_2_FAILED")
                return error_result
        else:
            logger.error(f"❌ Enrichment failed: {result['error']}")
            error_result = {
                'status': 'API_ERROR',
                'error': result['error']
            }
            job.errors.append(f"Phase 2 API Error: {result['error']}")
            self.queue.update_job(job.job_id, errors=job.errors, status="PHASE_2_FAILED")
            return error_result
    
    def phase3_analysis(self, job: ProcessingJob, extracted_data: Dict, enriched_data: Dict) -> Dict[str, Any]:
        """Phase 3: Final Analysis"""
        self.print_phase_header(3, "FINAL ANALYSIS & VALIDATION")
        
        job.phase = 3
        job.status = "PROCESSING_PHASE_3"
        self.queue.update_job(job.job_id, phase=3, status="PROCESSING_PHASE_3")
        
        logger.info(f"🔍 Starting final analysis for job: {job.job_id}")
        
        start_time = time.time()
        
        # Combine data for analysis
        combined_data = {
            'extracted_data': extracted_data,
            'enriched_data': enriched_data,
            'processing_metadata': {
                'job_id': job.job_id,
                'phases_completed': ['extraction', 'enrichment'],
                'analysis_timestamp': datetime.now().isoformat()
            }
        }
        
        # Prepare analysis prompt
        analysis_prompt = self.analysis_prompt.format(
            combined_data=json.dumps(combined_data, indent=2)
        )
        
        # Call analysis function
        result = self.analyze_func(
            prompt=analysis_prompt,
            context=f"phase3_{job.job_id}"
        )
        
        processing_time = time.time() - start_time
        
        if result['success']:
            logger.info(f"✅ Analysis successful in {processing_time:.2f}s")
            logger.info(f"🔢 Tokens used: {result['tokens_used']}")
            
            try:
                analysis_data = json.loads(result['content'])
                self.print_json_pretty(analysis_data, "ANALYSIS RESULTS")
                
                # Create final combined result
                final_result = {
                    'job_id': job.job_id,
                    'status': 'COMPLETE',
                    'extracted_data': extracted_data,
                    'enriched_data': enriched_data,
                    'analysis_data': analysis_data,
                    'combined_data': combined_data,
                    'processing_stats': {
                        'phase1_tokens': job.results.get('phase1', {}).get('tokens_used', 0),
                        'phase2_tokens': job.results.get('phase2', {}).get('tokens_used', 0),
                        'phase3_tokens': result['tokens_used'],
                        'total_tokens': (job.results.get('phase1', {}).get('tokens_used', 0) + 
                                       job.results.get('phase2', {}).get('tokens_used', 0) + 
                                       result['tokens_used']),
                        'total_processing_time': (job.results.get('phase1', {}).get('processing_time', 0) +
                                                job.results.get('phase2', {}).get('processing_time', 0) +
                                                processing_time)
                    }
                }
                
                phase3_result = {
                    'status': 'SUCCESS',
                    'final_result': final_result,
                    'processing_time': processing_time,
                    'tokens_used': result['tokens_used']
                }
                
                job.results['phase3'] = phase3_result
                job.results['final'] = final_result
                self.queue.update_job(job.job_id, results=job.results, status="COMPLETE")
                
                return phase3_result
                
            except json.JSONDecodeError as e:
                logger.error(f"❌ JSON parse error: {e}")
                error_result = {
                    'status': 'PARSE_ERROR',
                    'error': str(e),
                    'raw_content': result['content']
                }
                job.errors.append(f"Phase 3 JSON Parse Error: {e}")
                self.queue.update_job(job.job_id, errors=job.errors, status="PHASE_3_FAILED")
                return error_result
        else:
            logger.error(f"❌ Analysis failed: {result['error']}")
            error_result = {
                'status': 'API_ERROR',
                'error': result['error']
            }
            job.errors.append(f"Phase 3 API Error: {result['error']}")
            self.queue.update_job(job.job_id, errors=job.errors, status="PHASE_3_FAILED")
            return error_result
    
    def run_full_pipeline(self, job_id: str = None) -> Dict[str, Any]:
        """Run complete 3-phase pipeline locally"""
        if job_id is None:
            job_id = f"test_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        if not self.test_image_content:
            logger.error("❌ No test image available")
            return {'status': 'ERROR', 'message': 'No test image available'}
        
        self.print_separator(f"STARTING FULL PIPELINE TEST - JOB: {job_id}")
        
        # Create processing job
        job = ProcessingJob(job_id=job_id, image_content=self.test_image_content)
        self.queue.add_job(job)
        
        pipeline_start = time.time()
        
        try:
            # Phase 1: Extraction
            phase1_result = self.phase1_extraction(job)
            if phase1_result['status'] != 'SUCCESS':
                logger.error("❌ Phase 1 failed, stopping pipeline")
                return phase1_result
            
            # Phase 2: Enrichment
            phase2_result = self.phase2_enrichment(job, phase1_result['extracted_data'])
            if phase2_result['status'] != 'SUCCESS':
                logger.error("❌ Phase 2 failed, stopping pipeline")
                return phase2_result
            
            # Phase 3: Analysis
            phase3_result = self.phase3_analysis(
                job, 
                phase1_result['extracted_data'],
                phase2_result['enriched_data']
            )
            if phase3_result['status'] != 'SUCCESS':
                logger.error("❌ Phase 3 failed, stopping pipeline")
                return phase3_result
            
            total_time = time.time() - pipeline_start
            
            self.print_separator("PIPELINE COMPLETED SUCCESSFULLY")
            
            # Print final summary
            final_result = phase3_result['final_result']
            stats = final_result['processing_stats']
            
            print(f"\n📊 PIPELINE SUMMARY:")
            print(f"   🆔 Job ID: {job_id}")
            print(f"   ⏱️ Total Time: {total_time:.2f} seconds")
            print(f"   🔢 Total Tokens: {stats['total_tokens']}")
            print(f"   📊 Tokens Breakdown:")
            print(f"      • Phase 1 (Extraction): {stats['phase1_tokens']}")
            print(f"      • Phase 2 (Enrichment): {stats['phase2_tokens']}")
            print(f"      • Phase 3 (Analysis): {stats['phase3_tokens']}")
            
            # Print final result
            self.print_json_pretty(final_result, "COMPLETE PIPELINE RESULT")
            
            return {
                'status': 'SUCCESS',
                'job_id': job_id,
                'total_time': total_time,
                'final_result': final_result
            }
            
        except Exception as e:
            logger.error(f"💥 Pipeline crashed: {str(e)}")
            job.errors.append(f"Pipeline Crash: {str(e)}")
            self.queue.update_job(job.job_id, errors=job.errors, status="CRASHED")
            return {
                'status': 'CRASHED',
                'error': str(e),
                'job_id': job_id
            }
    
    def show_queue_status(self):
        """Display current queue status"""
        jobs = self.queue.list_jobs()
        
        self.print_separator("QUEUE STATUS")
        
        if not jobs:
            print("📭 Queue is empty")
            return
        
        print(f"📊 Total Jobs: {len(jobs)}")
        print(f"{'Job ID':<20} {'Status':<15} {'Phase':<7} {'Created':<20}")
        print("-" * 70)
        
        for job in jobs:
            print(f"{job.job_id:<20} {job.status:<15} {job.phase:<7} {job.created_at[:19]:<20}")
    
    def show_detailed_job(self, job_id: str):
        """Show detailed information for a specific job"""
        job = self.queue.get_job(job_id)
        if not job:
            print(f"❌ Job {job_id} not found")
            return
        
        self.print_separator(f"JOB DETAILS: {job_id}")
        
        print(f"🆔 Job ID: {job.job_id}")
        print(f"📊 Status: {job.status}")
        print(f"🔄 Current Phase: {job.phase}")
        print(f"⏰ Created: {job.created_at}")
        print(f"❌ Errors: {len(job.errors)}")
        
        if job.errors:
            print("\n❌ Errors:")
            for i, error in enumerate(job.errors, 1):
                print(f"   {i}. {error}")
        
        if job.results:
            print(f"\n📋 Results Available:")
            for phase, result in job.results.items():
                print(f"   • {phase}: {result.get('status', 'Unknown')}")
            
            if 'final' in job.results:
                self.print_json_pretty(job.results['final'], "FINAL RESULT")

def main():
    """Main test rig interface"""
    print("🧪 LOCAL PIPELINE TEST RIG")
    print("=" * 50)
    
    rig = LocalPipelineTestRig()
    
    while True:
        print("\n📋 Available Commands:")
        print("  1. Run Full Pipeline Test")
        print("  2. Show Queue Status") 
        print("  3. Show Job Details")
        print("  4. Clear Queue")
        print("  5. Exit")
        
        try:
            choice = input("\n👉 Enter choice (1-5): ").strip()
            
            if choice == '1':
                print("\n🚀 Starting Full Pipeline Test...")
                result = rig.run_full_pipeline()
                if result['status'] == 'SUCCESS':
                    print(f"\n🎉 Pipeline test completed successfully!")
                else:
                    print(f"\n❌ Pipeline test failed: {result.get('error', 'Unknown error')}")
            
            elif choice == '2':
                rig.show_queue_status()
            
            elif choice == '3':
                job_id = input("Enter Job ID: ").strip()
                if job_id:
                    rig.show_detailed_job(job_id)
                else:
                    print("❌ Job ID required")
            
            elif choice == '4':
                if input("⚠️ Clear all queue data? (y/N): ").lower() == 'y':
                    rig.queue.jobs = {}
                    rig.queue.save_queue()
                    print("✅ Queue cleared")
            
            elif choice == '5':
                print("👋 Goodbye!")
                break
            
            else:
                print("❌ Invalid choice")
                
        except KeyboardInterrupt:
            print("\n👋 Goodbye!")
            break
        except Exception as e:
            print(f"❌ Error: {e}")

if __name__ == "__main__":
    main()