"""
Production-Ready Local Test Rig with Queue Management
Complete testing environment ready for cloud deployment validation
"""

import os
import sys
import json
import time
import base64
from datetime import datetime
from typing import Dict, List, Any

# Add shared directory to path  
sys.path.append('shared')
from functional_openai_handler import (
    create_extraction_function,
    create_enrichment_function,
    create_analysis_function
)

class TestJob:
    """Represents a test processing job"""
    def __init__(self, job_id: str, image_path: str, description: str = ""):
        self.job_id = job_id
        self.image_path = image_path
        self.description = description
        self.status = "PENDING"
        self.created_at = datetime.now().isoformat()
        self.results = {}
        self.errors = []
        self.performance = {}

class ProductionTestRig:
    """Production-ready test rig with full pipeline simulation"""
    
    def __init__(self):
        self.setup_handlers()
        self.test_queue = []
        self.completed_jobs = []
        
        print("🏭 PRODUCTION TEST RIG INITIALIZED")
        print("="*60)
        
    def setup_handlers(self):
        """Initialize optimized functional handlers"""
        print("🔧 Setting up production-grade functional handlers...")
        
        self.extract_func = create_extraction_function("prod_test_extractor")
        self.enrich_func = create_enrichment_function("prod_test_enricher")  
        self.analyze_func = create_analysis_function("prod_test_analyzer")
        
        print("✅ All functional handlers ready for production testing")
    
    def add_test_job(self, job_id: str, image_path: str, description: str = ""):
        """Add test job to queue"""
        job = TestJob(job_id, image_path, description)
        self.test_queue.append(job)
        print(f"➕ Added test job: {job_id} - {description}")
        
    def load_image(self, image_path: str) -> str:
        """Load and encode image"""
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found: {image_path}")
            
        with open(image_path, 'rb') as f:
            return base64.b64encode(f.read()).decode('utf-8')
    
    def run_extraction_phase(self, job: TestJob, image_content: str) -> Dict:
        """Run Phase 1: Data Extraction"""
        print(f"\n🔍 PHASE 1: Data Extraction - {job.job_id}")
        print("-" * 50)
        
        extraction_prompt = """
Analyze this invoice image and extract complete structured data.

Extract comprehensive details:
- Invoice header (number, date, GSTIN, type)
- Vendor information (name, address, contact, GSTIN)
- Billing/shipping details
- Complete line items with HSN, quantities, rates, tax details
- Tax calculations (CGST, SGST, IGST)
- Payment terms and bank details
- Total amounts and summary

Return structured JSON with all extracted information.
"""
        
        start_time = time.time()
        result = self.extract_func(
            prompt=extraction_prompt,
            image_content=image_content,
            context=f"phase1_{job.job_id}"
        )
        processing_time = time.time() - start_time
        
        if result['success']:
            print(f"✅ Extraction successful: {processing_time:.2f}s, {result['tokens_used']} tokens")
            
            # Parse JSON from response
            try:
                if result['content'].startswith('```json'):
                    json_start = result['content'].find('{')
                    json_end = result['content'].rfind('}') + 1
                    extracted_data = json.loads(result['content'][json_start:json_end])
                else:
                    extracted_data = json.loads(result['content'])
                    
                return {
                    'status': 'SUCCESS',
                    'data': extracted_data,
                    'time': processing_time,
                    'tokens': result['tokens_used']
                }
            except json.JSONDecodeError as e:
                print(f"⚠️ JSON parse issue, using raw content")
                return {
                    'status': 'PARSE_WARNING',
                    'data': {'raw_content': result['content']},
                    'time': processing_time,
                    'tokens': result['tokens_used']
                }
        else:
            print(f"❌ Extraction failed: {result['error']}")
            return {
                'status': 'FAILED',
                'error': result['error'],
                'time': processing_time,
                'tokens': 0
            }
    
    def run_enrichment_phase(self, job: TestJob, extracted_data: Dict) -> Dict:
        """Run Phase 2: Data Enrichment"""
        print(f"\n💡 PHASE 2: Data Enrichment - {job.job_id}")
        print("-" * 50)
        
        enrichment_prompt = f"""
Enhance this invoice data with comprehensive business intelligence:

Extracted Data:
{json.dumps(extracted_data, indent=2)}

Add complete enrichments:
1. Data quality assessment with scoring
2. Business categorization for all line items  
3. Accounting code assignments
4. GST compliance verification
5. Supplier risk analysis
6. Journal entry recommendations
7. Process optimization suggestions

Return comprehensive enrichment JSON.
"""
        
        start_time = time.time()
        result = self.enrich_func(
            prompt=enrichment_prompt,
            context=f"phase2_{job.job_id}"
        )
        processing_time = time.time() - start_time
        
        if result['success']:
            print(f"✅ Enrichment successful: {processing_time:.2f}s, {result['tokens_used']} tokens")
            
            try:
                if result['content'].startswith('```json'):
                    json_start = result['content'].find('{')
                    json_end = result['content'].rfind('}') + 1
                    enriched_data = json.loads(result['content'][json_start:json_end])
                else:
                    enriched_data = json.loads(result['content'])
                    
                return {
                    'status': 'SUCCESS',
                    'data': enriched_data,
                    'time': processing_time,
                    'tokens': result['tokens_used']
                }
            except json.JSONDecodeError:
                return {
                    'status': 'PARSE_WARNING',
                    'data': {'raw_content': result['content']},
                    'time': processing_time,
                    'tokens': result['tokens_used']
                }
        else:
            print(f"❌ Enrichment failed: {result['error']}")
            return {
                'status': 'FAILED',
                'error': result['error'],
                'time': processing_time,
                'tokens': 0
            }
    
    def run_validation_phase(self, job: TestJob, extracted_data: Dict, enriched_data: Dict) -> Dict:
        """Run Phase 3: Final Validation"""
        print(f"\n✅ PHASE 3: Final Validation - {job.job_id}")
        print("-" * 50)
        
        combined_data = {
            'extracted': extracted_data,
            'enriched': enriched_data,
            'job_metadata': {
                'job_id': job.job_id,
                'description': job.description,
                'timestamp': datetime.now().isoformat()
            }
        }
        
        validation_prompt = f"""
Perform comprehensive final validation of this invoice processing result:

Complete Data:
{json.dumps(combined_data, indent=2)}

Provide thorough validation:
1. Mathematical accuracy verification
2. Business logic consistency check
3. Compliance validation (GST, HSN codes)
4. Data integrity assessment
5. Integration readiness evaluation
6. Quality score and recommendations

Return complete validation and integration readiness report.
"""
        
        start_time = time.time()
        result = self.analyze_func(
            prompt=validation_prompt,
            context=f"phase3_{job.job_id}"
        )
        processing_time = time.time() - start_time
        
        if result['success']:
            print(f"✅ Validation successful: {processing_time:.2f}s, {result['tokens_used']} tokens")
            
            try:
                if result['content'].startswith('```json'):
                    json_start = result['content'].find('{')
                    json_end = result['content'].rfind('}') + 1
                    validation_data = json.loads(result['content'][json_start:json_end])
                else:
                    validation_data = json.loads(result['content'])
                    
                return {
                    'status': 'SUCCESS',
                    'data': validation_data,
                    'time': processing_time,
                    'tokens': result['tokens_used']
                }
            except json.JSONDecodeError:
                return {
                    'status': 'PARSE_WARNING',
                    'data': {'raw_content': result['content']},
                    'time': processing_time,
                    'tokens': result['tokens_used']
                }
        else:
            print(f"❌ Validation failed: {result['error']}")
            return {
                'status': 'FAILED',
                'error': result['error'],
                'time': processing_time,
                'tokens': 0
            }
    
    def process_job(self, job: TestJob) -> bool:
        """Process a complete job through all 3 phases"""
        print(f"\n🚀 PROCESSING JOB: {job.job_id}")
        print(f"📋 Description: {job.description}")
        print("="*80)
        
        job.status = "PROCESSING"
        pipeline_start = time.time()
        
        try:
            # Load image
            print(f"📁 Loading image: {job.image_path}")
            image_content = self.load_image(job.image_path)
            print(f"✅ Image loaded: {len(image_content):,} characters")
            
            # Phase 1: Extraction
            phase1_result = self.run_extraction_phase(job, image_content)
            if phase1_result['status'] == 'FAILED':
                job.status = "FAILED_PHASE1"
                job.errors.append(f"Phase 1 failed: {phase1_result['error']}")
                return False
            
            job.results['phase1'] = phase1_result
            
            # Phase 2: Enrichment
            phase2_result = self.run_enrichment_phase(job, phase1_result['data'])
            if phase2_result['status'] == 'FAILED':
                job.status = "FAILED_PHASE2"
                job.errors.append(f"Phase 2 failed: {phase2_result['error']}")
                return False
            
            job.results['phase2'] = phase2_result
            
            # Phase 3: Validation
            phase3_result = self.run_validation_phase(job, phase1_result['data'], phase2_result['data'])
            if phase3_result['status'] == 'FAILED':
                job.status = "FAILED_PHASE3"
                job.errors.append(f"Phase 3 failed: {phase3_result['error']}")
                return False
            
            job.results['phase3'] = phase3_result
            
            # Calculate performance metrics
            total_time = time.time() - pipeline_start
            total_tokens = (phase1_result.get('tokens', 0) + 
                          phase2_result.get('tokens', 0) + 
                          phase3_result.get('tokens', 0))
            
            job.performance = {
                'total_time': total_time,
                'total_tokens': total_tokens,
                'tokens_per_second': total_tokens / total_time if total_time > 0 else 0,
                'phase_breakdown': {
                    'phase1': {'time': phase1_result.get('time', 0), 'tokens': phase1_result.get('tokens', 0)},
                    'phase2': {'time': phase2_result.get('time', 0), 'tokens': phase2_result.get('tokens', 0)},
                    'phase3': {'time': phase3_result.get('time', 0), 'tokens': phase3_result.get('tokens', 0)}
                }
            }
            
            job.status = "COMPLETED"
            
            print(f"\n🎉 JOB COMPLETED SUCCESSFULLY!")
            print(f"⏱️ Total Time: {total_time:.2f} seconds")
            print(f"🔢 Total Tokens: {total_tokens:,}")
            print(f"📈 Efficiency: {total_tokens/total_time:.1f} tokens/sec")
            
            return True
            
        except Exception as e:
            job.status = "CRASHED"
            job.errors.append(f"Pipeline crash: {str(e)}")
            print(f"💥 Job crashed: {str(e)}")
            return False
    
    def run_all_queued_jobs(self):
        """Process all jobs in queue"""
        if not self.test_queue:
            print("📭 No jobs in queue")
            return
        
        print(f"\n🏃 PROCESSING {len(self.test_queue)} QUEUED JOBS")
        print("="*60)
        
        results = {'success': 0, 'failed': 0, 'total': len(self.test_queue)}
        
        while self.test_queue:
            job = self.test_queue.pop(0)
            
            if self.process_job(job):
                results['success'] += 1
            else:
                results['failed'] += 1
                
            self.completed_jobs.append(job)
            
            # Save results after each job
            self.save_job_results(job)
        
        print(f"\n📊 BATCH PROCESSING COMPLETE")
        print(f"✅ Successful: {results['success']}/{results['total']}")
        print(f"❌ Failed: {results['failed']}/{results['total']}")
        print(f"📈 Success Rate: {(results['success']/results['total']*100):.1f}%")
    
    def save_job_results(self, job: TestJob):
        """Save individual job results to file"""
        result_data = {
            'job_id': job.job_id,
            'description': job.description,
            'status': job.status,
            'created_at': job.created_at,
            'results': job.results,
            'performance': job.performance,
            'errors': job.errors
        }
        
        filename = f"test_result_{job.job_id}.json"
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(result_data, f, indent=2, ensure_ascii=False)
        
        print(f"💾 Results saved: {filename}")
    
    def show_queue_status(self):
        """Display current queue and completed jobs status"""
        print(f"\n📊 TEST RIG STATUS")
        print("="*50)
        print(f"📋 Queued Jobs: {len(self.test_queue)}")
        print(f"✅ Completed Jobs: {len(self.completed_jobs)}")
        
        if self.test_queue:
            print(f"\n📝 QUEUED JOBS:")
            for job in self.test_queue:
                print(f"   🔄 {job.job_id}: {job.description}")
        
        if self.completed_jobs:
            print(f"\n📊 COMPLETED JOBS:")
            for job in self.completed_jobs:
                status_emoji = "✅" if job.status == "COMPLETED" else "❌"
                print(f"   {status_emoji} {job.job_id}: {job.status}")

def setup_production_tests():
    """Setup comprehensive production test scenarios"""
    test_rig = ProductionTestRig()
    
    # Add test scenarios
    invoice_path = r"C:\Users\Dell 5330\OneDrive\Documents\InvoiceSetup\invoice-pipeline-project-folder\gst-invoice-bill-format-2.png"
    
    test_rig.add_test_job(
        "sunrise_invoice_full",
        invoice_path,
        "Complete SUNRISE ENTERPRISE invoice processing test"
    )
    
    test_rig.add_test_job(
        "sunrise_invoice_performance",
        invoice_path,
        "Performance benchmark test with same invoice"
    )
    
    return test_rig

def main():
    """Main production test interface"""
    print("🏭 PRODUCTION-READY PIPELINE TEST RIG")
    print("="*60)
    
    test_rig = setup_production_tests()
    
    while True:
        print(f"\n📋 AVAILABLE COMMANDS:")
        print("  1. Show Queue Status")
        print("  2. Process All Queued Jobs")
        print("  3. Process Single Job")
        print("  4. Add Custom Test Job")
        print("  5. View Job Results")
        print("  6. Exit")
        
        try:
            choice = input(f"\n👉 Enter choice (1-6): ").strip()
            
            if choice == '1':
                test_rig.show_queue_status()
                
            elif choice == '2':
                test_rig.run_all_queued_jobs()
                
            elif choice == '3':
                if test_rig.test_queue:
                    job = test_rig.test_queue[0]
                    print(f"🔄 Processing next job: {job.job_id}")
                    if test_rig.process_job(job):
                        test_rig.completed_jobs.append(test_rig.test_queue.pop(0))
                        test_rig.save_job_results(job)
                else:
                    print("📭 No jobs in queue")
                    
            elif choice == '4':
                job_id = input("Enter Job ID: ").strip()
                image_path = input("Enter Image Path: ").strip()
                description = input("Enter Description: ").strip()
                
                if job_id and image_path:
                    test_rig.add_test_job(job_id, image_path, description)
                else:
                    print("❌ Job ID and Image Path required")
                    
            elif choice == '5':
                job_id = input("Enter Job ID to view: ").strip()
                result_file = f"test_result_{job_id}.json"
                
                if os.path.exists(result_file):
                    with open(result_file, 'r', encoding='utf-8') as f:
                        result_data = json.load(f)
                    print(json.dumps(result_data, indent=2))
                else:
                    print(f"❌ Result file not found: {result_file}")
                    
            elif choice == '6':
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