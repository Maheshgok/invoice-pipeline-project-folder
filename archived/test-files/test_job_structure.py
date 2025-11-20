#!/usr/bin/env python3
"""
Test script to demonstrate the new job-based data capture structure.
This shows how user modifications are now stored directly in job documents.
"""

import json
from google.cloud import firestore

def test_job_structure():
    """Test the new job structure with embedded user modifications"""
    
    print("🔍 Testing New Job-Based Data Capture Structure")
    print("=" * 60)
    
    # Initialize Firestore
    try:
        db = firestore.Client()
        print("✅ Connected to Firestore")
    except Exception as e:
        print(f"❌ Error connecting to Firestore: {e}")
        return
    
    # Query jobs with user modifications
    jobs_ref = db.collection('jobs')
    jobs_with_modifications = []
    
    print("\n📊 Scanning jobs for user modifications...")
    
    try:
        for job_doc in jobs_ref.stream():
            job_data = job_doc.to_dict()
            job_id = job_doc.id
            
            user_modifications = job_data.get('user_modifications', [])
            
            if user_modifications:
                jobs_with_modifications.append({
                    'job_id': job_id,
                    'user_email': job_data.get('user_email'),
                    'status': job_data.get('status'),
                    'modification_count': len(user_modifications),
                    'modifications': user_modifications
                })
                
                print(f"  📝 Job {job_id[:8]}... has {len(user_modifications)} modifications")
        
        if not jobs_with_modifications:
            print("  🔍 No jobs with user modifications found yet")
            print("  💡 Process a file and make some edits to see data appear here")
        else:
            print(f"\n📈 Analysis Results:")
            print(f"  • Total jobs with modifications: {len(jobs_with_modifications)}")
            
            # Analyze modification patterns
            total_modifications = sum(job['modification_count'] for job in jobs_with_modifications)
            print(f"  • Total user modifications captured: {total_modifications}")
            
            # Show sample job structure
            if jobs_with_modifications:
                sample_job = jobs_with_modifications[0]
                print(f"\n📋 Sample Job Structure:")
                print(f"  Job ID: {sample_job['job_id']}")
                print(f"  User: {sample_job['user_email']}")
                print(f"  Status: {sample_job['status']}")
                print(f"  Modifications: {sample_job['modification_count']}")
                
                if sample_job['modifications']:
                    sample_mod = sample_job['modifications'][0]
                    print(f"\n📱 Sample Modification:")
                    print(f"    • Event Type: {sample_mod.get('event_type')}")
                    print(f"    • Timestamp: {sample_mod.get('timestamp')}")
                    print(f"    • Is Modified: {sample_mod.get('is_modified')}")
                    print(f"    • Change Count: {sample_mod.get('change_count')}")
                    print(f"    • Session ID: {sample_mod.get('session_id', 'N/A')}")
    
    except Exception as e:
        print(f"❌ Error querying jobs: {e}")
    
    print(f"\n🎯 New Data Structure Benefits:")
    print(f"  ✅ Single source of truth per job")
    print(f"  ✅ Complete job lifecycle in one document")
    print(f"  ✅ Easy accuracy analysis")
    print(f"  ✅ Reduced data fragmentation")
    print(f"  ✅ Better performance for job-based queries")
    
    print(f"\n🔗 API Endpoints Available:")
    print(f"  • GET /get-job-with-modifications/<job_id> - Complete job analysis")
    print(f"  • POST /capture-data-state - Captures append to job documents")
    print(f"  • POST /capture-data-state-beacon - Beacon captures also append to jobs")

if __name__ == "__main__":
    test_job_structure()