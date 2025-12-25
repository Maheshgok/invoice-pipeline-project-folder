#!/usr/bin/env python3
"""
Debug script to check Firestore collections for recent results
Helps identify where results are being stored and what data is missing
"""
import os
import sys
from datetime import datetime, timedelta
from google.cloud import firestore

def main():
    # Initialize Firestore client
    db = firestore.Client()
    
    print("🔍 Firestore Collection Debug Script")
    print("=====================================")
    
    # Check different collection paths
    collections_to_check = [
        "invoice_results",  # Legacy root collection
        "cloud_tasks",     # Task tracking collection
        "organizations/test-org-id/invoice_results",  # Example org collection
    ]
    
    for collection_path in collections_to_check:
        print(f"\n📂 Checking collection: {collection_path}")
        print("-" * 60)
        
        try:
            # Get recent documents (last 24 hours)
            yesterday = datetime.now() - timedelta(hours=24)
            
            collection_ref = db.collection(collection_path)
            
            # Try to get recent documents
            docs = collection_ref.limit(10).stream()
            doc_count = 0
            
            for doc in docs:
                doc_count += 1
                data = doc.to_dict()
                
                print(f"📄 Document ID: {doc.id}")
                print(f"   Status: {data.get('status', 'N/A')}")
                print(f"   User Email: {data.get('user_email', data.get('userEmail', 'N/A'))}")
                print(f"   User UID: {data.get('userUID', data.get('user_uid', 'N/A'))}")
                print(f"   Organization: {data.get('organizationId', data.get('organization_id', 'N/A'))}")
                print(f"   Created: {data.get('created_at', data.get('createdAt', 'N/A'))}")
                print(f"   Job ID: {data.get('job_id', data.get('jobId', 'N/A'))}")
                
                if data.get('status') == 'completed':
                    result_data = data.get('result', data.get('extractedData'))
                    if result_data:
                        result_keys = list(result_data.keys()) if isinstance(result_data, dict) else ['(not dict)']
                        print(f"   Result keys: {result_keys[:5]}...")  # Show first 5 keys
                
                print()
                
            print(f"Total documents found: {doc_count}")
            
        except Exception as e:
            print(f"❌ Error accessing collection: {e}")
    
    # Check for recent Cloud Tasks
    print(f"\n🔄 Checking recent Cloud Tasks...")
    print("-" * 60)
    
    try:
        tasks_collection = db.collection('cloud_tasks')
        recent_tasks = tasks_collection.where('created_at', '>', yesterday).limit(10).stream()
        
        task_count = 0
        for task_doc in recent_tasks:
            task_count += 1
            task_data = task_doc.to_dict()
            
            print(f"📋 Task ID: {task_doc.id}")
            print(f"   Status: {task_data.get('status', 'N/A')}")
            print(f"   User: {task_data.get('user_email', 'N/A')}")
            print(f"   Created: {task_data.get('created_at', 'N/A')}")
            print(f"   Completed: {task_data.get('completed_at', 'N/A')}")
            print()
            
        print(f"Recent tasks found: {task_count}")
        
    except Exception as e:
        print(f"❌ Error accessing tasks: {e}")

if __name__ == "__main__":
    main()