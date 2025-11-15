#!/usr/bin/env python3
"""
Script to clear all old data from Firestore collections for fresh testing.
This will delete all documents from the main collections used by the invoice pipeline.
"""

import os
import sys
from google.cloud import firestore
from typing import List, Dict

def delete_collection(db: firestore.Client, collection_name: str, batch_size: int = 100) -> int:
    """
    Delete all documents in a collection in batches.
    
    Args:
        db: Firestore client
        collection_name: Name of the collection to clear
        batch_size: Number of documents to delete per batch
        
    Returns:
        Total number of documents deleted
    """
    collection_ref = db.collection(collection_name)
    docs = collection_ref.limit(batch_size).stream()
    deleted = 0

    for doc in docs:
        print(f'Deleting doc {doc.id} from {collection_name}')
        doc.reference.delete()
        deleted += 1

    if deleted >= batch_size:
        # Recursively delete remaining documents
        return deleted + delete_collection(db, collection_name, batch_size)
    else:
        return deleted

def delete_subcollection_for_all_users(db: firestore.Client, subcollection_name: str) -> int:
    """
    Delete subcollections for all users.
    
    Args:
        db: Firestore client
        subcollection_name: Name of the subcollection to delete
        
    Returns:
        Total number of documents deleted
    """
    users_ref = db.collection('users')
    users = users_ref.stream()
    total_deleted = 0
    
    for user_doc in users:
        user_id = user_doc.id
        subcol_ref = users_ref.document(user_id).collection(subcollection_name)
        docs = subcol_ref.stream()
        
        for doc in docs:
            print(f'Deleting doc {doc.id} from users/{user_id}/{subcollection_name}')
            doc.reference.delete()
            total_deleted += 1
    
    return total_deleted

def delete_user_queues_subcollections(db: firestore.Client) -> int:
    """
    Delete all jobs subcollections under user_queues.
    
    Args:
        db: Firestore client
        
    Returns:
        Total number of documents deleted
    """
    user_queues_ref = db.collection('user_queues')
    users = user_queues_ref.stream()
    total_deleted = 0
    
    for user_doc in users:
        user_email = user_doc.id
        jobs_ref = user_queues_ref.document(user_email).collection('jobs')
        jobs = jobs_ref.stream()
        
        for job_doc in jobs:
            print(f'Deleting job {job_doc.id} from user_queues/{user_email}/jobs')
            job_doc.reference.delete()
            total_deleted += 1
    
    return total_deleted

def main():
    """Main function to clear all Firestore data."""
    
    print("🔥 Firestore Data Cleanup Script")
    print("=" * 50)
    
    # Initialize Firestore client
    try:
        db = firestore.Client()
        print("✅ Connected to Firestore")
    except Exception as e:
        print(f"❌ Failed to connect to Firestore: {e}")
        sys.exit(1)
    
    # Confirm before proceeding
    print("\n⚠️  WARNING: This will delete ALL data from the following collections:")
    collections_to_clear = [
        "jobs",
        "results", 
        "data_captures",
        "users (and all subcollections: job_queue, data_captures)",
        "user_queues (and all subcollections: jobs)"
    ]
    
    for collection in collections_to_clear:
        print(f"   • {collection}")
    
    print("\nThis action cannot be undone!")
    confirmation = input("\nType 'DELETE_ALL' to confirm: ")
    
    if confirmation != "DELETE_ALL":
        print("❌ Operation cancelled")
        sys.exit(0)
    
    print("\n🗑️  Starting data deletion...")
    
    total_deleted = 0
    
    # 1. Clear main collections
    main_collections = ["jobs", "results", "data_captures"]
    
    for collection_name in main_collections:
        print(f"\n📂 Clearing collection: {collection_name}")
        try:
            deleted = delete_collection(db, collection_name)
            total_deleted += deleted
            print(f"   ✅ Deleted {deleted} documents from {collection_name}")
        except Exception as e:
            print(f"   ❌ Error clearing {collection_name}: {e}")
    
    # 2. Clear user subcollections
    print(f"\n📂 Clearing user subcollections...")
    try:
        deleted_job_queue = delete_subcollection_for_all_users(db, "job_queue")
        deleted_data_captures = delete_subcollection_for_all_users(db, "data_captures")
        total_deleted += deleted_job_queue + deleted_data_captures
        print(f"   ✅ Deleted {deleted_job_queue} documents from users/*/job_queue")
        print(f"   ✅ Deleted {deleted_data_captures} documents from users/*/data_captures")
    except Exception as e:
        print(f"   ❌ Error clearing user subcollections: {e}")
    
    # 3. Clear user_queues subcollections
    print(f"\n📂 Clearing user_queues subcollections...")
    try:
        deleted_user_jobs = delete_user_queues_subcollections(db)
        total_deleted += deleted_user_jobs
        print(f"   ✅ Deleted {deleted_user_jobs} documents from user_queues/*/jobs")
    except Exception as e:
        print(f"   ❌ Error clearing user_queues subcollections: {e}")
    
    # 4. Clear user documents (but not the collection itself)
    print(f"\n📂 Clearing users collection...")
    try:
        deleted_users = delete_collection(db, "users")
        total_deleted += deleted_users
        print(f"   ✅ Deleted {deleted_users} documents from users")
    except Exception as e:
        print(f"   ❌ Error clearing users collection: {e}")
    
    # 5. Clear user_queues documents
    print(f"\n📂 Clearing user_queues collection...")
    try:
        deleted_user_queues = delete_collection(db, "user_queues")
        total_deleted += deleted_user_queues
        print(f"   ✅ Deleted {deleted_user_queues} documents from user_queues")
    except Exception as e:
        print(f"   ❌ Error clearing user_queues collection: {e}")
    
    print(f"\n🎉 Cleanup completed!")
    print(f"📊 Total documents deleted: {total_deleted}")
    print("\n✨ Your Firestore is now clean and ready for fresh testing data!")

if __name__ == "__main__":
    main()