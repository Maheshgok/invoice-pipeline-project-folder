"""
Debug specific document to see what data is actually stored
"""

from google.cloud import firestore
import json

db = firestore.Client()

def debug_document(doc_id):
    print(f"🔍 Debugging document: {doc_id}")
    
    # Get document from root collection
    doc_ref = db.collection('invoice_results').document(doc_id)
    doc = doc_ref.get()
    
    if doc.exists:
        data = doc.to_dict()
        print(f"📄 Document data:")
        for key, value in data.items():
            if isinstance(value, str) and len(value) > 100:
                print(f"  {key}: {value[:100]}... (truncated)")
            else:
                print(f"  {key}: {value}")
    else:
        print("❌ Document not found")

if __name__ == "__main__":
    # Debug one of the recent documents
    debug_document("DD7-062702-57C3")