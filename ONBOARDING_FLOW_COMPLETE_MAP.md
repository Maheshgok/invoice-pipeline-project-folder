# Complete Onboarding Flow: Sign-In to First Invoice Upload

## Overview
This document traces the entire user journey from new user sign-in through completing their first invoice upload.

---

## **PHASE 1: LANDING PAGE & AUTHENTICATION**

### Entry Point: Landing Page (`/`)
- **File**: [LandingPage.tsx](invoice-app-v2/src/pages/LandingPage.tsx)
- **Component**: `LandingPage`
- **What happens**:
  - Shows marketing information about the system
  - If user is NOT logged in:
    - Display "Get Started" CTA button linking to `/login`
    - Show signup/signin options
  - If user IS logged in:
    - Display "Open Dashboard" button linking to `/dashboard`
    - Display "Admin Panel" button (if super_admin role)

### Sign In/Sign Up: Login Page (`/login`)
- **File**: [Login.tsx](invoice-app-v2/src/pages/Login.tsx)
- **Component**: `Login`
- **What happens**:
  - User can sign in with:
    - ✅ Google OAuth (`signInWithGoogle()`)
    - ✅ Email + Password (`signInWithEmail()` or `signUpWithEmail()`)
  - On successful auth:
    - Firebase creates user account
    - `AuthContext` triggers `createOrUpdateUserProfile()` 
    - User profile created in Firestore at `users/{uid}`
    - Initial `paymentStatus` set to `pending`
    - User redirected based on their status

### Auth Context Flow
- **File**: `AuthContext.tsx`
- **Key Methods**:
  - `signInWithGoogle()` → Firebase Auth → AuthContext updated → Profile created
  - `signInWithEmail()` → Firebase Auth → AuthContext updated → Profile created
  - `signUpWithEmail()` → Firebase Auth → AuthContext updated → Profile created
  - `createOrUpdateUserProfile()` creates initial Firestore document

### Initial User Profile Created
```json
{
  "uid": "[firebase_uid]",
  "email": "[user_email]",
  "displayName": "[from auth]",
  "role": "user",
  "paymentStatus": {
    "status": "pending",
    "amount": 0,
    "paymentMethod": "upi",
    "subscriptionType": "trial",
    "paidAt": null,
    "verifiedAt": null
  },
  "workspace_initialized": false,
  "createdAt": [timestamp],
  "updatedAt": [timestamp],
  "lastLoginAt": [timestamp],
  "isActive": false,
  "approvalStatus": "pending"
}
```

---

## **PHASE 2: PROTECTED ROUTE CHECK**

### AuthProtectedRoute Evaluation
- **File**: [ProtectedRoute.tsx](invoice-app-v2/src/components/auth/ProtectedRoute.tsx)
- **Logic**:
  1. Check if user is authenticated (`user?.uid` exists)
  2. Check if payment status is appropriate:
     - `'verified'` or `'free_trial'` → PASS ✅
     - `'paid'` (pending verification) → Allow onboarding
     - `'pending'` → Must complete onboarding
  3. If not authenticated → Redirect to `/login`
  4. If no verification → Redirect to `/onboarding`

---

## **PHASE 3: ONBOARDING FLOW (6 STEPS)**

### Route: `/onboarding`
- **File**: [OnboardingFlow.tsx](invoice-app-v2/src/components/onboarding/OnboardingFlow.tsx)
- **Status Check**: 
  - If user already has `paymentStatus.status === 'verified'` → Redirect to `/` (dashboard)
  - If `workspace_initialized === true` but payment pending → Show onboarding

### Step 1: Account Created (Welcome)
- **UI**: Welcome screen showing account creation success
- **Actions**: 
  - Shows user email and account confirmation
  - Button: "Continue to Organization Setup"
- **Next**: Click button → Move to Step 2

### Step 2: Organization Setup
- **Component**: [OrganizationStep.tsx](invoice-app-v2/src/components/onboarding/OrganizationStep.tsx)
- **Options**:
  - ✅ **Create New Organization**
    - User enters organization name
    - Calls: `userService.createOrganizationWithName()`
    - Creates Firestore document in `organizations/{orgId}`
    - User set as organization owner
  - ✅ **Join Existing Organization**
    - Search for organization by name/domain
    - Submit to be added to org
    - Requires org admin approval
- **Data Saved**:
  ```json
  {
    "organizationId": "[orgId]",
    "organizationName": "[name]",
    "organizationRole": "admin" // if created, or "member" if joined
  }
  ```
- **Next**: Click "Continue" → Move to Step 3

### Step 3: Workspace Initialization
- **Component**: [WorkspaceStep.tsx](invoice-app-v2/src/components/onboarding/WorkspaceStep.tsx)
- **What Happens**:
  - Calls `workspaceService.initializeWorkspace()`
  - This calls backend API at `initial-api/workspace/initialize`
  - Creates isolated Cloud Storage bucket for user
  - Creates workspace document in Firestore
  - Sets `workspace_initialized = true` in user profile
- **API Call**:
  ```
  POST https://initial-api-812016027146.asia-south1.run.app/workspace/initialize
  Authorization: Bearer [firebase_id_token]
  ```
- **Response**: `{ success: true, workspaceId: "...", storageQuota: 10240 }`
- **Firestore Update**:
  ```json
  users/{uid} {
    "workspace_initialized": true,
    "workspaceId": "[workspaceId]",
    "updatedAt": [timestamp]
  }
  ```
- **Next**: Click "Continue" → Move to Step 4

### Step 4: Plan & Payment Initialization
- **UI**: Displays pricing plans
  - Monthly: ₹999
  - Yearly: ₹11,999 (discounted)
- **Calls**: `userService.initializePayment(amount, subscriptionType)`
- **Data Updated**:
  ```json
  users/{uid}.paymentStatus {
    "status": "pending",
    "amount": 999,
    "subscriptionType": "monthly",
    "currency": "INR",
    "paymentMethod": "upi"
  }
  ```
- **Next**: Click plan button → Move to Step 5

### Step 5: Payment Submission
- **Component**: [PaymentStep.tsx](invoice-app-v2/src/components/onboarding/PaymentStep.tsx)
- **UPI Payment Display**:
  - Shows QR code for UPI payment
  - Displays UPI ID (e.g., `business@upi`)
  - Shows payment amount: ₹999
  - Shows pre-generated transaction ID (reference number)
- **Alternative Options**:
  - Bank transfer details
  - Payment app link
- **User Action**:
  - User scans QR code or uses UPI link
  - User completes payment in their UPI app
  - User copies transaction reference from UPI app
  - User enters transaction reference in form
  - User clicks "Confirm Payment Made"
- **Form Submission** (handleSubmitPaymentProof):
  1. Validate transaction reference entered
  2. Call `onPaymentComplete(transactionRef)` 
  3. Calls `userService.updatePaymentStatus()` with `status: 'paid'`
  4. Updates Firestore:
     ```json
     users/{uid}.paymentStatus {
       "status": "paid",
       "transactionRef": "[UUID_FROM_FORM]",
       "paidAt": [current_timestamp],
       "amount": 999,
       "currency": "INR",
       "paymentMethod": "upi"
     }
     ```
  5. Calls `refreshUserProfile()` to sync
  6. Move to Step 6
- **Console Logs**:
  ```
  💳 Submitting payment proof for user: user@email.com
  📝 Transaction Reference: [transaction_id]
  ✅ Payment proof submitted successfully
  ```
- **Next**: Automatically move to Step 6

### Step 6: Payment Verification (Waiting)
- **Component**: [VerificationStep.tsx](invoice-app-v2/src/components/onboarding/VerificationStep.tsx)
- **UI Display**:
  - Shows "Waiting for Verification" screen
  - Shows payment details (amount: ₹999, status: "paid", transaction ref)
  - Shows auto-check progress (every 30 seconds)
  - Shows elapsed time counter
  - Manual "Check Status" button available
- **Auto-Check Logic**:
  - Every 30 seconds: `refreshUserProfile()`
  - Checks if `paymentStatus.status` changed from "paid" → "verified"
  - If verification detected, auto-redirects to dashboard ✅
- **Admin Approval Process** (parallel):
  - Admin goes to `/admin` > "User Approval" tab
  - Admin sees list of users with `paymentStatus.status === 'paid'`
  - Admin clicks "Approve" for user
  - Admin calls: `userService.approveUserPayment(userId, days=30)`
  - This updates user's profile:
    ```json
    users/{uid}.paymentStatus {
      "status": "verified",
      "verifiedAt": [timestamp],
      "verifiedBy": "[admin_uid]",
      "expiresAt": [30_days_from_now]
    }
    users/{uid} {
      "isActive": true,
      "approvalStatus": "approved"
    }
    ```
- **User Sees Verification**:
  - `refreshUserProfile()` detects `status === 'verified'`
  - Auto-redirect to dashboard
  - Console log: `✅ Payment verified! Redirecting...`
  - Toast: "Payment verified! You can now start processing invoices."
- **Exit**: Redirect to `/` (dashboard)

---

## **PHASE 4: DASHBOARD REDIRECT & FIRST UPLOAD**

### Entry: Dashboard (`/`)
- **Redirect Logic** (in ProtectedRoute):
  - If `paymentStatus.status === 'verified'` → Allow `/dashboard` access ✅
  - If verified → LandingPage or MultiUploadDashboard
- **File**: [MultiUploadDashboard.tsx](invoice-app-v2/src/pages/MultiUploadDashboard.tsx)
  - OR [ModernInvoiceProcessingDashboard.tsx](invoice-app-v2/src/pages/ModernInvoiceProcessingDashboard.tsx)
  - Default appears to be `MultiUploadDashboard`

### Dashboard Setup
- **Requirements Check**:
  - ✅ User authenticated
  - ✅ Organization assigned
  - ✅ Workspace initialized
  - ✅ Payment verified
  - ✅ All permissions loaded
- **Initial State**:
  - Empty journal entries table
  - Empty file queue
  - No client organization selected yet (can select multiple)

### First Invoice Upload Section
- **File Upload Area**:
  - Drag & drop zone: "Drop files here or click to upload"
  - Accepts: PDF, PNG, JPG, JPEG
  - Max 10 files per batch
- **User Action - Upload**:
  1. Click on upload area or drag file
  2. File picker opens (or drag completed)
  3. Selected files appear in "Processing Queue"
  4. Upload initiates automatically
- **Upload Process**:
  - **File Validation**:
    - Check file size (max per user limits)
    - Check file type (PDF/image only)
    - Check usage limits: `checkUsageLimits()`
  - **Call Backend**:
    - `orchestratorApiService.processInvoice(file, clientOrg)`
    - Sends file to backend via `initial-api/upload`
  - **Backend Processing** (simplified):
    1. `initial-api` receives file + auth token
    2. Validates user permissions
    3. Creates Cloud Storage entry
    4. Creates job in Firestore at `users/{uid}/jobs/{jobId}`
    5. Enqueues job in Cloud Tasks for processing pipeline
    6. Returns `jobId` to frontend
  - **Frontend Updates**:
    - File status: `uploading` → `initializing` → `processing` → `completed`/`failed`
    - Progress bar shows percentage
    - Once completed, extracts journal entries displayed in table below

### File State Transitions
```
pending
  ↓
uploading (0-30%)
  ↓
initializing (30%)
  ↓
processing (30-95%)
  ↓
completed/failed (100%)
```

### First Image Processing Pipeline
Once file uploaded, it goes through:

1. **initial-api** (`/upload`)
   - Validates auth token
   - Stores file in Cloud Storage
   - Creates job record
   - Returns jobId

2. **orchestrator-service** (`/process-invoice/{jobId}`)
   - Routes to appropriate extractor based on file type
   - Manages job lifecycle
   - Handles retries and failures

3. **data-extractor-v2** (`/extract`)
   - If PDF: Extracts images/pages
   - If Image: Proceeds directly
   - Uses OpenAI Vision API to extract invoice data
   - Detects line items, totals, dates, vendors, etc.

4. **enrichment-worker** (`/enrich-job`)
   - Enriches extracted data
   - Validates line items
   - Calculates totals
   - Matches vendor names

5. **field-standardizer-v2** (`/standardize`)
   - Normalizes field formats
   - Converts amounts to standard format
   - Standardizes dates
   - Maps to journal entry fields

6. **data-combiner** (`/combine`)
   - Combines all processing results
   - Creates final JSON output
   - Saves journal entries to Firestore
   - Updates job status to "COMPLETED"
   - Saves at: `users/{uid}/results/{resultId}`

### Journal Entries Saved
Firestore collection: `users/{uid}/invoice_results/`

```json
{
  "id": "[resultId]",
  "jobId": "[jobId]",
  "status": "COMPLETED",
  "fileName": "[original_file_name]",
  "uploadedAt": [timestamp],
  "processedAt": [timestamp],
  "journalEntries": [
    {
      "debit_account": "Vendor Payables",
      "debit_amount": 1000,
      "credit_account": "Cash",
      "credit_amount": 1000,
      "description": "[extracted from invoice]",
      "vendor_name": "[extracted]",
      "invoice_number": "[extracted]",
      "invoice_date": "[extracted]"
    }
  ],
  "extraction": {
    "vendor": "...",
    "invoiceNumber": "...",
    "invoiceDate": "...",
    "totalAmount": 1000,
    "lineItems": [...]
  }
}
```

### Dashboard Updates
- **Results Table**: Shows journal entries with columns:
  - Debit Account | Debit Amount | Credit Account | Credit Amount | Description
- **File Queue**: Shows processing status
- **Stats Panel**: Shows:
  - Files uploaded
  - Files processing
  - Files completed
  - Errors
- **Image Viewer**: Click on row to see original invoice image

### Download & Archive Options
- **Download CSV**: Exports all journal entries to CSV
- **Archive**: Moves completed results to archive collection
  - Archive path: `users/{uid}/invoice_results_archive/`
  - Only triggered by:
    - ✅ Click "Download CSV"
    - ✅ Click "Archive" button
    - ✅ Click "Logout"
    - ❌ NOT on tab switch (prevented bug)
    - ❌ NOT on page hide

---

## **DATA FLOW VISUALIZATION**

```
┌─────────────────────────────────────────────────────────┐
│ PHASE 1: AUTHENTICATION                                  │
│ Landing Page (/) → Login Page (/login)                  │
│ ↓                                                        │
│ Firebase Auth (Google/Email) + Create User Profile      │
│ Firestore: users/{uid} created with status="pending"    │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ PHASE 2: REDIRECT CHECK                                  │
│ AuthProtectedRoute checks paymentStatus                 │
│ If status="pending" → /onboarding                       │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ PHASE 3: 6-STEP ONBOARDING                               │
│                                                          │
│ Step 1: Account Created (UI only)                       │
│ Step 2: Organization Setup                             │
│         → Firestore: organizations/{orgId}             │
│ Step 3: Workspace Initialization                        │
│         → Firestore: workspace_initialized=true        │
│ Step 4: Plan Selection                                  │
│         → Firestore: paymentStatus.amount=999          │
│ Step 5: Payment Submission                              │
│         → User enters transaction reference            │
│         → Firestore: paymentStatus.status="paid"       │
│         → Firestore: paymentStatus.transactionRef="..." │
│ Step 6: Verification Waiting                            │
│         → Auto-check every 30s                         │
│         → Admin approves → status="verified"           │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ PHASE 4: DASHBOARD & FIRST UPLOAD                        │
│ User redirected to / (dashboard)                        │
│ Dashboard: MultiUploadDashboard or Modern variant       │
│                                                          │
│ Upload Section:                                          │
│ - Drag/drop or click to upload invoice                  │
│ - File sent to initial-api/upload                       │
│                                                          │
│ Processing Pipeline:                                     │
│ ① initial-api: Validate, store, create job             │
│ ② orchestrator: Route and manage                        │
│ ③ data-extractor-v2: Extract via OpenAI                │
│ ④ enrichment-worker: Enrich data                        │
│ ⑤ field-standardizer-v2: Normalize                      │
│ ⑥ data-combiner: Combine & save                         │
│                                                          │
│ Results:                                                 │
│ - Journal entries saved to Firestore                    │
│ - Displayed in dashboard table                          │
│ - Image viewable in right panel                         │
│ - CSV export available                                  │
└─────────────────────────────────────────────────────────┘
```

---

## **KEY FILES REFERENCE**

| Phase | File | Component | Purpose |
|-------|------|-----------|---------|
| 1 | `pages/LandingPage.tsx` | LandingPage | Entry point |
| 1 | `pages/Login.tsx` | Login | Auth page |
| 1 | `contexts/AuthContext.tsx` | AuthProvider | Auth management |
| 2 | `components/auth/ProtectedRoute.tsx` | AuthProtectedRoute | Route guarding |
| 3.1-3.2 | `components/onboarding/OnboardingFlow.tsx` | OnboardingFlow | Flow coordinator |
| 3.2 | `components/onboarding/OrganizationStep.tsx` | OrganizationStep | Org setup |
| 3.3 | `components/onboarding/WorkspaceStep.tsx` | WorkspaceStep | Workspace init |
| 3.5 | `components/onboarding/PaymentStep.tsx` | PaymentStep | Payment form |
| 3.6 | `components/onboarding/VerificationStep.tsx` | VerificationStep | Payment verify |
| 4 | `pages/MultiUploadDashboard.tsx` | MultiUploadDashboard | Main dashboard |
| 4 | `services/orchestratorApiService.ts` | orchestratorApiService | Backend API |
| 4 | `services/userService.ts` | userService | User management |

---

## **FIRESTORE DATA SCHEMA**

### User Profile Document
```
users/{uid}
├── uid: string
├── email: string
├── displayName: string
├── role: 'user' | 'org_admin' | 'super_admin'
├── organizationId: string
├── organizationRole: 'admin' | 'member'
├── paymentStatus: {
│   ├── status: 'pending' | 'paid' | 'verified' | 'expired'
│   ├── amount: number
│   ├── transactionRef: string
│   ├── paidAt: Timestamp
│   ├── verifiedAt: Timestamp
│   ├── verifiedBy: string (admin UID)
│   └── expiresAt: Timestamp
├── workspace_initialized: boolean
├── createdAt: Timestamp
├── updatedAt: Timestamp
└── lastLoginAt: Timestamp
```

### Organizations
```
organizations/{orgId}
├── id: string
├── name: string
├── ownerId: string
└── createdAt: Timestamp
```

### Invoice Results
```
users/{uid}/invoice_results/{resultId}
├── fileName: string
├── uploadedAt: Timestamp
├── processedAt: Timestamp
├── status: 'PENDING' | 'COMPLETED' | 'ERROR'
├── journalEntries: [{...}, {...}, ...]
└── extraction: {
    ├── vendor: string
    ├── invoiceNumber: string
    ├── invoiceDate: string
    ├── totalAmount: number
    └── lineItems: [...]
  }
```

---

## **SUMMARY: Full User Journey**

1. **Sign In** (1-2 mins) - User creates account via Google/Email
2. **Create Organization** (1 min) - User names their organization
3. **Initialize Workspace** (2-3 secs) - Backend creates isolated storage
4. **Select Plan** (30 secs) - User chooses monthly/yearly
5. **Submit Payment** (5 mins) - User scans UPI QR, enters transaction ID
6. **Wait for Approval** (2-24 hrs) - Admin verifies payment, approves
7. **Upload Invoice** (< 5 secs) - User uploads first invoice
8. **Process** (10-30 secs) - Backend extracts data via OCR
9. **View Results** (instant) - Journal entries appear in dashboard

**Total Setup Time**: ~10-15 minutes (plus admin approval wait)
**Total Time to First Upload**: ~20 minutes
**Time from Upload to Results**: ~10-30 seconds

