# Customer Workspace Setup Guide - Complete Details

> Full documentation for setting up a new customer workspace in the invoice processing system

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Customer Setup Flow](#customer-setup-flow)
3. [Firestore Data Structure](#firestore-data-structure)
4. [Cloud Storage Structure](#cloud-storage-structure)
5. [Backend Integration Points](#backend-integration-points)
6. [Frontend Components & Services](#frontend-components--services)
7. [API Endpoints](#api-endpoints)
8. [Authentication & Authorization](#authentication--authorization)
9. [Multi-Tenant Isolation](#multi-tenant-isolation)
10. [Workspace Initialization Checklist](#workspace-initialization-checklist)

---

## Overview

The invoice processing system is a **multi-tenant platform** where each customer gets:
- ✅ Isolated Firestore collections under `users/{uid}/`
- ✅ Dedicated Cloud Storage bucket structure
- ✅ Organization-level grouping for teams
- ✅ Payment & subscription management
- ✅ Isolated invoice processing pipeline
- ✅ Real-time processing status updates

### Key Architecture
```
Customer (User) 
  ↓
Firebase Authentication
  ↓
User Profile in Firestore (users/{uid})
  ↓
Organization (users can belong to one or more)
  ↓
Workspace (isolated storage in GCS)
  ↓
Invoice Processing Pipeline
  ↓
Results stored in users/{uid}/invoice_results/
```

---

## Customer Setup Flow

### Phase 1: Authentication & User Profile Creation

#### Step 1.1: Sign Up / Sign In
- **Entry Point**: [LandingPage.tsx](invoice-app-v2/src/pages/LandingPage.tsx) → `/login`
- **Components**: [Login.tsx](invoice-app-v2/src/pages/Login.tsx)
- **Authentication Methods**:
  - Google OAuth (`signInWithGoogle()`)
  - Email + Password (`signInWithEmail()` / `signUpWithEmail()`)

**Code Reference**:
```typescript
// AuthContext.tsx
async function signInWithGoogle() {
  const result = await signInWithPopup(auth, new GoogleAuthProvider())
  await createOrUpdateUserProfile(result.user)
}

async function createOrUpdateUserProfile(user: User) {
  // Creates user profile in Firestore at users/{uid}
  const userRef = doc(db, 'users', user.uid)
  await setDoc(userRef, {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    // ... other profile fields
  })
}
```

#### Step 1.2: Initial User Profile Created
**Firestore Location**: `users/{uid}`

```json
{
  "uid": "[firebase_uid]",
  "email": "[user_email]",
  "displayName": "[from_auth]",
  "role": "user",                    // or 'super_admin', 'admin'
  "organizationId": "[org_id]",      // Organization assignment
  "organizationRole": "member",      // or 'admin'
  "paymentStatus": {
    "status": "pending",              // pending → paid → verified
    "amount": 0,
    "currency": "INR",
    "paymentMethod": "upi",
    "subscriptionType": "trial",      // trial → monthly → yearly
    "autoRenew": false,
    "createdAt": "[timestamp]",
    "paidAt": null,
    "verifiedAt": null,
    "verifiedBy": null,
    "expiresAt": "[7_days_from_now]",
    "paymentHistory": []
  },
  "workspace_initialized": false,
  "workspaceId": null,
  "createdAt": "[timestamp]",
  "updatedAt": "[timestamp]",
  "lastLoginAt": "[timestamp]",
  "isActive": false,
  "approvalStatus": "pending",
  "permissions": {
    "canUpload": true,
    "canDownload": true,
    "canDelete": true,
    "canEdit": true,
    "canViewOwnData": true,
    "canViewOrgData": false,
    "maxFilesPerDay": 100,
    "maxFileSize": 10
  },
  "preferences": {
    "theme": "auto",
    "language": "en",
    "timezone": "UTC",
    "emailNotifications": true,
    "defaultCurrency": "INR"
  },
  "usageStats": {
    "totalUploads": 0,
    "totalProcessed": 0,
    "storageUsed": 0,
    "uploadsToday": 0,
    "uploadsThisMonth": 0
  }
}
```

---

### Phase 2: Organization Setup

#### Step 2.1: Organization Creation/Assignment
- **Route**: `/onboarding` → Step 2
- **Component**: [OrganizationStep.tsx](invoice-app-v2/src/components/onboarding/OrganizationStep.tsx)
- **Service**: [userService.ts](invoice-app-v2/src/services/userService.ts)

**Option A: Create New Organization**
```typescript
// In userService.ts
async createOrganizationWithName(organizationName: string): Promise<string> {
  const orgRef = doc(collection(db, 'organizations'))
  
  const organization: Organization = {
    id: orgRef.id,
    name: organizationName,
    domain: 'custom',
    description: `Custom organization: ${organizationName}`,
    settings: {
      allowSelfSignup: false,
      requireAdminApproval: true,
      dataRetentionDays: 90,
      maxUsersAllowed: 25,
      enableDepartments: false,
      allowedDomains: []
    },
    subscription: {
      plan: 'free',                    // free/basic/pro/enterprise
      status: 'trial',                 // trial/active/expired/cancelled
      startDate: serverTimestamp(),
      features: ['basic_processing', 'document_viewer'],
      limits: {
        maxUsers: 10,
        maxUploadsPerMonth: 500,
        maxStorageGB: 5,
        apiCallsPerMonth: 2000
      }
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ownerId: user.uid,                 // Set to creating user's UID
    isActive: true,
    memberCount: 1,
    adminIds: [user.uid]
  }
  
  await setDoc(orgRef, organization)
  return orgRef.id
}
```

**Firestore Location**: `organizations/{orgId}`

```json
{
  "id": "[org_id]",
  "name": "ABC Accounting Company",
  "domain": "custom",
  "description": "Custom organization: ABC Accounting Company",
  "ownerId": "[user_uid]",
  "adminIds": ["[user_uid]", "[other_admin_uid]"],
  "memberCount": 5,
  "isActive": true,
  "settings": {
    "allowSelfSignup": false,
    "requireAdminApproval": true,
    "dataRetentionDays": 90,
    "maxUsersAllowed": 25,
    "enableDepartments": false,
    "allowedDomains": []
  },
  "subscription": {
    "plan": "free",
    "status": "trial",
    "startDate": "[timestamp]",
    "endDate": null,
    "features": ["basic_processing", "document_viewer"],
    "limits": {
      "maxUsers": 10,
      "maxUploadsPerMonth": 500,
      "maxStorageGB": 5,
      "apiCallsPerMonth": 2000
    }
  },
  "createdAt": "[timestamp]",
  "updatedAt": "[timestamp]"
}
```

**Option B: Join Existing Organization**
- User enters organization name/domain
- System sends invite request to organization admin
- Admin approves/rejects via admin panel
- User added to `organizationMembers/{userId}` subcollection

**User Profile Updated**:
```json
users/{uid} {
  "organizationId": "[org_id]",
  "organizationName": "ABC Accounting Company",
  "organizationRole": "member"  // or 'admin' if created org
}
```

---

### Phase 3: Workspace Initialization

#### Step 3.1: Workspace Creation
- **Route**: `/onboarding` → Step 3
- **Component**: [WorkspaceStep.tsx](invoice-app-v2/src/components/onboarding/WorkspaceStep.tsx)
- **Service**: [workspaceService.ts](invoice-app-v2/src/services/workspaceService.ts)

**Frontend Call**:
```typescript
// In workspaceService.ts
async initializeWorkspace(): Promise<WorkspaceResponse> {
  const response = await fetch(getApiUrl.initializeWorkspace(), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId: user.uid,
      userEmail: user.email
    })
  })
  
  return response.json()
}
```

**Backend Endpoint**: `POST /workspace/initialize`
- **File**: [initial-api/Cloudrun_version/workspace_manager.py](initial-api/Cloudrun_version/workspace_manager.py)

**Backend Processing**:
```python
def initialize_workspace_endpoint(request):
    """Main endpoint for workspace initialization"""
    try:
        # 1. Verify authentication
        auth_header = request.headers.get('Authorization')
        user_context = verify_auth_token(auth_header)
        user_uid = user_context['uid']
        user_email = user_context['email']
        
        # 2. Check if workspace already exists
        doc_ref = firestore_client.collection('users').document(user_uid)
        doc = doc_ref.get()
        
        if doc.exists and doc.to_dict().get('workspace_initialized'):
            return jsonify({
                'status': 'success',
                'message': 'Workspace already initialized',
                'existing': True
            })
        
        # 3. Create GCS folder structure
        bucket = storage_client.bucket('watch-mail-trial-invoice-processing')
        folders = [
            f'users/{user_uid}/raw/',
            f'users/{user_uid}/processed/',
            f'users/{user_uid}/archived/',
            f'users/{user_uid}/temp/'
        ]
        
        for folder_file in folders:
            blob = bucket.blob(folder_file + '.gitkeep')
            if not blob.exists():
                blob.upload_from_string('')
        
        # 4. Initialize Firestore metadata
        workspace_data = {
            'user_uid': user_uid,
            'user_email': user_email,
            'workspace_id': f'ws_{user_uid[:8]}',
            'storage_quota_gb': 5,
            'storage_used_mb': 0,
            'initialized_at': datetime.utcnow(),
            'folder_structure': {
                'raw': f'users/{user_uid}/raw/',
                'processed': f'users/{user_uid}/processed/',
                'archived': f'users/{user_uid}/archived/',
                'temp': f'users/{user_uid}/temp/'
            }
        }
        
        doc_ref.update({
            'workspace': workspace_data,
            'workspace_initialized': True,
            'workspaceId': workspace_data['workspace_id'],
            'updated_at': datetime.utcnow()
        })
        
        return jsonify({
            'status': 'success',
            'message': 'Workspace initialized successfully',
            'workspaceId': workspace_data['workspace_id'],
            'storageQuota': 5,
            'folderStructure': workspace_data['folder_structure']
        })
        
    except ValueError as auth_error:
        return jsonify({'error': str(auth_error)}), 401
    except Exception as e:
        return jsonify({'error': 'Failed to initialize workspace'}), 500
```

**User Profile Updated**:
```json
users/{uid} {
  "workspace_initialized": true,
  "workspaceId": "ws_[uid_first_8_chars]",
  "workspace": {
    "user_uid": "[uid]",
    "user_email": "[email]",
    "workspace_id": "ws_[uid_first_8_chars]",
    "storage_quota_gb": 5,
    "storage_used_mb": 0,
    "initialized_at": "[timestamp]",
    "folder_structure": {
      "raw": "users/[uid]/raw/",
      "processed": "users/[uid]/processed/",
      "archived": "users/[uid]/archived/",
      "temp": "users/[uid]/temp/"
    }
  }
}
```

---

### Phase 4: Payment Initialization

#### Step 4.1: Plan Selection
- **Route**: `/onboarding` → Step 4
- **Component**: [PlanSelectionStep.tsx](invoice-app-v2/src/components/onboarding/)
- **Plans Available**:
  - **Monthly**: ₹999/month
  - **Yearly**: ₹11,999/year (discounted)

**Code**:
```typescript
// In userService.ts
async initializePayment(amount: number, subscriptionType: 'monthly' | 'yearly'): Promise<void> {
  const userRef = doc(db, 'users', user.uid)
  
  await updateDoc(userRef, {
    'paymentStatus.status': 'pending',
    'paymentStatus.amount': amount,
    'paymentStatus.subscriptionType': subscriptionType,
    'paymentStatus.currency': 'INR',
    'paymentStatus.paymentMethod': 'upi',
    'paymentStatus.createdAt': serverTimestamp(),
    'paymentStatus.updatedAt': serverTimestamp()
  })
}
```

**Firestore Updated**:
```json
users/{uid}.paymentStatus {
  "status": "pending",
  "amount": 999,
  "subscriptionType": "monthly",
  "currency": "INR",
  "paymentMethod": "upi",
  "createdAt": "[timestamp]",
  "updatedAt": "[timestamp]"
}
```

---

### Phase 5: Payment Submission

#### Step 5.1: UPI Payment
- **Route**: `/onboarding` → Step 5
- **Component**: [PaymentStep.tsx](invoice-app-v2/src/components/onboarding/PaymentStep.tsx)

**What Customer Sees**:
1. QR code for UPI payment (generated from Razorpay/PayU)
2. UPI ID: `business@upi`
3. Payment amount: ₹999 (or ₹11,999)
4. Pre-generated transaction reference ID
5. Alternative: Bank transfer details

**Customer Action**:
1. Scans QR code or clicks UPI link
2. Opens UPI app (Google Pay, PhonePe, etc.)
3. Confirms payment
4. Copies transaction reference from UPI confirmation
5. Returns to webapp and enters transaction reference
6. Clicks "Confirm Payment Made"

**Form Submission**:
```typescript
// In PaymentStep.tsx
async function handleSubmitPaymentProof() {
  const transactionRef = form.transactionReference.trim()
  
  // Validate
  if (!transactionRef || transactionRef.length < 5) {
    return toast.error('Invalid transaction reference')
  }
  
  // Submit to backend
  await userService.updatePaymentStatus({
    status: 'paid',
    transactionRef: transactionRef,
    paidAt: new Date(),
    verificationMethod: 'manual'
  })
  
  console.log('💳 Payment proof submitted:', transactionRef)
  toast.success('Payment submitted for verification')
  
  // Move to Step 6
  nextStep()
}
```

**Firestore Updated**:
```json
users/{uid}.paymentStatus {
  "status": "paid",              // Changed from "pending"
  "amount": 999,
  "currency": "INR",
  "subscriptionType": "monthly",
  "paymentMethod": "upi",
  "transactionRef": "[UUID_FROM_FORM]",
  "transactionId": "[PAYMENT_GATEWAY_ID]",
  "paidAt": "[timestamp]",
  "verificationMethod": "manual",
  "createdAt": "[original_timestamp]",
  "updatedAt": "[timestamp]"
}
```

---

### Phase 6: Payment Verification

#### Step 6.1: Waiting for Admin Approval
- **Route**: `/onboarding` → Step 6
- **Component**: [VerificationStep.tsx](invoice-app-v2/src/components/onboarding/VerificationStep.tsx)

**UI Behavior**:
- Shows "Waiting for Verification" screen
- Displays payment details
- Shows auto-check progress (every 30 seconds)
- Shows elapsed time counter
- Manual "Check Status" button available

**Auto-Check Logic**:
```typescript
// In VerificationStep.tsx
useEffect(() => {
  const checkInterval = setInterval(async () => {
    await userService.refreshUserProfile()
    
    const paymentStatus = user?.paymentStatus?.status
    if (paymentStatus === 'verified') {
      console.log('✅ Payment verified! Redirecting...')
      toast.success('Payment verified! You can now start processing invoices.')
      navigate('/dashboard')
    }
  }, 30000) // Check every 30 seconds
  
  return () => clearInterval(checkInterval)
}, [user?.uid])
```

#### Step 6.2: Admin Approval
- **Route**: `/admin` → "User Approval" tab
- **Component**: [AdminPanel.tsx](invoice-app-v2/src/components/admin/)

**Admin Process**:
1. Admin navigates to `/admin/approvals`
2. Sees list of users with `paymentStatus.status === 'paid'`
3. Clicks "Approve" button for customer
4. System calls:
   ```typescript
   async approveUserPayment(userId: string, days: number = 30): Promise<void> {
     const userRef = doc(db, 'users', userId)
     const expiresAt = new Date()
     expiresAt.setDate(expiresAt.getDate() + days)
     
     await updateDoc(userRef, {
       'paymentStatus.status': 'verified',
       'paymentStatus.verifiedAt': serverTimestamp(),
       'paymentStatus.verifiedBy': currentAdmin.uid,
       'paymentStatus.expiresAt': Timestamp.fromDate(expiresAt),
       'isActive': true,
       'approvalStatus': 'approved'
     })
   }
   ```

**Firestore Updated**:
```json
users/{uid}.paymentStatus {
  "status": "verified",                      // CHANGED
  "amount": 999,
  "currency": "INR",
  "subscriptionType": "monthly",
  "paymentMethod": "upi",
  "transactionRef": "[UUID]",
  "verifiedAt": "[timestamp]",
  "verifiedBy": "[admin_uid]",
  "expiresAt": "[30_days_from_now]",
  "paidAt": "[timestamp]"
}

users/{uid} {
  "isActive": true,                          // CHANGED
  "approvalStatus": "approved"               // CHANGED
}
```

#### Step 6.3: Customer Sees Verification
- Auto-check detects `status === 'verified'`
- Toast notification: "Payment verified!"
- Auto-redirect to dashboard `/`
- Access to invoice processing unlocked ✅

---

### Phase 7: Dashboard & First Upload

#### Step 7.1: Dashboard Access
- **Route**: `/` or `/dashboard`
- **Component**: [MultiUploadDashboard.tsx](invoice-app-v2/src/pages/MultiUploadDashboard.tsx)
- **ProtectedRoute Check**: Requires `paymentStatus.status === 'verified'`

**Dashboard Requirements Met**:
- ✅ User authenticated (`user?.uid` exists)
- ✅ Organization assigned
- ✅ Workspace initialized
- ✅ Payment verified
- ✅ Permissions loaded
- ✅ Real-time listeners ready

**Initial Dashboard State**:
```json
{
  "invoice_results": [],              // Empty initially
  "file_queue": [],                   // No files yet
  "selected_client_orgs": [],         // Optional selection
  "statistics": {
    "total_invoices": 0,
    "total_processed": 0,
    "total_failed": 0,
    "avg_processing_time": 0
  }
}
```

#### Step 7.2: First Invoice Upload

**File Upload UI**:
- Drag & drop zone
- Click to select files
- Accepts: PDF, PNG, JPG, JPEG
- Max 10 files per batch

**Upload Flow**:
1. Customer selects file(s)
2. Frontend validates:
   - File type (PDF/image)
   - File size (≤50MB)
   - Usage limits
3. Calls backend:
   ```typescript
   async processInvoice(file: File, clientOrg?: string): Promise<string> {
     const formData = new FormData()
     formData.append('file', file)
     formData.append('clientOrg', clientOrg)
     
     const response = await fetch(getApiUrl.uploadInvoice(), {
       method: 'POST',
       headers: {
         'Authorization': `Bearer ${idToken}`,
         'X-Tenant-ID': organizationId
       },
       body: formData
     })
     
     const data = await response.json()
     return data.jobId
   }
   ```

**Backend Processing** (`initial-api/upload`):
```python
def upload_invoice_endpoint(request):
    # 1. Verify auth token
    user_uid = verify_auth_token(request.headers.get('Authorization'))
    tenant_id = request.headers.get('X-Tenant-ID')
    
    # 2. Validate file
    file = request.files['file']
    if file.filename.split('.')[-1].lower() not in ['pdf', 'png', 'jpg', 'jpeg']:
        return jsonify({'error': 'Invalid file type'}), 400
    
    # 3. Store in Cloud Storage
    bucket = storage_client.bucket('watch-mail-trial-invoice-processing')
    blob = bucket.blob(f'users/{user_uid}/raw/{file.filename}')
    blob.upload_from_string(file.read())
    
    # 4. Create job in Firestore
    job_ref = firestore_client.collection('users').document(user_uid)\
              .collection('invoice_results').document()
    
    job_ref.set({
        'job_id': job_ref.id,
        'user_uid': user_uid,
        'tenant_id': tenant_id,
        'file_name': file.filename,
        'file_path': blob.public_url,
        'status': 'CREATED',           # Initial status
        'created_at': datetime.utcnow(),
        'updated_at': datetime.utcnow(),
        'retry_count': 0,
        'error_type': None
    })
    
    # 5. Enqueue job in pipeline
    enqueue_job_in_pipeline(job_ref.id, user_uid)
    
    return jsonify({
        'status': 'success',
        'jobId': job_ref.id,
        'message': 'File uploaded and queued for processing'
    })
```

**File Status Transitions**:
```
CREATED
  ↓
EXTRACTING (0-30%)
  ↓
ENRICHING (30-60%)
  ↓
STANDARDIZING (60-90%)
  ↓
COMBINING (90-100%)
  ↓
COMPLETED ✅ or ERROR ❌
```

---

## Firestore Data Structure

### Root-Level Collections

#### `users/` Collection
**Path**: `users/{uid}`
**Purpose**: User profile and settings

```json
{
  "uid": "[firebase_uid]",
  "email": "[user@company.com]",
  "displayName": "[Full Name]",
  "photoURL": "[image_url]",
  "role": "user",                      // user, admin, super_admin
  "organizationId": "[org_id]",
  "organizationName": "[Company Name]",
  "organizationRole": "member",        // member, admin
  "workspace_initialized": true,
  "workspaceId": "ws_abc12345",
  "workspace": { /* workspace metadata */ },
  "isActive": true,
  "approvalStatus": "approved",        // pending, approved, rejected
  "paymentStatus": { /* payment details */ },
  "permissions": { /* user permissions */ },
  "preferences": { /* user preferences */ },
  "usageStats": { /* usage statistics */ },
  "createdAt": "[timestamp]",
  "updatedAt": "[timestamp]",
  "lastLoginAt": "[timestamp]"
}
```

#### `organizations/` Collection
**Path**: `organizations/{orgId}`
**Purpose**: Organization settings and configuration

```json
{
  "id": "[org_id]",
  "name": "[Organization Name]",
  "domain": "custom",
  "description": "[description]",
  "ownerId": "[user_uid]",
  "adminIds": ["[user_uid1]", "[user_uid2]"],
  "memberCount": 5,
  "isActive": true,
  "settings": { /* org settings */ },
  "subscription": { /* subscription details */ },
  "createdAt": "[timestamp]",
  "updatedAt": "[timestamp]"
}
```

### User-Isolated Subcollections

#### `users/{uid}/invoice_results/` Collection
**Path**: `users/{uid}/invoice_results/{jobId}`
**Purpose**: Invoice processing results and jobs

```json
{
  "job_id": "[job_id]",
  "user_uid": "[uid]",
  "tenant_id": "[org_id]",
  "file_name": "[invoice.pdf]",
  "file_path": "[gcs_path]",
  "status": "COMPLETED",
  "retry_count": 0,
  "retry_scheduled_for": null,
  "error_type": null,
  "error_message": null,
  "line_items": [
    {
      "description": "[Item Description]",
      "amount": 1000.00,
      "hsn_code": "[HSN]",
      "gst_rate": 18,
      "tax_amount": 180.00
    }
  ],
  "header": {
    "invoice_number": "[INV-001]",
    "invoice_date": "[date]",
    "vendor_name": "[Vendor Name]",
    "vendor_gst": "[GST_ID]",
    "total_amount": 1000.00,
    "total_tax": 180.00
  },
  "journal_entry": {
    "debit_account": "[Account Code]",
    "credit_account": "[Account Code]",
    "amount": 1000.00,
    "description": "[Journal Entry Desc]"
  },
  "created_at": "[timestamp]",
  "updated_at": "[timestamp]",
  "completed_at": "[timestamp]"
}
```

#### `users/{uid}/invoice_results_archive/` Collection
**Path**: `users/{uid}/invoice_results_archive/{id}`
**Purpose**: Archived/downloaded results

```json
{
  "id": "[id]",
  "original_job_id": "[job_id]",
  "user_uid": "[uid]",
  "file_name": "[invoice.pdf]",
  "status": "COMPLETED",
  "line_items": [ /* same as active */ ],
  "header": { /* same as active */ },
  "journal_entry": { /* same as active */ },
  "archived_at": "[timestamp]",
  "download_count": 1
}
```

#### `users/{uid}/jobs/` Collection (Legacy)
**Path**: `users/{uid}/jobs/{jobId}`
**Purpose**: Job metadata and tracking

```json
{
  "job_id": "[job_id]",
  "status": "COMPLETED",
  "created_at": "[timestamp]",
  "updated_at": "[timestamp]",
  "file_name": "[invoice.pdf]",
  "processing_started_at": "[timestamp]",
  "processing_completed_at": "[timestamp]",
  "processing_time_seconds": 45
}
```

---

## Cloud Storage Structure

### GCS Bucket: `watch-mail-trial-invoice-processing`

```
watch-mail-trial-invoice-processing/
├── users/
│   └── {uid}/
│       ├── raw/
│       │   ├── invoice_001.pdf
│       │   ├── invoice_002.jpg
│       │   └── .gitkeep
│       ├── processed/
│       │   ├── invoice_001_extracted.json
│       │   ├── invoice_002_enriched.json
│       │   └── .gitkeep
│       ├── archived/
│       │   ├── invoice_001_complete.json
│       │   └── .gitkeep
│       └── temp/
│           ├── invoice_001_chunks.json
│           └── .gitkeep
└── shared/
    ├── embeddings/
    ├── models/
    └── cache/
```

### Folder Purposes

| Folder | Purpose | Retention |
|--------|---------|-----------|
| `raw/` | Original uploaded files | 30 days |
| `processed/` | Intermediate processing results | 30 days |
| `archived/` | Final processed results (after download) | 90 days |
| `temp/` | Temporary processing files | 7 days (auto-cleanup) |

---

## Backend Integration Points

### 1. Initial API (`initial-api`)

**Service**: File upload and authentication gateway

**Endpoints**:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/upload` | POST | Upload invoice file |
| `/workspace/initialize` | POST | Initialize user workspace |
| `/status/{jobId}` | GET | Get job status |

**Auth**: Firebase ID token in `Authorization: Bearer {token}` header

### 2. Orchestrator Service (`orchestrator-service`)

**Service**: Pipeline coordination and job scheduling

**Key Functions**:
- Enqueue jobs to Cloud Tasks
- Monitor job status
- Handle retries
- Route jobs through pipeline

**Endpoints**:
```
POST /enqueue-job
  - Input: jobId, userId, filePath
  - Output: queueId

POST /jobs/{jobId}/retry
  - Trigger manual retry for failed job
  
GET /pipeline-status
  - Get pipeline health status
```

### 3. Data Extractor V2 (`data-extractor-v2`)

**Service**: OCR using OpenAI Vision API

**Process**:
1. Receives job from Cloud Tasks
2. Downloads file from GCS
3. Calls OpenAI Vision API
4. Extracts header and line items
5. Publishes to Pub/Sub for enrichment
6. Updates job status: `EXTRACTED`

### 4. Enrichment Worker (`enrichment-worker`)

**Service**: Business logic enrichment using OpenAI

**Process**:
1. Consumes from Pub/Sub
2. Enriches extracted data
3. Adds HSN codes, tax calculations
4. Publishes to standardizer
5. Updates job status: `ENRICHED`

### 5. Field Standardizer V2 (`field-standardizer-v2`)

**Service**: Field normalization and standardization

**Process**:
1. Consumes from Pub/Sub
2. Standardizes field formats
3. Generates journal entry
4. Publishes to combiner
5. Updates job status: `STANDARDIZED`

### 6. Data Combiner (`data-combiner`)

**Service**: Final write to Firestore

**Process**:
1. Consumes from Pub/Sub
2. Combines all processing stages
3. Writes final result to `users/{uid}/invoice_results/{jobId}`
4. Updates job status: `COMPLETED`

---

## Frontend Components & Services

### Key Services

#### `authService.ts`
```typescript
- getCurrentUser(): User | null
- signInWithGoogle(): Promise<void>
- signInWithEmail(email, password): Promise<void>
- signUpWithEmail(email, password): Promise<void>
- signOut(): Promise<void>
- refreshIdToken(): Promise<string>
```

#### `userService.ts`
```typescript
- createOrUpdateUserProfile(user): Promise<UserProfile>
- createOrganizationWithName(name): Promise<string>
- createDefaultOrganization(email): Promise<string>
- initializePayment(amount, type): Promise<void>
- updatePaymentStatus(status): Promise<void>
- approveUserPayment(userId, days): Promise<void>
- getPermissionsForRole(role): UserPermissions
- getCurrentUserUID(): string | null
```

#### `workspaceService.ts`
```typescript
- initializeWorkspace(): Promise<WorkspaceResponse>
- getWorkspaceStatus(): Promise<WorkspaceStatus>
- createUserFolder(folderName): Promise<void>
- uploadFile(file, folder): Promise<string>
```

#### `orchestratorApiService.ts`
```typescript
- processInvoice(file, clientOrg): Promise<JobResponse>
- getJobStatus(jobId): Promise<JobStatus>
- retryJob(jobId): Promise<void>
- getAllJobs(): Promise<Job[]>
```

### Key Components

#### Onboarding Flow
- `LandingPage.tsx` - Entry point
- `Login.tsx` - Authentication
- `OnboardingFlow.tsx` - 6-step wizard
  - `OrganizationStep.tsx` - Org creation/selection
  - `WorkspaceStep.tsx` - Workspace init
  - `PlanSelectionStep.tsx` - Plan choice
  - `PaymentStep.tsx` - Payment submission
  - `VerificationStep.tsx` - Admin approval wait
  - `SuccessStep.tsx` - Onboarding complete

#### Dashboard
- `MultiUploadDashboard.tsx` - Main dashboard
- `UploadArea.tsx` - File upload component
- `ProcessingQueue.tsx` - Job queue display
- `JournalEntriesTable.tsx` - Results table
- `RealTimeStatus.tsx` - Live updates

#### Admin
- `AdminPanel.tsx` - Admin interface
- `UserApprovalTab.tsx` - Payment approvals
- `OrganizationManagement.tsx` - Org management

---

## API Endpoints

### Authentication

```
POST /auth/login
Content-Type: application/json

{
  "email": "user@company.com",
  "password": "password123",
  "provider": "email"  // or "google"
}

Response: {
  "token": "[firebase_id_token]",
  "user": { /* user data */ }
}
```

### Workspace

```
POST /workspace/initialize
Authorization: Bearer {token}
Content-Type: application/json

Response: {
  "status": "success",
  "workspaceId": "ws_abc12345",
  "storageQuota": 5,
  "folderStructure": { /* structure */ }
}
```

### Invoice Processing

```
POST /upload
Authorization: Bearer {token}
X-Tenant-ID: {organizationId}
Content-Type: multipart/form-data

file: [binary file data]
clientOrg: "optional_org_code"

Response: {
  "status": "success",
  "jobId": "[job_id]",
  "message": "File uploaded and queued"
}
```

```
GET /status/{jobId}
Authorization: Bearer {token}

Response: {
  "jobId": "[job_id]",
  "status": "PROCESSING",
  "progress": 45,
  "estimatedTimeRemaining": 120
}
```

---

## Authentication & Authorization

### Firebase Authentication Flow

```
1. User Signs In
   ↓
2. Firebase Auth verifies credentials
   ↓
3. Firebase returns ID token (1 hour expiry)
   ↓
4. Frontend stores token in memory/sessionStorage
   ↓
5. Refresh token stored securely by Firebase SDK
   ↓
6. On token expiry, Firebase SDK auto-refreshes
   ↓
7. Backend verifies token on each request
```

### Backend Token Verification

```python
def verify_auth_token(auth_header):
    """Verify Firebase ID token"""
    if not auth_header or not auth_header.startswith('Bearer '):
        raise ValueError("Missing authorization token")
    
    token = auth_header.split(' ')[1]
    
    try:
        decoded = firebase_auth.verify_id_token(token)
        return {
            'uid': decoded['uid'],
            'email': decoded['email'],
            'verified': decoded.get('email_verified', False)
        }
    except Exception as e:
        raise ValueError(f"Invalid token: {str(e)}")
```

### Role-Based Access Control (RBAC)

**User Roles**:
| Role | Scope | Permissions |
|------|-------|------------|
| `super_admin` | System-wide | All actions + system config |
| `admin` | Organization | User management, org settings, all approvals |
| `member` | Personal | Upload, download, view own data |
| `viewer` | Personal | Download, view own data only |

**Permission Checks**:
```typescript
const { hasPermission } = useAuth()

if (hasPermission('canUpload')) {
  // Show upload button
}

if (hasPermission('canManageOrgUsers')) {
  // Show user management
}
```

---

## Multi-Tenant Isolation

### Data Isolation Strategy

**Level 1: User-Scoped Collections**
```typescript
// ✅ CORRECT - User-isolated path
collection(db, `users/${user.uid}/invoice_results`)

// ❌ WRONG - No isolation
collection(db, 'invoice_results')
```

**Level 2: Query Verification**
```typescript
// ✅ Always include where clause even with isolated path
const query = query(
  collection(db, `users/${user.uid}/invoice_results`),
  where('user_uid', '==', user.uid),  // Double verification
  limit(50)
)
```

**Level 3: Firestore Security Rules**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // User's own invoice results
    match /users/{userId}/invoice_results/{docId} {
      allow read, write: if request.auth != null 
                         && request.auth.uid == userId;
    }
    
    // Organization data
    match /organizations/{orgId} {
      allow read, write: if request.auth != null 
                         && canAccessOrg(request.auth.uid, orgId);
    }
  }
}
```

**Level 4: Backend Validation**
```python
def require_auth_and_tenant(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Get auth token
        auth_header = request.headers.get('Authorization')
        user_uid = verify_auth_token(auth_header)
        
        # Get tenant from header
        tenant_id = request.headers.get('X-Tenant-ID')
        
        # Verify user belongs to tenant
        user_doc = db.collection('users').document(user_uid).get()
        user_org = user_doc.get('organizationId')
        
        if user_org != tenant_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        # Proceed with tenant context
        return f(*args, user_uid=user_uid, tenant_id=tenant_id, **kwargs)
    
    return decorated_function
```

---

## Workspace Initialization Checklist

### New Customer Setup Checklist

- [ ] **Authentication Setup**
  - [ ] User creates Firebase account (Google OAuth or Email)
  - [ ] Firebase ID token generated
  - [ ] User profile created at `users/{uid}`

- [ ] **Organization Setup**
  - [ ] Organization created at `organizations/{orgId}`
  - [ ] User set as organization owner
  - [ ] Organization linked to user profile

- [ ] **Workspace Initialization**
  - [ ] GCS bucket structure created: `users/{uid}/raw/`, `processed/`, `archived/`, `temp/`
  - [ ] Workspace metadata written to Firestore
  - [ ] `workspace_initialized` flag set to `true`
  - [ ] Storage quota assigned (5GB default)

- [ ] **Payment Setup**
  - [ ] Payment plan selected (monthly/yearly)
  - [ ] Amount set in user profile
  - [ ] `paymentStatus.status` set to `pending`

- [ ] **Payment Processing**
  - [ ] UPI/payment gateway initialized
  - [ ] Customer completes payment
  - [ ] Transaction reference recorded
  - [ ] `paymentStatus.status` changed to `paid`

- [ ] **Admin Approval**
  - [ ] Admin verifies payment
  - [ ] Admin clicks "Approve"
  - [ ] `paymentStatus.status` changed to `verified`
  - [ ] `isActive` flag set to `true`

- [ ] **Dashboard Access**
  - [ ] Protected route allows access
  - [ ] Real-time listeners initialized
  - [ ] Upload components enabled
  - [ ] Dashboard fully functional

- [ ] **First Upload Ready**
  - [ ] Customer can access `/` (dashboard)
  - [ ] Upload area visible and functional
  - [ ] Can select invoice files
  - [ ] Processing queue ready
  - [ ] Real-time status updates working

### Verification Commands

```bash
# Check user profile exists
gcloud firestore documents get users/{uid}

# Check organization created
gcloud firestore documents get organizations/{orgId}

# Check GCS structure
gsutil ls gs://watch-mail-trial-invoice-processing/users/{uid}/

# Check workspace metadata
gcloud firestore documents get users/{uid}/workspace

# Check payment status
gcloud firestore documents get users/{uid}/paymentStatus
```

---

## Summary: Complete Customer Journey

```
1. SIGN UP
   ↓
   Firebase Auth → User Profile Created → Role: 'user'
   ↓
2. CHOOSE/CREATE ORGANIZATION
   ↓
   Organization Created → User Linked → Role: 'member' or 'admin'
   ↓
3. INITIALIZE WORKSPACE
   ↓
   GCS Folders Created → Firestore Metadata → workspace_initialized = true
   ↓
4. SELECT PAYMENT PLAN
   ↓
   Monthly: ₹999 | Yearly: ₹11,999 → paymentStatus.status = 'pending'
   ↓
5. COMPLETE PAYMENT
   ↓
   UPI/Gateway → Transaction Reference → paymentStatus.status = 'paid'
   ↓
6. WAIT FOR ADMIN APPROVAL
   ↓
   Admin Checks Payment → Clicks Approve → paymentStatus.status = 'verified'
   ↓
7. ACCESS DASHBOARD
   ↓
   ProtectedRoute Check Passes → Dashboard Loads → Upload Enabled
   ↓
8. UPLOAD FIRST INVOICE
   ↓
   Select File → Submit → Job Created → Processing Pipeline Starts
   ↓
   Results Stored in users/{uid}/invoice_results/{jobId}
   ↓
   Customer Can Download CSV ✅
```

---

## Quick Reference

### Key Files
- Frontend: `invoice-app-v2/src/`
- Backend: `initial-api/`, `orchestrator-service/`, etc.
- Shared: `shared/`
- Config: `config/development.env`, `config/production.env`

### Important Collections
- `users/{uid}` - User profiles
- `organizations/{orgId}` - Organization data
- `users/{uid}/invoice_results/` - Processing results
- `users/{uid}/invoice_results_archive/` - Archived results

### Environment Variables
```bash
PROJECT_ID=watch-mail-trial
BUCKET_NAME=watch-mail-trial-invoice-processing
REGION=asia-south1
OPENAI_API_KEY=sk-...
```

### Deployment
```bash
# Deploy frontend
git push origin main  # Auto-deploys to Netlify

# Deploy backend service
cd {service-folder}
gcloud run deploy {service-name} --source . --region asia-south1

# Deploy Firestore rules
firebase deploy --only firestore:rules
```

---

*Last Updated: January 25, 2026*
*Version: 1.1.0*
