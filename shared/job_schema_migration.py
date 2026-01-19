"""
Job Schema Migration - Safe Fail Handler Support

This migration is BACKWARD COMPATIBLE.
No data loss or breaking changes.

New Fields Added to Job Documents:
- retry_count: int (default 0)
- last_error_type: str (only on RETRYING)
- last_error_msg: str (only on RETRYING)
- retry_scheduled_for: str (ISO timestamp, only on RETRYING)
- error_type: str (only on ERROR)
- error_message: str (only on ERROR)
- failed_at: str (ISO timestamp, only on ERROR)

Old jobs without these fields will continue to work:
- If status is EXTRACTED/ENRICHED → proceeds normally
- If status is FAILED/ERROR → stays terminal
- If new RETRYING status added → will have retry fields

Firestore Rules Update:
No rule changes needed.
Service account can write these fields.
Users can read their own job documents.
"""

from google.cloud import firestore
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


def migrate_jobs_add_retry_fields(project_id: str, tenant_id: str, dry_run: bool = True):
    """
    Add retry tracking fields to existing jobs.
    
    Args:
        project_id: GCP project ID
        tenant_id: Tenant ID
        dry_run: If True, only report what would be changed
    """
    db = firestore.Client(project=project_id)
    jobs_ref = db.collection('tenants').document(tenant_id).collection('jobs')
    
    jobs = jobs_ref.stream()
    updated_count = 0
    
    for job_doc in jobs:
        job_data = job_doc.to_dict()
        job_id = job_doc.id
        
        # Skip if already has retry fields
        if 'retry_count' in job_data:
            continue
        
        # Determine what needs updating
        updates = {}
        
        # Add retry_count based on current status
        if job_data.get('status') == 'FAILED':
            # Old FAILED status → convert to ERROR with max retries
            updates['status'] = 'ERROR'
            updates['retry_count'] = 3
            updates['error_type'] = 'unknown'
            updates['error_message'] = job_data.get('error', 'Job failed')
            updates['failed_at'] = datetime.utcnow().isoformat()
        else:
            # Normal jobs → initialize retry_count
            updates['retry_count'] = 0
        
        if not dry_run:
            job_ref = jobs_ref.document(job_id)
            job_ref.update(updates)
            logger.info(f"✅ Updated job {job_id}: {updates}")
        else:
            logger.info(f"[DRY RUN] Would update job {job_id}: {updates}")
        
        updated_count += 1
    
    logger.info(f"Migration summary: {updated_count} jobs {'updated' if not dry_run else 'would be updated'}")
    return updated_count


def create_retry_index(project_id: str):
    """
    Create Firestore composite index for retry queries.
    
    Index needed for:
    - collection: tenants/{tenant_id}/jobs
    - fields: status (Ascending), retry_scheduled_for (Ascending)
    
    This enables efficient queries like:
    db.collection('tenants').document(tenant_id).collection('jobs')
      .where('status', '==', 'RETRYING')
      .where('retry_scheduled_for', '<=', datetime.utcnow().isoformat())
      .stream()
    """
    logger.info("""
    To create the composite index, run:
    
    gcloud firestore indexes composite create \\
      --collection-group=jobs \\
      --field-config field-path=status,order=ascending \\
      --field-config field-path=retry_scheduled_for,order=ascending \\
      --project {project_id}
    
    Or manually in Firebase Console:
    1. Go to Firestore → Indexes → Composite
    2. Add index:
       Collection: tenants/{tenant_id}/jobs
       Fields: 
         - status (Ascending)
         - retry_scheduled_for (Ascending)
    """.format(project_id=project_id))


def query_retryable_jobs(project_id: str, tenant_id: str):
    """
    Query jobs that are scheduled for retry and are ready.
    Called by Cloud Scheduler to trigger retries.
    """
    db = firestore.Client(project=project_id)
    now = datetime.utcnow().isoformat()
    
    query = (
        db.collection('tenants').document(tenant_id).collection('jobs')
        .where('status', '==', 'RETRYING')
        .where('retry_scheduled_for', '<=', now)
        .limit(100)  # Batch size
    )
    
    retryable_jobs = []
    for job_doc in query.stream():
        retryable_jobs.append({
            'job_id': job_doc.id,
            'tenant_id': tenant_id,
            'retry_count': job_doc.get('retry_count', 0),
            'retry_scheduled_for': job_doc.get('retry_scheduled_for')
        })
    
    logger.info(f"Found {len(retryable_jobs)} jobs ready for retry")
    return retryable_jobs


# Backward Compatibility Helper
def get_error_info(job_data: dict) -> dict:
    """
    Extract error info from job, handling both old and new formats.
    
    Old format: status='FAILED', error='...'
    New format: status='ERROR', error_type='...', error_message='...'
    """
    if job_data.get('status') == 'ERROR':
        return {
            'type': job_data.get('error_type', 'unknown'),
            'message': job_data.get('error_message', 'Unknown error'),
            'failed_at': job_data.get('failed_at'),
            'retry_attempts': job_data.get('retry_count', 0)
        }
    elif job_data.get('status') == 'FAILED':
        # Old format
        return {
            'type': 'failed',
            'message': job_data.get('error', 'Job failed'),
            'failed_at': job_data.get('updated_at'),
            'retry_attempts': 0
        }
    elif job_data.get('status') == 'RETRYING':
        return {
            'type': job_data.get('last_error_type', 'unknown'),
            'message': job_data.get('last_error_msg', 'Will retry'),
            'retry_scheduled_for': job_data.get('retry_scheduled_for'),
            'retry_attempts': job_data.get('retry_count', 0)
        }
    else:
        return {}


if __name__ == '__main__':
    import sys
    
    project_id = sys.argv[1] if len(sys.argv) > 1 else 'watch-mail-trial'
    tenant_id = sys.argv[2] if len(sys.argv) > 2 else 'default'
    dry_run = '--dry-run' in sys.argv
    
    logging.basicConfig(level=logging.INFO)
    
    print(f"Migrating jobs for project={project_id}, tenant={tenant_id}, dry_run={dry_run}")
    
    # Run migration
    migrate_jobs_add_retry_fields(project_id, tenant_id, dry_run=dry_run)
    
    # Show index creation steps
    if not dry_run:
        create_retry_index(project_id)
