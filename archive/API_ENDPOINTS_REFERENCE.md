# Invoice Processing System - API Endpoints Reference

## 📋 **System Overview**

This document lists all available API endpoints across the invoice processing system components.

---

## 🔄 **1. Queue Processor Service**
**Base URL**: `https://queue-processor-545188726513.asia-south1.run.app`

### Health & System
- `GET /health` - Health check endpoint
  - **Response**: `{"status": "healthy", "timestamp": "2025-10-25T..."}`

### Job Management
- `POST /add-job` - Add job to user's queue
  - **Headers**: `Authorization: Bearer {google_id_token}`
  - **Body**: 
    ```json
    {
      "job_id": "uuid",
      "bucket_path": "bucket-name/path/to/file.jpg"
    }
    ```
  - **Response**: 
    ```json
    {
      "message": "Job added to queue",
      "job_id": "uuid",
      "user_email": "user@example.com",
      "queue_position": "processing_started"
    }
    ```

- `GET /job-status/{job_id}` - Get job status and progress
  - **Headers**: `Authorization: Bearer {google_id_token}`
  - **Response**: 
    ```json
    {
      "job_id": "uuid",
      "status": "pending|processing|completed|failed",
      "progress": 0.75,
      "created_at": "timestamp",
      "updated_at": "timestamp",
      "error_message": "error if failed",
      "result": { "extracted_data": "..." }
    }
    ```

### Admin/Cron
- `POST /process-queues` - Trigger queue processing (used by Cloud Scheduler)
  - **Response**: 
    ```json
    {
      "message": "Queue processing triggered",
      "users_being_processed": 5
    }
    ```

---

## 🏢 **2. Invoice Processor Async Service**
**Base URL**: `https://invoice-processor-async-545188726513.asia-south1.run.app`

### Processing
- `POST /process-invoice` - Process invoice with OpenAI (traditional integration)
  - **Headers**: `Authorization: Bearer {google_id_token}`
  - **Body**: 
    ```json
    {
      "bucket_path": "invoices/uuid/image.jpg",
      "job_id": "uuid"
    }
    ```
  - **Response**: 
    ```json
    {
      "success": true,
      "job_id": "uuid",
      "status": "completed"
    }
    ```

### Status
- `GET /status/{job_id}` - Get job status from Firestore
  - **Response**: 
    ```json
    {
      "job_id": "uuid",
      "status": "completed|processing|failed",
      "timestamp": "2025-10-25T...",
      "bucket_path": "invoices/uuid/image.jpg",
      "invoice_data": {
        "vendor_name": "Company ABC",
        "total_amount": 1250.00,
        "invoice_date": "2025-10-20",
        "invoice_number": "INV-2025-001"
      },
      "openai_response": { "..." },
      "message": "Analysis completed successfully"
    }
    ```

### Queue Management  
- `GET /queue/stats` - Get queue statistics
  - **Response**: 
    ```json
    {
      "queue_length": 5,
      "processing_count": 2,
      "total_results": 150
    }
    ```

---

## 📤 **3. Initial API Service**
**Base URL**: `https://initial-api-545188726513.asia-south1.run.app`

### File Upload
- `POST /upload_invoice` - Upload invoice file and create job
  - **Headers**: 
    - `Authorization: Bearer {google_id_token}`
    - `Content-Type: multipart/form-data`
  - **Body**: Form data with file upload
  - **Response**: 
    ```json
    {
      "job_id": "uuid",
      "bucket_path": "invoices/uuid/filename.jpg",
      "message": "File uploaded successfully",
      "upload_timestamp": "2025-10-25T..."
    }
    ```

### Result Polling
- `GET /poll-result/{request_id}` - Poll for processing results from Firestore
  - **Response (Completed)**: 
    ```json
    {
      "status": "completed",
      "data": {
        "extractedData": { "vendor_name": "...", "total_amount": 1250.00 },
        "objectPath": "gs://bucket/path/file.jpg",
        "processedAt": "2025-10-25T..."
      }
    }
    ```
  - **Response (Pending)**: 
    ```json
    {
      "status": "pending",
      "message": "Processing in progress"
    }
    ```
  - **Response (Error)**: 
    ```json
    {
      "status": "error",
      "error": {
        "type": "processing_error",
        "message": "Error details",
        "timestamp": "2025-10-25T..."
      }
    }
    ```

### Processing Control
- `POST /trigger-processing/{request_id}` - Trigger processing via Pub/Sub
  - **Body**: 
    ```json
    {
      "gcsPath": "gs://bucket/path/to/file.pdf"
    }
    ```
  - **Response**: 
    ```json
    {
      "status": "triggered",
      "requestId": "uuid",
      "message": "Processing started"
    }
    ```

### System Info
- `GET /` - API information endpoint
  - **Response**: 
    ```json
    {
      "service": "initial-api",
      "version": "2.0.0",
      "endpoints": ["/health", "/upload"]
    }
    ```

- `GET /health` - Health check endpoint
  - **Response**: 
    ```json
    {
      "status": "healthy",
      "timestamp": "2025-10-25T...",
      "service": "initial-api"
    }
    ```

---

## 🌐 **4. Netlify Functions (Frontend Integration)**
**Base URL**: `https://invoiceparse.netlify.app/.netlify/functions/`

### Upload Integration
- `POST /upload-invoice` - Upload file and add to queue
  - **Headers**: `Authorization: Bearer {google_id_token}`
  - **Body**: Form data with file
  - **Flow**: 
    1. Forwards to Initial API → uploads file
    2. Calls Queue Processor → adds job to queue
  - **Response**: Same as Initial API `/upload_invoice`

### Status Checking
- `GET /api-status-queue?job_id={uuid}` - Get job status via queue processor
  - **Headers**: `Authorization: Bearer {google_id_token}`
  - **Response**: Same as Queue Processor `/job-status/{job_id}`

---

## 🔐 **Authentication**

All endpoints require Google ID token authentication:
```
Authorization: Bearer {google_id_token}
```

The token is verified against Google OAuth2 and must contain:
- Valid signature
- Correct audience (Google Client ID)
- User email claim

---

## 📊 **Processing Flow**

### Current Queue-Based Flow:
1. **Upload**: `POST /upload-invoice` → Initial API → Queue Processor
2. **Processing**: Queue Processor → OpenAI API → Firestore results
3. **Status**: `GET /api-status-queue` → Queue Processor → Job status

### Legacy Direct Flow (still available):
1. **Upload**: `POST /upload_invoice` → Initial API
2. **Process**: `POST /process-invoice` → Invoice Processor Async
3. **Status**: `GET /status/{job_id}` → Invoice Processor Async

---

## 🎯 **Recommended Usage**

**For new integrations, use the Queue-Based Flow:**
- More reliable with rate limiting
- Better error handling and retries
- Progress tracking
- User-specific FIFO queues

**Frontend should use:**
- `POST /.netlify/functions/upload-invoice` for uploads
- `GET /.netlify/functions/api-status-queue` for status polling

---

## 🛠️ **Error Responses**

All endpoints return consistent error format:
```json
{
  "error": "Error description",
  "details": "Additional error details"
}
```

Common HTTP status codes:
- `400` - Bad Request (missing parameters)
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (access denied)
- `404` - Not Found (job/resource not found)
- `500` - Internal Server Error

---

## 📈 **Rate Limits**

- **Queue Processor**: 1000 requests/minute (configurable)
- **Global**: Single concurrent OpenAI API call
- **Per User**: FIFO queue processing

---

## 🔧 **Configuration**

### Environment Variables:
- `RATE_LIMIT_PER_MINUTE=1000` - Queue processor rate limit
- `GOOGLE_CLIENT_ID` - OAuth client ID
- `OPENAI_API_KEY` - OpenAI API key

### Service Accounts:
- Queue Processor: `queue-processor-sa@ocrinvoice-466611.iam.gserviceaccount.com`
- Other services: Various dedicated service accounts

---

*Last Updated: October 25, 2025*