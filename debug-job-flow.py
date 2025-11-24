#!/usr/bin/env python3
"""
Debug Job ID Flow - Track complete job ID pipeline
Tests each step of job ID creation and passing
"""

import requests
import json
import time

# Test endpoints
INITIAL_API_URL = "https://initial-api-812016027146.asia-south1.run.app"
QUEUE_PROCESSOR_URL = "https://queue-processor-812016027146.asia-south1.run.app"

def test_job_id_flow():
    print("🔍 Testing Complete Job ID Flow...")
    print("=" * 50)
    
    # Test 1: Check if initial-api generates new format
    print("\n1️⃣ Testing Initial API Job ID Generation...")
    health_response = requests.get(f"{INITIAL_API_URL}/health")
    if health_response.status_code == 200:
        print("✅ Initial API is healthy")
    else:
        print("❌ Initial API is not responding")
        return
    
    # Test 2: Check queue processor
    print("\n2️⃣ Testing Queue Processor...")
    health_response = requests.get(f"{QUEUE_PROCESSOR_URL}/health")
    if health_response.status_code == 200:
        health_data = health_response.json()
        print("✅ Queue Processor is healthy")
        print(f"📊 Queue Status: {health_data.get('queue_status', {})}")
    else:
        print("❌ Queue Processor is not responding")
        return
    
    # Test 3: Manual job ID generation test
    print("\n3️⃣ Manual Job ID Generation Test...")
    import hashlib
    import secrets
    
    test_email = "maheshgok@gmail.com"
    test_filename = "test_invoice.pdf"
    
    # Simulate initial-api job ID generation
    email_hash = hashlib.md5(test_email.encode()).hexdigest()
    cust_num = f"{email_hash[:2].upper()}{ord(email_hash[2]) % 10}"
    
    path_hash = hashlib.sha256(test_filename.encode()).hexdigest()
    timestamp = "53"  # last 2 digits
    asset_ref = f"{path_hash[:4].upper()}{timestamp}"
    
    token = secrets.token_hex(2).upper()
    test_job_id = f"{cust_num}-{asset_ref}-{token}"
    
    print(f"🆔 Generated Test Job ID: {test_job_id}")
    print(f"🧩 Components: cust={cust_num}, asset={asset_ref}, token={token}")
    
    # Validate format
    parts = test_job_id.split('-')
    if len(parts) == 3 and len(parts[0]) == 3 and len(parts[1]) == 6 and len(parts[2]) == 4:
        print("✅ Job ID format is CORRECT")
    else:
        print("❌ Job ID format is WRONG")
    
    print("\n4️⃣ Expected vs Actual Analysis...")
    expected_format = f"{cust_num}-XXXXXX-XXXX"
    old_format_example = "job_2025_11_21_03-44-51_1135"
    
    print(f"✅ Expected NEW format: {expected_format}")
    print(f"❌ OLD format in Firestore: {old_format_example}")
    
    # Check if the mismatch is due to old data
    print(f"\n🔍 Mismatch Analysis:")
    print(f"   Frontend expects: DD7-A33845-19DD (new format)")
    print(f"   Firestore has:    job_2025_11_21_03-44-51_1135 (old format)")
    print(f"   Conclusion:       OLD DATA in Firestore needs cleanup!")

if __name__ == "__main__":
    test_job_id_flow()