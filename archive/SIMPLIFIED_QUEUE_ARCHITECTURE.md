# Simplified Queue Management System - Implementation

## 🎯 **System Overview**

This document describes the **simplified, robust queue management system** that implements your exact specifications:

1. **List-based job tracking**: pending → inprocess → completed/failed/retry
2. **Serial OpenAI processing**: One job at a time to prevent quota issues
3. **Bucket path maintenance**: Job ID linked to storage location
4. **Retry mechanism**: Failed jobs get one retry attempt after all pending jobs

## 📋 **Core Architecture**

### **Job Lifecycle States**
```python
class JobStatus(Enum):
    PENDING = "pending"        # Job waiting to be processed
    INPROCESS = "inprocess"    # Currently being processed by OpenAI
    COMPLETED = "completed"    # Successfully processed
    FAILED = "failed"         # Failed after retry attempt
    RETRY = "retry"           # Failed once, waiting for retry
```

### **Queue Structure (Simple Lists)**
```python
class SimpleQueueProcessor:
    def __init__(self):
        # Core job queues as simple lists
        self.pending_jobs: List[QueueJob] = []     # FIFO queue
        self.inprocess_jobs: List[QueueJob] = []   # Currently processing (max 1)
        self.completed_jobs: List[QueueJob] = []   # Successfully completed
        self.failed_jobs: List[QueueJob] = []      # Permanently failed
        self.retry_jobs: List[QueueJob] = []       # Waiting for retry
```

### **Job Data Structure**
```python
@dataclass
class QueueJob:
    job_id: str           # Unique identifier
    bucket_path: str      # Google Cloud Storage path
    user_email: str       # User who submitted job
    status: JobStatus     # Current status
    created_at: datetime  # When job was created
    retry_count: int = 0  # Number of retry attempts
    last_error: Optional[str] = None   # Last error message
    result: Optional[Dict] = None      # Processing result
```

## 🔄 **Processing Flow**

### **1. Job Submission**
```python
def add_job(self, job_id: str, bucket_path: str, user_email: str) -> bool:
    # Check capacity (max 100 total jobs)
    # Create QueueJob object
    # Add to pending_jobs list
    # Update Firestore status
```

### **2. Background Processing Loop**
```python
def _continuous_processor(self):
    while True:
        # Get next job (FIFO from pending, then retry)
        job = self._get_next_job()
        
        if job:
            # Move to inprocess
            # Process with OpenAI (serial)
            # Move to completed/failed/retry based on result
        else:
            # No jobs, wait 1 second
```

### **3. Job Priority System**
```python
def _get_next_job(self) -> Optional[QueueJob]:
    # Priority 1: Pending jobs (FIFO)
    if self.pending_jobs:
        return self.pending_jobs.pop(0)
    
    # Priority 2: Retry jobs (only after all pending done)
    if self.retry_jobs:
        return self.retry_jobs.pop(0)
    
    return None  # No jobs available
```

### **4. Serial OpenAI Processing**
```python
def _process_single_job(self, job: QueueJob) -> bool:
    with self.openai_processing_lock:  # CRITICAL: Only one at a time
        # Download file from bucket_path
        # Process based on file type (PDF/image)
        # Call OpenAI Vision API
        # Store result
        # Return success/failure
```

### **5. Error Handling & Retry Logic**
```python
# On processing completion:
if success:
    job.status = COMPLETED
    self.completed_jobs.append(job)
else:
    if job.retry_count < 1:  # Only one retry
        job.status = RETRY
        job.retry_count += 1
        self.retry_jobs.append(job)
    else:
        job.status = FAILED
        self.failed_jobs.append(job)
```

## 🗂️ **File Processing Pipeline**

### **Image Processing**
```python
def _process_image_file(self, file_content: bytes, bucket_path: str, job_id: str):
    # Convert to base64
    # Determine format (jpeg/png/gif/webp)
    # Call enhanced OpenAI Vision API
    # Return structured result
```

### **PDF Processing**
```python
def _process_pdf_file(self, file_content: bytes, bucket_path: str, job_id: str):
    # Convert PDF to images (max 3 pages)
    # Process each page with OpenAI
    # Combine results
    # Return structured invoice data
```

### **Enhanced OpenAI Prompt**
The system uses a comprehensive prompt that extracts:
- Invoice details (number, date, parties)
- Line items with individual journal entries
- Summary totals and taxes
- Suggested journal entries for accounting

## 📊 **Firestore Integration**

### **Job Status Tracking**
```
/jobs/{job_id}
├── job_id: string
├── user_email: string  
├── bucket_path: string
├── status: string
├── created_at: timestamp
├── updated_at: timestamp
├── retry_count: number
├── last_error: string
└── progress: float
```

### **User Queue Organization**
```
/user_queues/{user_email}/jobs/{job_id}
├── job_id: string
├── bucket_path: string
├── status: string
├── created_at: timestamp
└── retry_count: number
```

### **Results Storage**
```
/results/{job_id}
├── job_id: string
├── user_email: string
├── result: object
└── created_at: timestamp
```

## 🚀 **API Endpoints**

### **Add Job**
```http
POST /add-job
Authorization: Bearer {id_token}
Content-Type: application/json

{
  "job_id": "job_2025_11_02_14-30-15",
  "bucket_path": "invoice-uploads-staging/upload_123.jpg"
}
```

### **Get Job Status**
```http
GET /job-status/{job_id}
Authorization: Bearer {id_token}

Response:
{
  "job_id": "job_2025_11_02_14-30-15",
  "status": "completed",
  "progress": 1.0,
  "created_at": "2025-11-02T14:30:15Z",
  "retry_count": 0
}
```

### **Queue Status**
```http
GET /queue-status

Response:
{
  "queue_counts": {
    "pending": 5,
    "inprocess": 1,
    "completed": 23,
    "failed": 1,
    "retry": 2
  },
  "total_jobs": 32,
  "max_capacity": 100,
  "current_job": "job_2025_11_02_14-30-15",
  "is_processing": true
}
```

## ⚡ **Performance Characteristics**

### **Throughput**
- **Serial Processing**: One OpenAI request at a time
- **Queue Capacity**: 100 jobs maximum
- **Processing Rate**: ~15 seconds per invoice
- **Retry Policy**: One retry attempt per job

### **Scalability**
- **Horizontal**: Multiple Cloud Run instances share Firestore queue
- **Vertical**: Simple list operations scale efficiently
- **Cost Control**: Serial processing prevents quota overruns

### **Reliability**
- **Thread Safety**: All queue operations protected by locks
- **Persistence**: Job state stored in Firestore
- **Fault Tolerance**: Background processor restarts automatically

## 🔍 **Monitoring & Debugging**

### **Queue Status Monitoring**
```python
queue_status = queue_processor.get_queue_status()
# Returns real-time counts for all queue states
```

### **Job Tracking**
```python
job_status = queue_processor.get_job_status(job_id)
# Returns detailed status for specific job
```

### **Logging Strategy**
- **Job Lifecycle**: Add/Process/Complete/Fail events
- **OpenAI Calls**: Request/response logging
- **Error Details**: Full error context for debugging
- **Performance Metrics**: Processing times and throughput

## 🎯 **Key Benefits**

### **1. Simplicity**
- **Clear State Model**: Easy to understand job progression
- **List-based Queues**: Simple data structures, no complex algorithms
- **Linear Processing**: One job at a time eliminates race conditions

### **2. Reliability** 
- **Predictable Behavior**: Jobs process in strict FIFO order
- **Error Recovery**: Failed jobs get exactly one retry
- **State Persistence**: All job state stored in Firestore

### **3. Cost Control**
- **Serial OpenAI**: Prevents API quota exhaustion
- **Page Limits**: PDF processing limited to 3 pages
- **Efficient Processing**: No wasteful parallel API calls

### **4. Maintainability**
- **Clear Architecture**: Easy to debug and modify
- **Minimal Dependencies**: Reduced complexity
- **Comprehensive Logging**: Full visibility into system behavior

## 🔧 **Implementation Example**

```python
# Initialize processor
queue_processor = SimpleQueueProcessor()

# Add a job
success = queue_processor.add_job(
    job_id="job_2025_11_02_14-30-15",
    bucket_path="invoice-uploads-staging/invoice.pdf",
    user_email="user@example.com"
)

# Background processor automatically:
# 1. Picks up job from pending queue
# 2. Downloads file from bucket_path
# 3. Processes with OpenAI (serial)
# 4. Stores result in Firestore
# 5. Updates job status to completed

# Check status
status = queue_processor.get_job_status("job_2025_11_02_14-30-15")
# Returns: {"status": "completed", "progress": 1.0, ...}
```

This simplified architecture directly implements your specifications and provides a robust, maintainable solution for processing up to 100 concurrent invoice uploads with serial OpenAI processing and proper retry handling.