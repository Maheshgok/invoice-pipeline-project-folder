# GCS Storage Flow - Complete Processing Pipeline

> Complete trace of how invoice data flows through the processing pipeline and where final results are stored in Google Cloud Storage and Firestore

---

## 📊 High-Level Storage Architecture

```
Customer Upload (initial-api)
    ↓
    └─→ GCS: users/{uid}/raw/{filename}
    
data-extractor-v2
    ↓
    └─→ Pub/Sub Topic: enrichment-topic
    └─→ Extracted Data (in memory, then pubsub)
    └─→ Job Status: Firestore users/{uid}/invoice_results/{job_id}
    
enrichment-worker
    ↓
    └─→ Pub/Sub Topic: standardization-topic
    └─→ Enriched Data (in memory, then pubsub)
    └─→ Job Status: Firestore users/{uid}/invoice_results/{job_id}
    
field-standardizer-v2
    ↓
    └─→ Pub/Sub Topic: combining-topic
    └─→ Standardized Data (in memory, then pubsub)
    └─→ Job Status: Firestore users/{uid}/invoice_results/{job_id}
    
data-combiner
    ↓
    └─→ GCS: users/{uid}/processed/{job_id}_final.json (optional)
    └─→ Firestore: users/{uid}/invoice_results/{job_id} (MAIN STORAGE)
    └─→ Job Status: COMPLETED
```

---

## Stage 1: File Upload (initial-api)

### Upload Endpoint
**File**: `initial-api/Cloudrun_version/main.py`
**Endpoint**: `POST /upload`

```python
@app.route('/upload', methods=['POST'])
def upload_invoice():
    """Upload invoice file and create processing job"""
    
    # 1. Verify authentication
    auth_header = request.headers.get('Authorization')
    user_uid = verify_auth_token(auth_header)
    user_email = decode_token(auth_header)['email']
    
    # 2. Get file from request
    file = request.files['file']
    filename = file.filename
    
    # 3. Store raw file in GCS
    bucket = storage_client.bucket('watch-mail-trial-invoice-processing')
    gcs_path = f'users/{user_uid}/raw/{filename}'
    blob = bucket.blob(gcs_path)
    blob.upload_from_string(file.read())
    
    logger.info(f"✅ Uploaded raw file: {gcs_path}")
    
    # 4. Create job record in Firestore
    job_id = generate_unique_job_id()
    job_ref = db.collection('users').document(user_uid)\
              .collection('invoice_results').document(job_id)
    
    job_ref.set({
        'job_id': job_id,
        'user_uid': user_uid,
        'file_name': filename,
        'file_path': gcs_path,
        'status': 'CREATED',
        'created_at': datetime.utcnow(),
        'updated_at': datetime.utcnow()
    })
    
    logger.info(f"📝 Created job record: {job_id}")
    
    # 5. Enqueue job in orchestrator pipeline
    enqueue_job_in_pipeline(job_id, user_uid, gcs_path)
    
    return jsonify({
        'status': 'success',
        'jobId': job_id,
        'gcsPath': gcs_path
    })
```

### GCS Storage After Upload
```
gs://watch-mail-trial-invoice-processing/
└── users/
    └── {uid}/
        └── raw/
            ├── invoice_001.pdf
            ├── invoice_002.jpg
            └── .gitkeep
```

### Firestore Record After Upload
**Collection**: `users/{uid}/invoice_results/`
**Document**: `{job_id}`

```json
{
  "job_id": "DOC-ABC123-XYZ789",
  "user_uid": "firebase_uid_12345",
  "file_name": "invoice_001.pdf",
  "file_path": "users/firebase_uid_12345/raw/invoice_001.pdf",
  "status": "CREATED",
  "created_at": "2026-01-25T10:00:00Z",
  "updated_at": "2026-01-25T10:00:00Z",
  "userUID": "firebase_uid_12345"
}
```

---

## Stage 2: Data Extraction (data-extractor-v2)

### Extraction Process
**File**: `data-extractor-v2/main.py`
**Service**: Processes via Cloud Tasks subscription

```python
@app.route('/extract-job', methods=['POST'])
def extract_job():
    """Extract invoice data using OpenAI Vision API"""
    
    data = request.get_json()
    job_id = data['job_id']
    user_uid = data['user_uid']
    gcs_path = data['gcs_path']  # e.g., users/{uid}/raw/invoice.pdf
    
    # 1. Download file from GCS
    bucket = storage_client.bucket('watch-mail-trial-invoice-processing')
    blob = bucket.blob(gcs_path)
    file_content = blob.download_as_bytes()
    
    logger.info(f"📥 Downloaded: {gcs_path}")
    
    # 2. Prepare image for OpenAI (convert PDF to PNG if needed)
    base64_content, mime_type = prepare_image_for_openai(file_content, gcs_path)
    
    # 3. Call OpenAI Vision API for extraction
    extracted_data = run_extraction(base64_content, mime_type)
    
    # 4. Check for soft errors (zero items = RETRYING)
    line_items = extracted_data.get('line_items', [])
    if len(line_items) == 0:
        # Soft error - mark for retry
        should_retry, reason = SafeFailHandler.should_retry(
            {'retry_count': 0}, 
            ErrorType.ZERO_ITEMS
        )
        
        if should_retry:
            # Update job status to RETRYING
            update_job_status(user_uid, job_id, 'RETRYING', 'extraction_retry_scheduled')
            logger.info(f"🔄 Job {job_id} marked for retry - zero items extracted")
            return jsonify({'status': 'retry_scheduled'})
        else:
            # Max retries exceeded
            update_job_status(user_uid, job_id, 'ERROR', 'extraction_failed')
            logger.error(f"❌ Job {job_id} - max retries exceeded for zero items")
            return jsonify({'status': 'error', 'error': 'Zero items extracted after retries'})
    
    # 5. Store extracted data (NO GCS WRITE - data stays in memory/pubsub)
    # Data flows to next stage via Pub/Sub
    
    # 6. Publish to enrichment worker via Pub/Sub
    publish_to_pubsub('enrichment-topic', {
        'job_id': job_id,
        'user_uid': user_uid,
        'extracted_data': extracted_data
    })
    
    logger.info(f"📤 Published to enrichment-worker for job {job_id}")
    
    # 7. Update job status to EXTRACTING/EXTRACTED
    update_job_status(user_uid, job_id, 'EXTRACTING', 'extraction_in_progress')
    
    return jsonify({'status': 'success', 'jobId': job_id})
```

### Firestore Update After Extraction
**Path**: `users/{uid}/invoice_results/{job_id}`

```json
{
  "job_id": "DOC-ABC123-XYZ789",
  "file_path": "users/firebase_uid_12345/raw/invoice_001.pdf",
  "status": "EXTRACTING",
  "updated_at": "2026-01-25T10:00:45Z",
  
  // Extracted data may be stored here as nested object
  "extraction_result": {
    "header": {
      "vendor_name": "ABC Supplies Ltd",
      "invoice_number": "INV-2026-001",
      "invoice_date": "2026-01-20",
      "total_amount": 5000.00
    },
    "line_items": [
      {
        "description": "Office Supplies",
        "quantity": 100,
        "unit_price": 50.00,
        "amount": 5000.00
      }
    ]
  }
}
```

### Key Points
- ✅ **NO GCS storage** of intermediate extraction results
- ✅ Data flows via **Pub/Sub** to next service
- ✅ Firestore document is updated with status
- ✅ Original file remains in `users/{uid}/raw/`

---

## Stage 3: Data Enrichment (enrichment-worker)

### Enrichment Process
**File**: `enrichment-worker/main.py`
**Service**: Consumes from Pub/Sub `enrichment-topic`

```python
def process_enrichment_message(message):
    """Enrich extracted data with business logic"""
    
    # 1. Consume from Pub/Sub
    data = json.loads(message.data.decode('utf-8'))
    job_id = data['job_id']
    user_uid = data['user_uid']
    extracted_data = data['extracted_data']
    
    logger.info(f"⚡ Received enrichment job: {job_id}")
    
    # 2. Update Firestore status
    update_job_status(user_uid, job_id, 'ENRICHING')
    
    # 3. Call OpenAI for enrichment (add HSN codes, tax categories, etc.)
    enriched_data = enrich_with_openai(extracted_data)
    
    # 4. Check for soft errors
    if not enriched_data or 'error' in enriched_data:
        should_retry, reason = SafeFailHandler.should_retry(
            {'retry_count': 0}, 
            ErrorType.ENRICHMENT_EMPTY
        )
        
        if should_retry:
            update_job_status(user_uid, job_id, 'RETRYING')
            return
        else:
            update_job_status(user_uid, job_id, 'ERROR')
            return
    
    # 5. NO GCS storage - data flows via Pub/Sub
    
    # 6. Publish to standardizer via Pub/Sub
    publish_to_pubsub('standardization-topic', {
        'job_id': job_id,
        'user_uid': user_uid,
        'extracted_data': extracted_data,
        'enriched_data': enriched_data
    })
    
    logger.info(f"📤 Published to standardizer for job {job_id}")
    
    # 7. Update Firestore status
    update_job_status(user_uid, job_id, 'ENRICHED', extra={
        'enrichment_result': enriched_data
    })
```

### Firestore Update After Enrichment
**Path**: `users/{uid}/invoice_results/{job_id}`

```json
{
  "job_id": "DOC-ABC123-XYZ789",
  "status": "ENRICHED",
  "updated_at": "2026-01-25T10:01:15Z",
  
  "enrichment_result": {
    "line_items_with_hsn": [
      {
        "description": "Office Supplies",
        "hsn_code": "4910",
        "tax_category": "GST_18",
        "gst_rate": 18,
        "amount": 5000.00,
        "tax_amount": 900.00
      }
    ]
  }
}
```

### Key Points
- ✅ **NO GCS storage** of enriched data
- ✅ Data flows via **Pub/Sub** to next service
- ✅ Optional: Enriched data stored in Firestore doc
- ✅ Original file still in `users/{uid}/raw/`

---

## Stage 4: Field Standardization (field-standardizer-v2)

### Standardization Process
**File**: `field-standardizer-v2/main.py`
**Service**: Consumes from Pub/Sub `standardization-topic`

```python
def process_standardization_message(message):
    """Standardize fields and generate journal entries"""
    
    # 1. Consume from Pub/Sub
    data = json.loads(message.data.decode('utf-8'))
    job_id = data['job_id']
    user_uid = data['user_uid']
    extracted_data = data['extracted_data']
    enriched_data = data['enriched_data']
    
    logger.info(f"🔧 Received standardization job: {job_id}")
    
    # 2. Update Firestore status
    update_job_status(user_uid, job_id, 'STANDARDIZING')
    
    # 3. Call OpenAI for standardization and journal entry generation
    standardized_result = standardize_with_openai({
        'extracted': extracted_data,
        'enriched': enriched_data
    })
    
    # Result includes:
    # - standardized_header
    # - standardized_journal_entries (with debits/credits)
    
    # 4. Check for errors
    if not standardized_result or 'error' in standardized_result:
        update_job_status(user_uid, job_id, 'ERROR')
        return
    
    # 5. NO GCS storage - data flows via Pub/Sub
    
    # 6. Publish to data-combiner via Pub/Sub
    publish_to_pubsub('combining-topic', {
        'job_id': job_id,
        'user_uid': user_uid,
        'processed_data': standardized_result
    })
    
    logger.info(f"📤 Published to data-combiner for job {job_id}")
    
    # 7. Update Firestore status
    update_job_status(user_uid, job_id, 'STANDARDIZED', extra={
        'standardized_header': standardized_result.get('standardized_header'),
        'entry_count': len(standardized_result.get('standardized_journal_entries', []))
    })
```

### Firestore Update After Standardization
**Path**: `users/{uid}/invoice_results/{job_id}`

```json
{
  "job_id": "DOC-ABC123-XYZ789",
  "status": "STANDARDIZED",
  "updated_at": "2026-01-25T10:02:00Z",
  
  "standardized_header": {
    "invoice_number": "INV-2026-001",
    "invoice_date": "2026-01-20",
    "vendor_name": "ABC Supplies Ltd",
    "vendor_gstin": "27ABCDE1234F1Z5",
    "total_amount": 5000.00,
    "tax_amount": 900.00
  },
  
  "entry_count": 5
}
```

### Key Points
- ✅ **NO GCS storage** of standardized data
- ✅ Data flows via **Pub/Sub** to next service
- ✅ Optional: Metadata stored in Firestore doc
- ✅ Original file still in `users/{uid}/raw/`

---

## Stage 5: Data Combination & Final Storage (data-combiner)

### Combination Process - FINAL STORAGE
**File**: `data-combiner/main.py`
**Endpoint**: `POST /combine-and-store` (triggered by orchestrator)

```python
@app.route('/combine-and-store', methods=['POST'])
def combine_and_store_data():
    """
    FINAL STAGE: Combine all data and store to Firestore
    This is where final results are written!
    """
    
    data = request.get_json()
    job_id = data.get('job_id')
    processed_data = data.get('processed_data')  # From standardizer
    user_context = data.get('user_context')
    job_metadata = data.get('job_metadata')
    
    user_uid = user_context.get('uid')
    
    logger.info(f"🔗 Combining and storing data for job: {job_id}")
    
    # 1. Extract components
    header_data = processed_data.get('standardized_header', {})
    journal_entries = processed_data.get('standardized_journal_entries', [])
    
    # 2. Validate accounting balance
    balance_check = validate_accounting_balance(journal_entries)
    
    # 3. Flatten journal entries for frontend (convert nested → flat)
    frontend_journal_entries = flatten_journal_entries_for_frontend(
        journal_entries, 
        header_data
    )
    
    # 4. Build final invoice result document
    invoice_result = {
        'id': job_id,
        'job_id': job_id,
        'status': 'completed',
        'original_filename': user_context.get('filename'),
        'created_at': job_metadata.get('created_at'),
        'updated_at': datetime.now().isoformat(),
        'completed_at': datetime.now().isoformat(),
        'userUID': user_uid,
        
        # ← MAIN CONTENT FOR FRONTEND
        'journal_entries': frontend_journal_entries,  # Flat format
        
        'invoice_header': {
            'vendor_name': header_data.get('vendor_name'),
            'vendor_gstin': header_data.get('vendor_gstin'),
            'invoice_number': header_data.get('invoice_number'),
            'invoice_date': header_data.get('invoice_date'),
            'total_amount': header_data.get('total_amount'),
            'tax_amount': header_data.get('tax_amount')
        },
        
        'balance_validation': balance_check,
        
        'processing_metadata': {
            'total_entries': len(frontend_journal_entries),
            'is_balanced': balance_check['is_balanced'],
            'total_debit': balance_check['total_debit'],
            'total_credit': balance_check['total_credit'],
            'stored_by': 'data_combiner'
        }
    }
    
    # 5. Get Firestore client
    db = get_firestore_client()
    
    # 6. WRITE FINAL RESULTS TO FIRESTORE (PRIMARY STORAGE)
    # Path: users/{uid}/invoice_results/{job_id}
    logger.info(f"📝 Writing final results to Firestore")
    
    batch = db.batch()
    
    # 6a. Write main document
    main_doc_ref = db.collection('users').document(user_uid)\
                    .collection('invoice_results').document(job_id)
    batch.set(main_doc_ref, invoice_result)
    
    logger.info(f"📝 Main doc: users/{user_uid}/invoice_results/{job_id}")
    
    # 6b. Write journal entries to subcollection (for detailed access)
    for idx, entry in enumerate(frontend_journal_entries):
        entry_ref = main_doc_ref.collection('journal_entries')\
                    .document(f"line_{idx}")
        batch.set(entry_ref, entry)
    
    logger.info(f"📝 Subcollection: users/{user_uid}/invoice_results/{job_id}/journal_entries/line_*")
    
    # 6c. Commit all writes atomically
    batch.commit(timeout=30.0)
    
    logger.info(f"✅ Batch committed: main doc + {len(frontend_journal_entries)} entries")
    
    # 7. OPTIONAL: Also write to GCS for backup (NOT REQUIRED)
    # This is optional - main storage is Firestore
    try:
        write_to_gcs_optional(user_uid, job_id, invoice_result)
    except Exception as e:
        logger.warning(f"⚠️ GCS backup failed (non-critical): {e}")
    
    # 8. Update job status to COMPLETED
    update_job_status(user_uid, job_id, 'COMPLETED', extra={
        'stored_entries': len(frontend_journal_entries),
        'is_balanced': balance_check['is_balanced']
    })
    
    return jsonify({
        'status': 'SUCCESS',
        'job_id': job_id,
        'storage_location': f"users/{user_uid}/invoice_results/{job_id}",
        'entries_stored': len(frontend_journal_entries),
        'is_balanced': balance_check['is_balanced']
    })
```

### GCS Storage (OPTIONAL - Backup Only)
```python
def write_to_gcs_optional(user_uid: str, job_id: str, invoice_result: dict):
    """
    OPTIONAL backup write to GCS (not required for functionality)
    """
    bucket = storage_client.bucket('watch-mail-trial-invoice-processing')
    
    # Optional: Store in processed folder
    gcs_path = f'users/{user_uid}/processed/{job_id}_final.json'
    blob = bucket.blob(gcs_path)
    blob.upload_from_string(
        json.dumps(invoice_result, indent=2, default=str)
    )
    
    logger.info(f"💾 Optional GCS backup: {gcs_path}")
```

### Primary Storage: Firestore Structure
**Collection**: `users/{uid}/invoice_results/`
**Document**: `{job_id}` (MAIN DOCUMENT)

```json
{
  "id": "DOC-ABC123-XYZ789",
  "job_id": "DOC-ABC123-XYZ789",
  "status": "completed",
  "original_filename": "invoice_001.pdf",
  "created_at": "2026-01-25T10:00:00Z",
  "updated_at": "2026-01-25T10:03:00Z",
  "completed_at": "2026-01-25T10:03:00Z",
  "userUID": "firebase_uid_12345",
  
  // MAIN CONTENT - WHAT FRONTEND USES
  "journal_entries": [
    {
      "line_number": "0_0",
      "reference_number": "INV-2026-001",
      "invoice_date": "2026-01-20",
      "vendor_name": "ABC Supplies Ltd",
      "account_name": "Purchases",
      "account_code": "5010",
      "account_type": "Expense",
      "debit_amount": 5000.00,
      "credit_amount": 0.00,
      "narration": "Purchase of office supplies",
      "item_description": "Office Supplies",
      "hsn_code": "4910",
      "tax_rate": 18,
      "gst_amount": 900.00,
      "cgst_amount": 450.00,
      "sgst_amount": 450.00,
      "igst_amount": 0.00,
      "is_gst_applicable": true,
      "quantity": 100,
      "unit_price": 50.00,
      "taxable_amount": 5000.00,
      "line_total": 5000.00,
      "entry_balanced": true
    },
    {
      "line_number": "0_1",
      "account_name": "CGST Input",
      "account_code": "1420",
      "debit_amount": 450.00,
      "credit_amount": 0.00,
      "cgst_amount": 450.00,
      "gst_amount": 450.00,
      "is_gst_applicable": true
    },
    {
      "line_number": "0_2",
      "account_name": "SGST Input",
      "account_code": "1421",
      "debit_amount": 450.00,
      "credit_amount": 0.00,
      "sgst_amount": 450.00,
      "gst_amount": 450.00,
      "is_gst_applicable": true
    },
    {
      "line_number": "0_3",
      "account_name": "Accounts Payable",
      "account_code": "2010",
      "debit_amount": 0.00,
      "credit_amount": 5900.00,
      "account_type": "Liability"
    }
  ],
  
  "invoice_header": {
    "vendor_name": "ABC Supplies Ltd",
    "vendor_gstin": "27ABCDE1234F1Z5",
    "invoice_number": "INV-2026-001",
    "invoice_date": "2026-01-20",
    "total_amount": 5000.00,
    "tax_amount": 900.00
  },
  
  "balance_validation": {
    "is_balanced": true,
    "total_debit": 5900.00,
    "total_credit": 5900.00,
    "difference": 0.00
  },
  
  "processing_metadata": {
    "total_entries": 4,
    "raw_line_items": 1,
    "is_balanced": true,
    "total_debit": 5900.00,
    "total_credit": 5900.00,
    "processing_pipeline": "orchestrated_pipeline_v2",
    "stored_by": "data_combiner"
  }
}
```

**Subcollection**: `users/{uid}/invoice_results/{job_id}/journal_entries/`
**Documents**: `line_0`, `line_1`, `line_2`, `line_3` (each line item as separate doc)

```json
// users/{uid}/invoice_results/{job_id}/journal_entries/line_0
{
  "line_number": "0_0",
  "account_name": "Purchases",
  "account_code": "5010",
  "debit_amount": 5000.00,
  "credit_amount": 0.00,
  // ... other fields
}
```

### Key Points - FINAL STORAGE
- ✅ **PRIMARY STORAGE**: Firestore at `users/{uid}/invoice_results/{job_id}`
- ✅ **NO Pub/Sub** - Direct API call to data-combiner
- ✅ Main document + subcollection for detail access
- ✅ GCS backup is **OPTIONAL** (not required)
- ✅ Complete invoice data with journal entries for frontend
- ✅ Atomic batch write (all-or-nothing)

---

## Complete GCS Folder Structure

### After Full Pipeline Completion

```
gs://watch-mail-trial-invoice-processing/
│
└── users/
    │
    └── firebase_uid_12345/
        │
        ├── raw/                              # Tier 1: Original uploads
        │   ├── invoice_001.pdf               # 30-day retention
        │   ├── invoice_002.jpg
        │   └── .gitkeep
        │
        ├── processed/                        # Tier 2: Optional backup (COMBINER WRITES HERE)
        │   ├── DOC-ABC123-XYZ789_final.json # Contains final results (backup only)
        │   └── .gitkeep
        │
        ├── archived/                         # Tier 3: Downloaded results
        │   ├── DOC-ABC123-XYZ789_archived.json  # When user downloads/archives
        │   └── .gitkeep
        │
        └── temp/                            # Tier 4: Temporary (7-day auto-cleanup)
            ├── DOC-ABC123-XYZ789_chunks.json
            └── .gitkeep

└── shared/
    ├── prompts/
    └── models/
```

### Storage Retention Policy

| Folder | Usage | Retention | Auto-Cleanup | Purpose |
|--------|-------|-----------|--------------|---------|
| `raw/` | Original uploads | 30 days | Yes | Audit trail, re-processing |
| `processed/` | Optional final backup | 30 days | Yes | Offline access, recovery |
| `archived/` | Downloaded results | 90 days | Yes | Long-term archival |
| `temp/` | Processing intermediate | 7 days | Yes | Memory optimization |

---

## Data Flow Diagram - Storage Perspective

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CUSTOMER UPLOADS FILE                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                     ↓
                    GCS: users/{uid}/raw/{filename}
                    Firestore: users/{uid}/invoice_results/{job_id}
                              status: CREATED
                                     ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                      data-extractor-v2 (OpenAI Vision)                      │
│  ├─ Downloads from: GCS users/{uid}/raw/{filename}                         │
│  ├─ Processes: Convert PDF→PNG, call OpenAI                                │
│  └─ Stores: In memory + Pub/Sub (NO GCS write)                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                     ↓
                    Firestore: users/{uid}/invoice_results/{job_id}
                              status: EXTRACTING → EXTRACTED
                              extraction_result: {...}
                                     ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                     enrichment-worker (OpenAI Business Logic)               │
│  ├─ Consumes from: Pub/Sub enrichment-topic                                │
│  ├─ Processes: Add HSN codes, tax categories, enrichment                   │
│  └─ Stores: In memory + Pub/Sub (NO GCS write)                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                     ↓
                    Firestore: users/{uid}/invoice_results/{job_id}
                              status: ENRICHING → ENRICHED
                              enrichment_result: {...}
                                     ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                  field-standardizer-v2 (OpenAI Standardization)            │
│  ├─ Consumes from: Pub/Sub standardization-topic                           │
│  ├─ Processes: Standardize fields, generate journal entries                │
│  └─ Stores: In memory + Pub/Sub (NO GCS write)                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                     ↓
                    Firestore: users/{uid}/invoice_results/{job_id}
                              status: STANDARDIZING → STANDARDIZED
                                     ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                    data-combiner (FINAL WRITE - Main Storage)              │
│  ├─ Receives: standardized_header, standardized_journal_entries            │
│  ├─ Validates: Accounting balance (debits = credits)                       │
│  ├─ Flattens: Nested → frontend-friendly flat format                       │
│  ├─ PRIMARY STORAGE:                                                       │
│  │  ├─ Firestore: users/{uid}/invoice_results/{job_id}                    │
│  │  └─ With subcollection: journal_entries/line_*                          │
│  ├─ Optional GCS backup:                                                   │
│  │  └─ GCS: users/{uid}/processed/{job_id}_final.json                     │
│  └─ Status: COMPLETED ✅                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                     ↓
                FINAL RESULTS READY FOR FRONTEND
                ├─ Display in Journal Entries Table
                ├─ Download as CSV
                ├─ Archive for later access
                └─ Real-time listener updates
```

---

## Frontend Access to Results

### Real-Time Listener (Frontend)

```typescript
// invoice-app-v2/src/services/firestoreService.ts

useEffect(() => {
  if (!user?.uid) return
  
  // Listen to: users/{uid}/invoice_results (all results)
  const q = query(
    collection(db, `users/${user.uid}/invoice_results`),
    orderBy('created_at', 'desc'),
    limit(50)
  )
  
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const results = snapshot.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        ...data,
        // Access journal_entries directly from main doc
        journal_entries: data.journal_entries || []
      }
    })
    
    // For detailed access to specific lines, can query subcollection:
    // collection(db, `users/${uid}/invoice_results/${job_id}/journal_entries`)
    
    setResults(results)
  })
  
  return () => unsubscribe()
}, [user?.uid])
```

### What Frontend Gets

```json
{
  "id": "DOC-ABC123-XYZ789",
  "status": "completed",
  "original_filename": "invoice_001.pdf",
  "invoice_header": {
    "vendor_name": "ABC Supplies Ltd",
    "invoice_number": "INV-2026-001",
    "total_amount": 5000.00
  },
  "journal_entries": [
    // Array of flattened entries ready for table display
    {
      "line_number": "0_0",
      "account_name": "Purchases",
      "debit_amount": 5000.00,
      "credit_amount": 0.00,
      "narration": "Purchase of office supplies"
    },
    // ... more entries
  ],
  "balance_validation": {
    "is_balanced": true,
    "total_debit": 5900.00,
    "total_credit": 5900.00
  }
}
```

---

## Summary: Where Final Results Are Stored

### 🔥 PRIMARY STORAGE (MAIN)
**Location**: Firestore at `users/{uid}/invoice_results/{job_id}`
- Main document with complete invoice data
- Journal entries in flat format for frontend
- Subcollection `journal_entries/` for detailed line-by-line access
- **This is where the frontend reads data from** ✅

### 💾 OPTIONAL BACKUP (SECONDARY)
**Location**: GCS at `users/{uid}/processed/{job_id}_final.json`
- JSON backup of final results
- Not required for functionality
- Can be disabled
- Used for offline recovery if Firestore has issues

### 📦 ARCHIVE (POST-DOWNLOAD)
**Location**: GCS at `users/{uid}/archived/{id}_archived.json`
- Customer downloads results → moved to archive
- 90-day retention
- Long-term storage for compliance

### ✅ Process Summary
1. **Upload** → GCS raw folder
2. **Extract** → In-memory + Pub/Sub
3. **Enrich** → In-memory + Pub/Sub
4. **Standardize** → In-memory + Pub/Sub
5. **Combine** → **Firestore (PRIMARY)** + optional GCS backup
6. **Frontend reads** → Firestore real-time listener

---

## Key Takeaways

✅ **Final results stored in Firestore** (not GCS)
✅ **Atomic batch writes** for consistency
✅ **Journal entries in flat format** for easy frontend display
✅ **Accounting balance validation** before storage
✅ **Optional GCS backup** for recovery
✅ **Real-time frontend updates** via Firestore listeners
✅ **User-isolated paths** for multi-tenant security
✅ **No intermediate GCS writes** (efficiency)
✅ **GCS only for**: original uploads (raw), optional final backup (processed), archived downloads

---

*Last Updated: January 25, 2026*
*Version: 1.1.0*
