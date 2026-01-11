"""
Test Restructured Pipeline - Simple Handler Validation
Tests the complete 3-phase pipeline with simple OpenAI handlers
"""

import os
import sys
import json
import base64
import requests
import time
from datetime import datetime

# Test configuration
ORCHESTRATOR_URL = "https://pipeline-orchestrator-812016027146.asia-south1.run.app"
TEST_IMAGE_PATH = "shared/test_invoice.png"

def load_test_image():
    """Load test image for pipeline validation"""
    try:
        if os.path.exists(TEST_IMAGE_PATH):
            with open(TEST_IMAGE_PATH, 'rb') as f:
                image_content = base64.b64encode(f.read()).decode('utf-8')
            print(f"✅ Loaded test image: {len(image_content)} chars")
            return image_content
        else:
            print(f"❌ Test image not found: {TEST_IMAGE_PATH}")
            return None
    except Exception as e:
        print(f"❌ Error loading test image: {e}")
        return None

def test_orchestrator_health():
    """Test orchestrator health endpoint"""
    try:
        print("\n🏥 Testing Pipeline Orchestrator Health...")
        response = requests.get(f"{ORCHESTRATOR_URL}/health", timeout=30)
        
        if response.ok:
            health_data = response.json()
            print(f"✅ Orchestrator Status: {health_data['status']}")
            print(f"📦 Version: {health_data['version']}")
            print(f"🏗️ Architecture: {health_data['architecture']}")
            return True
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Health check error: {e}")
        return False

def test_all_services_health():
    """Test health of all microservices through orchestrator"""
    try:
        print("\n🔍 Testing All Services Health...")
        response = requests.get(f"{ORCHESTRATOR_URL}/health/services", timeout=30)
        
        if response.ok:
            health_data = response.json()
            print(f"🎯 Overall Status: {health_data['overall_status']}")
            
            for service_name, service_health in health_data['services'].items():
                status = service_health['status']
                if status == 'healthy':
                    print(f"  ✅ {service_name}: {status}")
                    if 'service_info' in service_health:
                        version = service_health['service_info'].get('version', 'unknown')
                        handler = service_health['service_info'].get('handler', 'unknown')
                        print(f"     📦 Version: {version}, Handler: {handler}")
                else:
                    print(f"  ❌ {service_name}: {status}")
                    
            return health_data['overall_status'] == 'healthy'
        else:
            print(f"❌ Services health check failed: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Services health check error: {e}")
        return False

def test_complete_pipeline():
    """Test complete 3-phase pipeline"""
    try:
        print("\n🚀 Testing Complete Pipeline...")
        
        # Load test image
        image_content = load_test_image()
        if not image_content:
            print("❌ Cannot test pipeline without test image")
            return False
        
        # Prepare test payload
        job_id = f"test_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        test_payload = {
            'image_content': image_content,
            'job_id': job_id
        }
        
        print(f"📋 Job ID: {job_id}")
        print(f"🖼️ Image size: {len(image_content)} chars")
        
        # Send pipeline request
        print("📡 Sending pipeline request...")
        start_time = time.time()
        
        response = requests.post(
            f"{ORCHESTRATOR_URL}/process-invoice",
            json=test_payload,
            timeout=600  # 10 minutes max
        )
        
        end_time = time.time()
        duration = end_time - start_time
        
        if response.ok:
            result = response.json()
            print(f"✅ Pipeline completed in {duration:.2f} seconds")
            print(f"🎯 Status: {result['status']}")
            
            if 'pipeline_stats' in result:
                stats = result['pipeline_stats']
                print(f"⏱️ Total Duration: {stats['total_duration_seconds']:.2f}s")
                print(f"📊 Phase Durations:")
                for phase, duration in stats['phase_durations'].items():
                    print(f"   • {phase}: {duration:.2f}s")
                
                print(f"🤖 Handler Version: {stats.get('handler_version', 'unknown')}")
            
            # Print sample of results
            if 'final_result' in result:
                print(f"\n📄 Sample Results:")
                final_result = result['final_result']
                
                # Show extracted data sample
                if 'combined_data' in final_result and 'extracted_invoice_data' in final_result['combined_data']:
                    extracted = final_result['combined_data']['extracted_invoice_data']
                    if 'invoice_data' in extracted:
                        invoice_data = extracted['invoice_data']
                        print(f"   📋 Invoice Number: {invoice_data.get('invoice_number', 'N/A')}")
                        print(f"   🏢 Vendor: {invoice_data.get('vendor_name', 'N/A')}")
                        print(f"   💰 Total: {invoice_data.get('total_amount', 'N/A')}")
                
                # Show AI validation
                if 'ai_validation' in final_result:
                    validation = final_result['ai_validation']
                    print(f"   🤖 AI Validation Score: {validation.get('compliance_score', 'N/A')}")
            
            return True
        else:
            print(f"❌ Pipeline failed: {response.status_code}")
            try:
                error_data = response.json()
                print(f"   Error: {error_data.get('error', 'Unknown error')}")
            except:
                print(f"   Raw response: {response.text[:200]}")
            return False
            
    except requests.Timeout:
        print("⏰ Pipeline request timed out (10 minutes)")
        return False
    except Exception as e:
        print(f"❌ Pipeline test error: {e}")
        return False

def main():
    """Run complete pipeline validation"""
    print("🧪 RESTRUCTURED PIPELINE VALIDATION")
    print("=" * 50)
    print("Testing simple OpenAI handler implementation")
    
    # Test sequence
    tests = [
        ("Orchestrator Health", test_orchestrator_health),
        ("All Services Health", test_all_services_health),
        ("Complete Pipeline", test_complete_pipeline)
    ]
    
    results = []
    
    for test_name, test_func in tests:
        print(f"\n🔬 Running: {test_name}")
        try:
            success = test_func()
            results.append((test_name, success))
            
            if success:
                print(f"✅ {test_name}: PASSED")
            else:
                print(f"❌ {test_name}: FAILED")
                
        except Exception as e:
            print(f"💥 {test_name}: ERROR - {e}")
            results.append((test_name, False))
    
    # Summary
    print("\n📊 TEST SUMMARY")
    print("=" * 30)
    
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    for test_name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print(f"\n🎯 Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! Pipeline is working with simple handlers.")
        return 0
    else:
        print("⚠️ Some tests failed. Check logs above.")
        return 1

if __name__ == "__main__":
    exit(main())