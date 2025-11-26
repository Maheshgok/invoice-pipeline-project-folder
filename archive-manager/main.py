"""
Archive Manager Cloud Run Service

Handles moving completed invoice results from active collection to archive
for better real-time performance and simplified querying.

Endpoints:
- POST /archive-completed: Archive all completed results for a user
- POST /archive-displayed: Archive all displayed results for a user  
- GET /health: Health check
"""

import os
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from flask import Flask, request, jsonify
from flask_cors import CORS
from google.cloud import firestore
from google.auth.transport import requests
from google.oauth2 import id_token

# Initialize Flask app
app = Flask(__name__)
CORS(app, origins=["*"])

# Initialize Firestore
db = firestore.Client()

# Collections
ACTIVE_COLLECTION = 'invoice_results'
ARCHIVE_COLLECTION = 'invoice_results_archive'

# Environment variables
PROJECT_ID = os.getenv('GOOGLE_CLOUD_PROJECT', 'watch-mail-trial')

def verify_firebase_token(auth_header: str) -> Optional[Dict]:
    """Verify Firebase ID token and return user info"""
    try:
        if not auth_header or not auth_header.startswith('Bearer '):
            return None
        
        id_token_str = auth_header.split('Bearer ')[1]
        decoded_token = id_token.verify_firebase_token(
            id_token_str, 
            requests.Request(),
            audience=PROJECT_ID
        )
        return decoded_token
    except Exception as e:
        print(f"❌ Token verification failed: {e}")
        return None

def get_user_email_from_request() -> Optional[str]:
    """Extract user email from Authorization header"""
    auth_header = request.headers.get('Authorization')
    user_info = verify_firebase_token(auth_header)
    
    if not user_info:
        return None
    
    return user_info.get('email')

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'archive-manager',
        'timestamp': datetime.utcnow().isoformat(),
        'version': '1.0.0'
    })

@app.route('/archive-completed', methods=['POST'])
def archive_completed_results():
    """
    Archive all completed results for the authenticated user
    This moves completed items from active collection to archive
    """
    user_email = get_user_email_from_request()
    if not user_email:
        return jsonify({'error': 'Authentication required'}), 401
    
    try:
        # Query for completed results for this user
        active_ref = db.collection(ACTIVE_COLLECTION)
        completed_query = active_ref.where('user_email', '==', user_email)\
                                   .where('status', '==', 'completed')
        
        completed_docs = completed_query.get()
        
        if not completed_docs:
            return jsonify({
                'message': 'No completed results to archive',
                'archived_count': 0,
                'user_email': user_email
            })
        
        # Archive documents in batches
        batch = db.batch()
        archived_count = 0
        batch_size = 500  # Firestore batch limit
        
        for doc in completed_docs:
            if archived_count >= batch_size:
                # Commit current batch and start new one
                batch.commit()
                batch = db.batch()
                archived_count = 0
            
            # Add document to archive with additional metadata
            doc_data = doc.to_dict()
            doc_data['archived_at'] = datetime.utcnow().isoformat()
            doc_data['archive_reason'] = 'completed_auto_archive'
            doc_data['original_doc_id'] = doc.id
            
            # Add to archive
            archive_ref = db.collection(ARCHIVE_COLLECTION).document()
            batch.set(archive_ref, doc_data)
            
            # Delete from active collection
            batch.delete(doc.reference)
            
            archived_count += 1
        
        # Commit final batch
        if archived_count > 0:
            batch.commit()
        
        print(f"✅ Archived {len(completed_docs)} completed results for user: {user_email}")
        
        return jsonify({
            'message': 'Completed results archived successfully',
            'archived_count': len(completed_docs),
            'user_email': user_email,
            'archive_timestamp': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        print(f"❌ Archive error: {e}")
        return jsonify({'error': f'Archive failed: {str(e)}'}), 500

@app.route('/archive-displayed', methods=['POST'])
def archive_displayed_results():
    """
    Archive all displayed results for the authenticated user
    This moves displayed items from active collection to archive
    """
    user_email = get_user_email_from_request()
    if not user_email:
        return jsonify({'error': 'Authentication required'}), 401
    
    try:
        # Query for displayed results for this user
        active_ref = db.collection(ACTIVE_COLLECTION)
        displayed_query = active_ref.where('user_email', '==', user_email)\
                                   .where('frontend_status', '==', 'displayed')
        
        displayed_docs = displayed_query.get()
        
        if not displayed_docs:
            return jsonify({
                'message': 'No displayed results to archive',
                'archived_count': 0,
                'user_email': user_email
            })
        
        # Archive documents in batches
        batch = db.batch()
        archived_count = 0
        batch_size = 500
        
        for doc in displayed_docs:
            if archived_count >= batch_size:
                batch.commit()
                batch = db.batch()
                archived_count = 0
            
            # Add document to archive with metadata
            doc_data = doc.to_dict()
            doc_data['archived_at'] = datetime.utcnow().isoformat()
            doc_data['archive_reason'] = 'displayed_auto_archive'
            doc_data['original_doc_id'] = doc.id
            
            # Add to archive
            archive_ref = db.collection(ARCHIVE_COLLECTION).document()
            batch.set(archive_ref, doc_data)
            
            # Delete from active collection
            batch.delete(doc.reference)
            
            archived_count += 1
        
        # Commit final batch
        if archived_count > 0:
            batch.commit()
        
        print(f"✅ Archived {len(displayed_docs)} displayed results for user: {user_email}")
        
        return jsonify({
            'message': 'Displayed results archived successfully',
            'archived_count': len(displayed_docs),
            'user_email': user_email,
            'archive_timestamp': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        print(f"❌ Archive error: {e}")
        return jsonify({'error': f'Archive failed: {str(e)}'}), 500

@app.route('/archive-all-old', methods=['POST'])
def archive_old_results():
    """
    Archive all results older than specified days for the authenticated user
    Default: 7 days
    """
    user_email = get_user_email_from_request()
    if not user_email:
        return jsonify({'error': 'Authentication required'}), 401
    
    # Get days parameter (default 7)
    data = request.get_json() or {}
    days_old = data.get('days_old', 7)
    
    try:
        # Calculate cutoff date
        cutoff_date = datetime.utcnow() - timedelta(days=days_old)
        cutoff_iso = cutoff_date.isoformat()
        
        # Query for old results for this user
        active_ref = db.collection(ACTIVE_COLLECTION)
        old_query = active_ref.where('user_email', '==', user_email)\
                             .where('created_at', '<', cutoff_iso)
        
        old_docs = old_query.get()
        
        if not old_docs:
            return jsonify({
                'message': f'No results older than {days_old} days to archive',
                'archived_count': 0,
                'user_email': user_email,
                'cutoff_date': cutoff_iso
            })
        
        # Archive documents
        batch = db.batch()
        archived_count = 0
        
        for doc in old_docs:
            if archived_count >= 500:
                batch.commit()
                batch = db.batch()
                archived_count = 0
            
            # Add document to archive
            doc_data = doc.to_dict()
            doc_data['archived_at'] = datetime.utcnow().isoformat()
            doc_data['archive_reason'] = f'age_based_archive_{days_old}days'
            doc_data['original_doc_id'] = doc.id
            
            # Add to archive
            archive_ref = db.collection(ARCHIVE_COLLECTION).document()
            batch.set(archive_ref, doc_data)
            
            # Delete from active collection
            batch.delete(doc.reference)
            
            archived_count += 1
        
        # Commit final batch
        if archived_count > 0:
            batch.commit()
        
        print(f"✅ Archived {len(old_docs)} old results for user: {user_email}")
        
        return jsonify({
            'message': f'Results older than {days_old} days archived successfully',
            'archived_count': len(old_docs),
            'user_email': user_email,
            'cutoff_date': cutoff_iso,
            'archive_timestamp': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        print(f"❌ Archive error: {e}")
        return jsonify({'error': f'Archive failed: {str(e)}'}), 500

@app.route('/get-archived', methods=['GET'])
def get_archived_results():
    """
    Retrieve archived results for the authenticated user
    Supports pagination and date filtering
    """
    user_email = get_user_email_from_request()
    if not user_email:
        return jsonify({'error': 'Authentication required'}), 401
    
    try:
        # Get query parameters
        limit = min(int(request.args.get('limit', 50)), 500)  # Max 500
        page = int(request.args.get('page', 1))
        days_back = int(request.args.get('days_back', 30))  # Default 30 days
        
        # Calculate offset
        offset = (page - 1) * limit
        
        # Date filter
        cutoff_date = datetime.utcnow() - timedelta(days=days_back)
        cutoff_iso = cutoff_date.isoformat()
        
        # Query archived results
        archive_ref = db.collection(ARCHIVE_COLLECTION)
        query = archive_ref.where('user_email', '==', user_email)\
                          .where('archived_at', '>=', cutoff_iso)\
                          .order_by('archived_at', direction=firestore.Query.DESCENDING)\
                          .limit(limit)\
                          .offset(offset)
        
        archived_docs = query.get()
        
        results = []
        for doc in archived_docs:
            doc_data = doc.to_dict()
            doc_data['archive_doc_id'] = doc.id
            results.append(doc_data)
        
        return jsonify({
            'results': results,
            'count': len(results),
            'page': page,
            'limit': limit,
            'days_back': days_back,
            'user_email': user_email
        })
        
    except Exception as e:
        print(f"❌ Get archived error: {e}")
        return jsonify({'error': f'Failed to retrieve archived results: {str(e)}'}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    app.run(debug=True, host='0.0.0.0', port=port)