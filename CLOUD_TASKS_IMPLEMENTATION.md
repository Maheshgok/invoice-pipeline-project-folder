# Cloud Tasks Implementation Guide

## Overview

This implementation completely replaces the in-memory queue management system with Google Cloud Tasks, providing better reliability, scalability, and queue management delegation to GCP.

## Architecture Flow

```
📱 User Upload → 🔧 initial-api → ☁️ Cloud Tasks → 🔄 queue-processor → 📊 Firestore
```

### Detailed Flow

1. **User uploads document** via frontend
2. **initial-api** receives file, uploads to GCS bucket
3. **initial-api** creates Cloud Task with job details
4. **Cloud Tasks** queues and manages the task with retry logic
5. **Cloud Tasks** invokes queue-processor `/process-task` endpoint
6. **queue-processor** processes invoice and stores results in Firestore
7. **Frontend** retrieves results via `/get-results` endpoint

## Key Components

### 1. Cloud Tasks Manager (`cloud_tasks_manager.py`)

**Purpose**: Handles all Cloud Tasks operations including task creation, monitoring, and queue management.

**Key Features**:
- Automatic queue creation with retry configuration
- Task tracking in Firestore for monitoring
- Comprehensive error handling and logging
- Queue statistics and management

**Configuration**:
```python
# Environment variables
PROJECT_ID = "watch-mail-trial"
CLOUD_TASKS_LOCATION = "asia-south1"
CLOUD_TASKS_QUEUE = "invoice-processing-queue"
QUEUE_PROCESSOR_URL = "https://queue-processor-812016027146.asia-south1.run.app"
```

### 2. Updated Initial API (`main.py`)

**Changes**:
- Added Cloud Tasks Manager integration
- Modified `/upload_invoice` to create Cloud Tasks instead of direct processor calls
- Added `/cloud-tasks/status/<job_id>` endpoint for task monitoring
- Added `/cloud-tasks/queue-stats` for queue statistics

**Key Functionality**:
```python
# Create Cloud Task after file upload
task_name = cloud_tasks_manager.create_processing_task(
    job_id=job_id,
    bucket_path=f"{BUCKET_NAME}/{filename}",
    user_email=user_email,
    auth_token=auth_token,
    delay_seconds=5
)
```

### 3. Updated Queue Processor (`main_cloud_tasks.py`)

**Changes**:
- Removed in-memory queue management (`queue_manager.py`)
- Added `/process-task` endpoint for Cloud Tasks callbacks
- Updated result management for Cloud Tasks compatibility
- Added task tracking in Firestore

**Key Features**:
- Handles Cloud Tasks HTTP callbacks
- Processes invoices using existing OpenAI integration
- Stores results directly in Firestore
- Comprehensive error handling with proper HTTP status codes

## Queue Configuration

### Cloud Tasks Queue Settings

```yaml
Name: invoice-processing-queue
Location: asia-south1
Rate Limits:
  max_dispatches_per_second: 10
  max_concurrent_dispatches: 5
Retry Config:
  max_attempts: 3
  max_retry_duration: 30 minutes
  min_backoff: 1 minute
  max_backoff: 1 hour
  max_doublings: 3
```

### Benefits of Cloud Tasks

1. **Reliability**: GCP handles all retry logic and failure scenarios
2. **Scalability**: Automatic scaling based on queue depth
3. **Monitoring**: Built-in metrics and logging via GCP console
4. **Configuration**: Centralized queue configuration and management
5. **No Memory Overhead**: No in-memory queue state to manage

## Deployment

### 1. Deploy Initial API

```bash
cd initial-api/Cloudrun_version
chmod +x deploy-cloud-tasks.sh
./deploy-cloud-tasks.sh
```

### 2. Deploy Queue Processor

```bash
cd queue-processor
chmod +x deploy-cloud-tasks.sh
./deploy-cloud-tasks.sh
```

## Environment Variables

### Initial API
```bash
PROJECT_ID=watch-mail-trial
BUCKET_NAME=ocr-invoice-raw-files-bucket
CLOUD_TASKS_LOCATION=asia-south1
CLOUD_TASKS_QUEUE=invoice-processing-queue
QUEUE_PROCESSOR_URL=https://queue-processor-812016027146.asia-south1.run.app
```

### Queue Processor
```bash
PROJECT_ID=watch-mail-trial
OPENAI_API_KEY_SECRET=openai-api-key-secret
```

## API Endpoints

### Initial API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/upload_invoice` | POST | Upload file and create Cloud Task |
| `/cloud-tasks/status/<job_id>` | GET | Get Cloud Task status |
| `/cloud-tasks/queue-stats` | GET | Get queue statistics |
| `/health` | GET | Health check with Cloud Tasks info |

### Queue Processor Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/process-task` | POST | Handle Cloud Tasks callback |
| `/get-results/<user_email>` | GET | Get processed results |
| `/job-status/<job_id>` | GET | Get specific job status |
| `/health` | GET | Health check |

## Monitoring and Debugging

### GCP Console Monitoring

1. **Cloud Tasks Queue**:
   ```bash
   gcloud tasks queues describe invoice-processing-queue --location=asia-south1
   ```

2. **List Tasks**:
   ```bash
   gcloud tasks list --queue=invoice-processing-queue --location=asia-south1
   ```

3. **View Logs**:
   ```bash
   gcloud logs tail services/initial-api
   gcloud logs tail services/queue-processor
   ```

### Firestore Collections

1. **`cloud_tasks`**: Task tracking and monitoring data
   ```json
   {
     "job_id": "AB1-C2D3-EF45",
     "task_name": "projects/watch-mail-trial/locations/asia-south1/queues/invoice-processing-queue/tasks/...",
     "status": "processing",
     "created_at": "2025-12-01T10:00:00Z",
     "user_email": "user@example.com"
   }
   ```

2. **`invoice_results`**: Processing results (unchanged structure)
   ```json
   {
     "job_id": "AB1-C2D3-EF45",
     "status": "completed",
     "result": { "extracted_data": "..." },
     "processing_mode": "cloud_tasks"
   }
   ```

## Error Handling

### Cloud Tasks Retry Logic

- **HTTP 2xx**: Task successful, removed from queue
- **HTTP 5xx**: Task failed, will retry based on queue configuration
- **HTTP 4xx**: Task failed permanently, removed from queue

### Error Scenarios

1. **Authentication Error (401)**: Task removed, error logged
2. **Processing Error (500)**: Task retried up to 3 times
3. **Resource Not Found (404)**: Task removed, error logged
4. **Timeout**: Task retried with exponential backoff

## Testing

### 1. Test File Upload and Task Creation

```bash
curl -X POST https://initial-api-812016027146.asia-south1.run.app/upload_invoice \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -F "file=@test_invoice.pdf"
```

### 2. Check Queue Status

```bash
curl https://initial-api-812016027146.asia-south1.run.app/cloud-tasks/queue-stats \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN"
```

### 3. Monitor Task Processing

```bash
gcloud tasks list --queue=invoice-processing-queue --location=asia-south1
```

## Migration Benefits

### Before (In-Memory Queue)
- ❌ Queue state lost on service restart
- ❌ Manual retry logic implementation
- ❌ Memory overhead for queue management
- ❌ Limited visibility into queue operations
- ❌ Manual scaling and load management

### After (Cloud Tasks)
- ✅ Persistent queue state managed by GCP
- ✅ Built-in retry logic with exponential backoff
- ✅ Zero memory overhead for queue management
- ✅ Full observability via GCP console and logs
- ✅ Automatic scaling and load distribution

## Troubleshooting

### Common Issues

1. **Tasks not being created**:
   - Check IAM permissions for Cloud Tasks admin
   - Verify queue exists and is in correct region
   - Check service account authentication

2. **Tasks not being processed**:
   - Verify queue processor endpoint is accessible
   - Check authentication tokens in task headers
   - Review Cloud Run service logs

3. **Tasks failing repeatedly**:
   - Check queue processor error handling
   - Verify Firestore permissions
   - Review OpenAI API integration

### Debug Commands

```bash
# Check queue configuration
gcloud tasks queues describe invoice-processing-queue --location=asia-south1

# View failed tasks
gcloud tasks list --queue=invoice-processing-queue --location=asia-south1 --filter="state=FAILED"

# Monitor real-time logs
gcloud logs tail services/queue-processor --format="value(textPayload)"

# Check IAM bindings
gcloud projects get-iam-policy watch-mail-trial
```

## Future Enhancements

1. **Dead Letter Queue**: Handle permanently failed tasks
2. **Priority Queues**: Different priority levels for different document types
3. **Batch Processing**: Group multiple documents for efficiency
4. **Custom Metrics**: Enhanced monitoring and alerting
5. **Queue Purging**: Automated cleanup of old completed tasks

## Conclusion

The Cloud Tasks implementation provides a robust, scalable, and maintainable solution for invoice processing queue management. By delegating queue operations to GCP, we eliminate the complexity of managing queue state while gaining enterprise-grade reliability and monitoring capabilities.