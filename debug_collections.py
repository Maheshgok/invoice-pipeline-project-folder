"""
Firestore Collection Checker
Run this to see what collections exist and where data is stored
"""

from google.cloud import firestore
import os

# Set up Firestore client
db = firestore.Client()

def check_collections():
    print("🔍 Checking Firestore Collections...")
    
    # Check root level collections
    print("\n📁 Root Level Collections:")
    for collection in db.collections():
        print(f"  - {collection.id}")
        if collection.id == 'invoice_results':
            # Check recent documents in legacy collection
            docs = collection.limit(5).stream()
            print(f"    Recent documents:")
            for doc in docs:
                data = doc.to_dict()
                print(f"      {doc.id}: {data.get('userEmail', 'no email')} - {data.get('status', 'no status')}")
    
    # Check if organizations collection exists
    try:
        orgs_collection = db.collection('organizations')
        orgs = list(orgs_collection.limit(3).stream())
        if orgs:
            print(f"\n🏢 Organizations Collection ({len(orgs)} organizations):")
            for org_doc in orgs:
                org_id = org_doc.id
                print(f"  - Organization: {org_id}")
                # Check for invoice_results subcollection
                results_collection = org_doc.reference.collection('invoice_results')
                results = list(results_collection.limit(3).stream())
                if results:
                    print(f"    📊 invoice_results: {len(results)} documents")
                    for result_doc in results:
                        data = result_doc.to_dict()
                        print(f"      {result_doc.id}: {data.get('userEmail', 'no email')} - {data.get('status', 'no status')}")
                else:
                    print("    📊 invoice_results: No documents")
        else:
            print("\n🏢 Organizations Collection: Empty or doesn't exist")
    except Exception as e:
        print(f"\n❌ Error checking organizations: {e}")
    
    # Check users collection
    try:
        users_collection = db.collection('users')
        users = list(users_collection.limit(3).stream())
        if users:
            print(f"\n👤 Users Collection ({len(users)} users):")
            for user_doc in users:
                user_id = user_doc.id
                print(f"  - User: {user_id}")
                # Check for invoice_results subcollection
                results_collection = user_doc.reference.collection('invoice_results')
                results = list(results_collection.limit(3).stream())
                if results:
                    print(f"    📊 invoice_results: {len(results)} documents")
                    for result_doc in results:
                        data = result_doc.to_dict()
                        print(f"      {result_doc.id}: {data.get('userEmail', 'no email')} - {data.get('status', 'no status')}")
                else:
                    print("    📊 invoice_results: No documents")
        else:
            print("\n👤 Users Collection: Empty or doesn't exist")
    except Exception as e:
        print(f"\n❌ Error checking users: {e}")

if __name__ == "__main__":
    check_collections()