#!/usr/bin/env python3
"""
Test script to upload Bill_Copy.jpg and trigger processing
This will help us see the OpenAI response logs and debug the Firestore issue
"""
import requests
import json
import time

# Configuration
INITIAL_API_URL = "https://initial-api-545188726513.asia-south1.run.app"
QUEUE_PROCESSOR_URL = "https://queue-processor-545188726513.asia-south1.run.app"

# Test image path
IMAGE_PATH = r"c:\Users\Dell 5330\OneDrive\Documents\InvoiceSetup\invoice-pipeline-project-folder\initial-api\Cloudrun_version\Bill_Copy.jpg"

def test_upload_and_process():
    """Test the complete upload and processing flow"""
    
    print("🔄 Testing invoice processing pipeline...")
    
    try:
        # Step 1: Upload file to initial-api
        print(f"📤 Uploading {IMAGE_PATH}...")
        
        with open(IMAGE_PATH, 'rb') as file:
            files = {'file': ('Bill_Copy.jpg', file, 'image/jpeg')}
            
            upload_response = requests.post(
                f"{INITIAL_API_URL}/upload_invoice",
                files=files,
                timeout=30
            )
        
        if upload_response.status_code != 200:
            print(f"❌ Upload failed: {upload_response.status_code}")
            print(f"Response: {upload_response.text}")
            return
        
        upload_result = upload_response.json()
        print(f"✅ Upload successful: {upload_result}")
        
        # Step 2: Process file through queue processor
        bucket_path = upload_result.get('bucket_path')
        if not bucket_path:
            print("❌ No bucket_path in upload response")
            return
        
        print(f"📋 Processing file: {bucket_path}")
        
        process_response = requests.post(
            f"{QUEUE_PROCESSOR_URL}/process-file",
            headers={'Content-Type': 'application/json'},
            json={'bucket_path': bucket_path},
            timeout=30
        )
        
        if process_response.status_code != 200:
            print(f"❌ Processing failed: {process_response.status_code}")
            print(f"Response: {process_response.text}")
            return
        
        process_result = process_response.json()
        job_id = process_result.get('job_id')
        print(f"✅ Job queued: {job_id}")
        
        # Step 3: Poll for completion
        print("⏳ Waiting for job completion...")
        
        for i in range(30):  # Wait up to 5 minutes
            time.sleep(10)
            
            status_response = requests.get(
                f"{QUEUE_PROCESSOR_URL}/job-status/{job_id}",
                timeout=10
            )
            
            if status_response.status_code == 200:
                status_result = status_response.json()
                status = status_result.get('status')
                
                print(f"🔍 Job status: {status}")
                
                if status in ['completed', 'failed']:
                    print(f"🎯 Final result: {status_result}")
                    break
            else:
                print(f"⚠️  Status check failed: {status_response.status_code}")
        
        print("✨ Test completed!")
        
    except Exception as e:
        print(f"💥 Error during test: {e}")

if __name__ == "__main__":
    test_upload_and_process()