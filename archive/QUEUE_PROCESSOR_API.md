# Queue Processor API Documentation

## Overview
This document provides complete API specifications for the Invoice Queue Processor service deployed on Google Cloud Run.

**Service URL:** `https://queue-processor-545188726513.asia-south1.run.app`

**Version:** 1.0  
**Last Updated:** November 2, 2025

---

## Authentication

The API uses Google OAuth2 ID tokens for authentication.

### Authentication Flow
1. User signs in with Google OAuth2
2. Frontend receives ID token
3. Include token in API requests as Bearer token

### Headers Required
```
Authorization: Bearer <google_id_token>
Content-Type: application/json
```

### Google Client ID
```
545188726513-p6agkohpdihjp8afd2jbmd7ocr62ut06.apps.googleusercontent.com
```

---

## CORS Configuration

The service supports cross-origin requests with the following configuration:

- **Allowed Origins:** `*` (all origins)
- **Allowed Headers:** `Content-Type, Authorization`
- **Allowed Methods:** `GET, PUT, POST, DELETE, OPTIONS`
- **Preflight:** Automatic OPTIONS handling for all endpoints

---

## API Endpoints

### 1. Health Check

**Endpoint:** `GET /health`  
**Authentication:** None  
**Purpose:** Check service health and get system status

#### Response Example
```json
{
  "status": "healthy",
  "timestamp": "2025-11-02T18:15:00.000Z",
  "queue_status": {
    "pending": 3,
    "inprocess": 1,
    "done": 12,
    "failed": 0,
    "retrying": 0,
    "sent_results": 10
  },
  "processor_stats": {
    "running": true,
    "total_processed": 13
  }
}
```

#### Status Codes
- `200` - Service healthy
- `500` - Service error

---

### 2. Process File

**Endpoint:** `POST /process-file`  
**Authentication:** Required  
**Purpose:** Add file to processing queue

#### Request Headers
```
Authorization: Bearer <google_id_token>
Content-Type: application/json
```

#### Request Body
```json
{
  "bucket_path": "gs://your-bucket-name/path/to/invoice.jpg"
}
```

#### Response Example (Success)
```json
{
  "status": "queued",
  "job_id": "job_2025_11_02_18-15-30_1234",
  "message": "File added to processing queue",
  "queue_position": 4
}
```

#### Status Codes
- `200` - File queued successfully
- `400` - Bad request (missing bucket_path)
- `401` - Authentication failed
- `500` - Internal server error

#### Error Response Example
```json
{
  "error": "Missing bucket_path"
}
```

---

### 3. Get Results

**Endpoint:** `GET /get-results/<user_email>`  
**Authentication:** Required  
**Purpose:** Get completed results for user (at-most-once delivery)

#### Request Headers
```
Authorization: Bearer <google_id_token>
```

#### URL Parameters
- `user_email` - Email address of the authenticated user

#### Response Example (With Results)
```json
{
  "status": "success",
  "results": [
    {
      "job_id": "job_2025_11_02_18-15-30_1234",
      "status": "completed",
      "result": {
        "invoice_data": {
          "invoice_number": "INV-2025-001",
          "date": "2025-11-02",
          "vendor": "ABC Company",
          "total_amount": 1250.00,
          "line_items": [
            {
              "description": "Service Fee",
              "quantity": 1,
              "unit_price": 1000.00,
              "total": 1000.00
            },
            {
              "description": "Tax",
              "quantity": 1,
              "unit_price": 250.00,
              "total": 250.00
            }
          ]
        },
        "confidence": 0.95,
        "processing_time": 3.2
      },
      "processed_at": "2025-11-02T18:20:00.000Z",
      "user_email": "user@example.com"
    }
  ],
  "count": 1
}
```

#### Response Example (No New Results)
```json
{
  "status": "no_new_results",
  "results": [],
  "count": 0
}
```

#### Response Example (Failed Job)
```json
{
  "status": "success",
  "results": [
    {
      "job_id": "job_2025_11_02_18-15-30_5678",
      "status": "failed",
      "error": "Image format not supported",
      "retry_count": 1,
      "failed_at": "2025-11-02T18:25:00.000Z",
      "user_email": "user@example.com"
    }
  ],
  "count": 1
}
```

#### Status Codes
- `200` - Success (may include empty results)
- `401` - Authentication failed
- `403` - Unauthorized (wrong user email)
- `500` - Internal server error

#### Important Notes
- **At-most-once delivery:** Each result is delivered only once
- **Mixed results:** Response may include both completed and failed jobs
- **Real-time:** Results are available as soon as processing completes

---

### 4. Job Status

**Endpoint:** `GET /job-status/<job_id>`  
**Authentication:** Required  
**Purpose:** Get status of a specific job for polling

#### Request Headers
```
Authorization: Bearer <google_id_token>
```

#### URL Parameters
- `job_id` - ID of the job to check

#### Response Example
```json
{
  "job_id": "job_2025_11_02_18-15-30_1234",
  "status": "processing",
  "progress": 0.5,
  "created_at": "2025-11-02T18:15:30.000Z",
  "retry_count": 0,
  "user_email": "user@example.com"
}
```

#### Status Values
- `pending` - Job waiting in queue
- `processing` - Job currently being processed  
- `completed` - Job finished successfully
- `failed` - Job failed after retries
- `retrying` - Job failed but will be retried

#### Status Codes
- `200` - Success
- `401` - Authentication failed
- `404` - Job not found or access denied
- `500` - Internal server error

---

### 5. Queue Status

**Endpoint:** `GET /queue-status`  
**Authentication:** None  
**Purpose:** Get current queue statistics

#### Response Example
```json
{
  "queue_status": {
    "pending": 5,
    "pending_jobs": [
      "job_2025_11_02_18-30-15_1001",
      "job_2025_11_02_18-30-20_1002",
      "job_2025_11_02_18-30-25_1003",
      "job_2025_11_02_18-30-30_1004",
      "job_2025_11_02_18-30-35_1005"
    ],
    "inprocess": 1,
    "inprocess_jobs": [
      "job_2025_11_02_18-29-45_1000"
    ],
    "done": 15,
    "done_jobs": [
      "job_2025_11_02_18-25-00_0995",
      "job_2025_11_02_18-25-05_0996",
      "job_2025_11_02_18-25-10_0997",
      "job_2025_11_02_18-25-15_0998",
      "job_2025_11_02_18-25-20_0999"
    ],
    "failed": 2,
    "failed_jobs": [
      "job_2025_11_02_18-20-00_0990",
      "job_2025_11_02_18-20-05_0991"
    ],
    "retrying": 0,
    "sent_results": 13
  },
  "processor_stats": {
    "running": true,
    "total_processed": 17,
    "uptime": "2h 45m",
    "last_activity": "2025-11-02T18:30:40.000Z"
  }
}
```

#### Status Codes
- `200` - Success
- `500` - Internal server error

#### Queue Status Fields
- `pending` - Jobs waiting to be processed
- `inprocess` - Jobs currently being processed
- `done` - Successfully completed jobs
- `failed` - Jobs that failed after retry
- `retrying` - Jobs currently being retried
- `sent_results` - Results already delivered to users

---

## Frontend Integration Guide

### 1. Environment Configuration

```javascript
// Frontend environment variables
const API_CONFIG = {
  BASE_URL: 'https://queue-processor-545188726513.asia-south1.run.app',
  GOOGLE_CLIENT_ID: '545188726513-p6agkohpdihjp8afd2jbmd7ocr62ut06.apps.googleusercontent.com'
};
```

### 2. API Client Example

```javascript
class QueueProcessorAPI {
  constructor(baseUrl, getAuthToken) {
    this.baseUrl = baseUrl;
    this.getAuthToken = getAuthToken;
  }

  async makeRequest(endpoint, options = {}) {
    const token = await this.getAuthToken();
    
    const config = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options.headers
      }
    };

    const response = await fetch(`${this.baseUrl}${endpoint}`, config);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'API request failed');
    }
    
    return response.json();
  }

  // Health check
  async getHealth() {
    return this.makeRequest('/health');
  }

  // Process file
  async processFile(bucketPath) {
    return this.makeRequest('/process-file', {
      method: 'POST',
      body: JSON.stringify({ bucket_path: bucketPath })
    });
  }

  // Get results
  async getResults(userEmail) {
    return this.makeRequest(`/get-results/${userEmail}`);
  }

  // Get queue status
  async getQueueStatus() {
    return this.makeRequest('/queue-status');
  }
}
```

### 3. Polling Strategy

```javascript
class ResultsPoller {
  constructor(api, userEmail, onResults) {
    this.api = api;
    this.userEmail = userEmail;
    this.onResults = onResults;
    this.intervalId = null;
  }

  start(intervalMs = 5000) {
    this.intervalId = setInterval(async () => {
      try {
        const response = await this.api.getResults(this.userEmail);
        if (response.status === 'success' && response.count > 0) {
          this.onResults(response.results);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
```

### 4. Usage Example

```javascript
// Initialize API client
const api = new QueueProcessorAPI(
  API_CONFIG.BASE_URL,
  () => googleUser.getAuthResponse().id_token
);

// Process a file
async function uploadFile(bucketPath) {
  try {
    const result = await api.processFile(bucketPath);
    console.log('File queued:', result.job_id);
    return result;
  } catch (error) {
    console.error('Upload failed:', error.message);
    throw error;
  }
}

// Start polling for results
const poller = new ResultsPoller(
  api, 
  user.email, 
  (results) => {
    results.forEach(result => {
      if (result.status === 'completed') {
        displayInvoiceData(result);
      } else if (result.status === 'failed') {
        showError(result.error);
      }
    });
  }
);

poller.start();
```

---

## Error Handling

### Common Error Codes

| Status | Error | Description | Solution |
|--------|-------|-------------|----------|
| 400 | Missing bucket_path | Request missing required field | Include bucket_path in request |
| 401 | Authentication failed | Invalid or expired token | Refresh Google auth token |
| 403 | Unauthorized access | Wrong user accessing results | Verify user email matches token |
| 500 | Internal server error | Server-side issue | Retry request, contact support |

### Error Response Format
```json
{
  "error": "Error message",
  "details": "Additional error details (optional)"
}
```

---

## Service Features

### Queue Management
- **FIFO Processing:** Files processed in first-in-first-out order
- **4-List System:** pending → inprocess → done/failed
- **Retry Logic:** Failed jobs get one automatic retry
- **At-most-once Delivery:** Results delivered exactly once per user

### Performance
- **Memory:** 1GB per instance
- **CPU:** 1 core per instance
- **Timeout:** 10 minutes per request
- **Auto-scaling:** 0-3 instances based on demand

### Monitoring
- Real-time queue status
- Processing statistics
- Health check endpoint
- Comprehensive logging

---

## Support

For technical issues or questions:
- Check service health: `GET /health`
- Monitor queue status: `GET /queue-status`
- Review error messages for troubleshooting
- Verify authentication tokens are valid

---

**Document Version:** 1.0  
**Service Version:** queue-processor-00045-89b  
**Last Updated:** November 2, 2025