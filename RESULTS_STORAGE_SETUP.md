# Results Storage Setup - User-Isolated Download Feature

## Overview
Added user-isolated `results/` folder at the same level as `raw/` for storing final processing results with download links.

## Implementation

### 1. Workspace Structure (Updated)
Each user's bucket now has:
```
watch_mail_trial_invoice_{uid[:8]}/
├── raw/              # Original uploads
├── results/          # ← NEW: Final results for download
├── processed/        # Intermediate processing
├── archived/         # Archived results
└── temp/             # Temporary files
```

### 2. New Endpoints (initial-api)

#### POST `/store-result`
Store final processing result to user's results folder
```json
{
  "job_id": "DOC-ABC-XYZ",
  "user_uid": "firebase_uid",
  "result_data": {...},
  "filename": "optional_custom_name.json"
}
```

Response:
```json
{
  "status": "success",
  "job_id": "DOC-ABC-XYZ",
  "gcs_path": "gs://watch_mail_trial_invoice_abc123de/results/DOC-ABC-XYZ_result.json",
  "download_url": "https://storage.googleapis.com/...",
  "expires_in_hours": 24
}
```

#### GET `/get-download-url/<job_id>`
Get or regenerate download URL for a completed job
```bash
GET /get-download-url/DOC-ABC-XYZ?expiration_hours=24
Authorization: Bearer {firebase_token}
```

Response:
```json
{
  "status": "success",
  "job_id": "DOC-ABC-XYZ",
  "download_url": "https://storage.googleapis.com/...",
  "expires_in_hours": 24,
  "gcs_path": "gs://watch_mail_trial_invoice_abc123de/results/DOC-ABC-XYZ_result.json"
}
```

### 3. Data-Combiner Integration
Updated `data-combiner/main.py` to automatically store results to GCS after Firestore write:

```python
# After Firestore batch commit
gcs_storage = store_result_to_gcs(user_uid, job_id, invoice_result)

if gcs_storage['success']:
    # Update Firestore with GCS path
    main_doc_ref.update({
        'result_gcs_path': gcs_storage['gcs_path'],
        'result_stored_at': datetime.now().isoformat()
    })
```

### 4. Security Features

✅ **User Isolation**: Each user can only access their own results folder
✅ **Authentication**: Firebase ID token required for all operations
✅ **Signed URLs**: Temporary download links (default 24 hours)
✅ **Path Verification**: User UID in request must match authenticated user
✅ **Firestore Tracking**: Download URLs logged for audit trail

### 5. Usage Flow

#### For Cloud Run Services (Backend)
```python
import requests

# After processing completes, store result
response = requests.post(
    'https://initial-api-xxx.run.app/store-result',
    headers={'Authorization': f'Bearer {firebase_token}'},
    json={
        'job_id': job_id,
        'user_uid': user_uid,
        'result_data': final_result
    }
)

download_url = response.json()['download_url']
# Share download_url with user via Firestore or frontend
```

#### For Frontend (User Download)
```typescript
// 1. Get download URL from Firestore
const jobDoc = await getDoc(doc(db, `users/${uid}/invoice_results/${jobId}`))
let downloadUrl = jobDoc.data()?.result_download_url

// 2. If expired or missing, regenerate
if (!downloadUrl || isExpired(jobDoc.data()?.download_url_expires_at)) {
  const response = await fetch(
    `${API_URL}/get-download-url/${jobId}`,
    { headers: { Authorization: `Bearer ${idToken}` } }
  )
  downloadUrl = response.json().download_url
}

// 3. Download file
window.open(downloadUrl, '_blank')
```

### 6. Firestore Document Updates
Invoice result documents now include:
```json
{
  "id": "DOC-ABC-XYZ",
  "status": "completed",
  "journal_entries": [...],
  "result_gcs_path": "gs://watch_mail_trial_invoice_abc123de/results/DOC-ABC-XYZ_result.json",
  "result_download_url": "https://storage.googleapis.com/...",
  "result_stored_at": "2026-01-26T10:00:00Z",
  "download_url_expires_at": "2026-01-27T10:00:00Z",
  "download_url_generated_at": "2026-01-26T10:00:00Z"
}
```

### 7. File Structure Per User

```
User's Bucket: watch_mail_trial_invoice_abc123de/
│
├── raw/
│   └── 2026/01/26/10-30-45_invoice_001.pdf
│
├── results/                                      ← NEW
│   ├── DOC-ABC-XYZ789_result.json               ← Final result
│   ├── DOC-DEF-XYZ456_result.json
│   └── DOC-GHI-XYZ123_result.json
│
├── processed/
│   └── ...
│
├── archived/
│   └── ...
│
└── temp/
    └── ...
```

### 8. Deployment Steps

1. **Update initial-api**:
```bash
cd initial-api/Cloudrun_version
gcloud run deploy initial-api --source . --region=asia-south1
```

2. **Update data-combiner**:
```bash
cd data-combiner
gcloud run deploy data-combiner --source . --region=asia-south1
```

3. **Verify workspace initialization**:
```bash
# New users will get results/ folder automatically
# Existing users: manually create or trigger workspace re-init
```

### 9. Testing

```bash
# 1. Store a result (from data-combiner or manual)
curl -X POST https://initial-api-xxx.run.app/store-result \
  -H "Authorization: Bearer ${FIREBASE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "TEST-001",
    "user_uid": "firebase_uid_abc123",
    "result_data": {"test": "data"}
  }'

# 2. Get download URL
curl https://initial-api-xxx.run.app/get-download-url/TEST-001?expiration_hours=1 \
  -H "Authorization: Bearer ${FIREBASE_TOKEN}"

# 3. Download file (use URL from step 2)
curl -o result.json "${DOWNLOAD_URL}"
```

### 10. Monitoring

```bash
# Check if results folder exists
gsutil ls gs://watch_mail_trial_invoice_abc123de/results/

# List all result files for a user
gsutil ls gs://watch_mail_trial_invoice_abc123de/results/*.json

# Check file metadata
gsutil stat gs://watch_mail_trial_invoice_abc123de/results/DOC-ABC-XYZ_result.json
```

## Changes Summary

### Files Modified:
1. ✅ `initial-api/Cloudrun_version/workspace_manager.py` - Added results folder to workspace structure
2. ✅ `initial-api/Cloudrun_version/main.py` - Added helper functions and endpoints
3. ✅ `data-combiner/main.py` - Added GCS storage client and result storage logic

### New Functionality:
- ✅ User-isolated results/ folder created during workspace init
- ✅ Helper function to generate result storage paths
- ✅ Signed URL generation with configurable expiration
- ✅ Store result endpoint with authentication
- ✅ Get/regenerate download URL endpoint
- ✅ Automatic GCS storage after Firestore write in data-combiner
- ✅ Firestore tracking of download URLs and expiration

### Security:
- ✅ User UID verification on every request
- ✅ Separate buckets per user (physical isolation)
- ✅ Firebase authentication required
- ✅ Signed URLs with expiration (default 24h)
- ✅ Audit trail in Firestore

## Next Steps

1. **Frontend Integration**: Update frontend to display download buttons with signed URLs
2. **Cleanup Policy**: Add lifecycle rule to delete old result files (e.g., 30 days)
3. **Monitoring**: Add Cloud Monitoring alerts for failed GCS writes
4. **Rate Limiting**: Add rate limits on download URL generation
5. **Bulk Download**: Add endpoint to generate ZIP of multiple results

---
*Implementation Date: January 26, 2026*
*Status: ✅ READY FOR TESTING*
