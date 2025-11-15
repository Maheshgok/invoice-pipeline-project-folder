# Invoice Processor Cloud Function

This Cloud Function processes invoice images uploaded to Google Cloud Storage by:
1. Extracting information using OpenAI's Vision API
2. Storing results in Firestore
3. Handling errors with retries and proper status updates

## Architecture

The service works in the following flow:
1. File is uploaded to GCS bucket
2. Pub/Sub message is published with file details
3. Cloud Function is triggered by the Pub/Sub message
4. Invoice is processed and results saved to Firestore

## Prerequisites

- Google Cloud project with required APIs enabled
- Service account with necessary permissions
- OpenAI API key stored in Secret Manager
- Python 3.8+

## Required Permissions

The service account needs the following roles:
- `roles/storage.objectViewer` - To read files from GCS
- `roles/datastore.user` - To read/write to Firestore
- `roles/secretmanager.secretAccessor` - To access OpenAI API key

## Environment Variables

Required environment variables in `.env.yaml`:
```yaml
OPENAI_API_KEY: ${OPENAI_API_KEY}  # From Secret Manager
GOOGLE_CLOUD_PROJECT: "your-project-id"
PUBSUB_TOPIC_STEP_1: "step-1-initiate"
FIRESTORE_COLLECTION: "processing_results"
```

## Deployment

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Deploy the function:
```bash
./deploy.sh
```

## Error Handling

The function implements robust error handling:
- Retries for transient failures (using tenacity)
- Proper error status updates in Firestore
- Detailed error logging
- Graceful failure handling

## Testing

Run tests with:
```bash
python -m pytest test_*.py
```

## Message Format

Expected Pub/Sub message format:
```json
{
    "bucket": "your-bucket-name",
    "object_path": "path/to/invoice.pdf",
    "request_id": "optional-unique-id"
}
```

## Response Format

Successful processing result in Firestore:
```json
{
    "request_id": "unique-id",
    "object_path": "path/to/invoice.pdf",
    "status": "completed",
    "extracted_data": {
        // Extracted invoice data
    },
    "created_at": "timestamp",
    "processed_at": "timestamp"
}
```

Error result in Firestore:
```json
{
    "request_id": "unique-id",
    "status": "error",
    "error": {
        "type": "error_type",
        "message": "detailed error message",
        "timestamp": "error_timestamp"
    }
}
```

## Monitoring

- Use Cloud Logging to view function logs
- Check Firestore for processing results and errors
- Monitor Cloud Function metrics in Cloud Console