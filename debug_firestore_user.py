#!/usr/bin/env python3
"""
Debug script to check Firestore collections and data for user maheshgok@gmail.com
"""
import os
import json
from google.cloud import firestore

def check_firestore_data():
    print("FIRESTORE DEBUG SCRIPT")
    print("=" * 50)
    
    # Initialize Firestore
    db = firestore.Client(project='watch-mail-trial')
    
    # User details from logs
    user_uid = 'gYJ1KMiMyGcWXzv61vINKruX0ix1'
    user_email = 'maheshgok@gmail.com'
    
    print(f"User checking data for user: {user_email}")
    print(f"User UID: {user_uid}")
    print()
    
    # 1. Check user document
    print("1 CHECKING USER DOCUMENT:")
    user_doc_ref = db.collection('users').document(user_uid)
    user_doc = user_doc_ref.get()
    
    if user_doc.exists:
        user_data = user_doc.to_dict()
        print(f"   User document exists")
        print(f"   Email: {user_data.get('email', 'NOT SET')}")
        print(f"   Organization ID: {user_data.get('organizationId', 'NOT SET')}")
        print(f"   Workspace Initialized: {user_data.get('workspace_initialized', 'NOT SET')}")
        print(f"   Payment Status: {user_data.get('paymentStatus', {}).get('status', 'NOT SET')}")
    else:
        print("   User document DOES NOT EXIST")
    print()
    
    # 2. Check user's invoice_results collection
    print("2 CHECKING USER'S INVOICE_RESULTS COLLECTION:")
    collection_path = f'users/{user_uid}/invoice_results'
    print(f"   Collection path: {collection_path}")
    
    results_ref = db.collection(collection_path)
    results = list(results_ref.stream())
    
    print(f"   Found {len(results)} documents")
    
    if results:
        for doc in results:
            doc_data = doc.to_dict()
            print(f"   Document ID: {doc.id}")
            print(f"      Created: {doc_data.get('created_at', 'NOT SET')}")
            print(f"      Status: {doc_data.get('status', 'NOT SET')}")
            print(f"      User Email: {doc_data.get('user_email', 'NOT SET')}")
            print(f"      User UID: {doc_data.get('userUID', 'NOT SET')}")
            print(f"      Bucket Path: {doc_data.get('bucket_path', 'NOT SET')}")
            
            # Check if result data exists
            if 'result' in doc_data:
                result = doc_data['result']
                if isinstance(result, dict) and 'extracted_data' in result:
                    extracted = result['extracted_data']
                    print(f"      Total Amount: {extracted.get('total_amount', 'NOT FOUND')}")
                    print(f"      Vendor: {extracted.get('vendor_name', 'NOT FOUND')}")
                else:
                    print(f"      Result data structure unexpected")
            else:
                print(f"      No result data found")
            print()
    else:
        print("   No documents found in invoice_results collection")
    
    print()
    
    # 3. Check if there are documents in the old/wrong collections
    print("3 CHECKING OTHER POSSIBLE COLLECTIONS:")
    
    # Check root invoice_results (old structure)
    print("   Checking root 'invoice_results' collection:")
    root_results = list(db.collection('invoice_results').where('userUID', '==', user_uid).stream())
    print(f"      Found {len(root_results)} documents")
    
    # Check processing_tasks
    print("   Checking 'processing_tasks' collection:")
    tasks = list(db.collection('processing_tasks').where('user_uid', '==', user_uid).stream())
    print(f"      Found {len(tasks)} documents")
    
    print()
    print("=" * 50)
    print("DEBUG COMPLETE")

if __name__ == "__main__":
    check_firestore_data()