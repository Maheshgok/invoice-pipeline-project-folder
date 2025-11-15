#!/usr/bin/env python3
"""
Simple script to clear Firestore collections for testing.
"""

import os
from google.cloud import firestore

def main():
    print("🔥 Simple Firestore Cleanup")
    print("=" * 30)
    
    # Initialize Firestore
    try:
        db = firestore.Client()
        print("✅ Connected to Firestore")
    except Exception as e:
        print(f"❌ Error: {e}")
        return
    
    # List main collections to clear
    collections = ['jobs', 'results', 'data_captures', 'users', 'user_queues']
    
    print(f"\n⚠️  This will delete all documents from: {', '.join(collections)}")
    confirm = input("Type 'yes' to continue: ")
    
    if confirm.lower() != 'yes':
        print("❌ Cancelled")
        return
    
    total_deleted = 0
    
    for collection_name in collections:
        print(f"\n📂 Clearing {collection_name}...")
        try:
            # Get all documents in collection
            docs = db.collection(collection_name).stream()
            count = 0
            
            for doc in docs:
                doc.reference.delete()
                count += 1
                if count % 10 == 0:
                    print(f"   Deleted {count} documents...")
            
            print(f"   ✅ Deleted {count} documents from {collection_name}")
            total_deleted += count
            
        except Exception as e:
            print(f"   ❌ Error with {collection_name}: {e}")
    
    print(f"\n🎉 Total deleted: {total_deleted} documents")
    print("✨ Firestore is now clean!")

if __name__ == "__main__":
    main()