# Google Cloud Function - Signed URL Generator

## Overview
This Cloud Function generates signed URLs for uploading images directly to Google Cloud Storage with proper CORS handling.

## Files
- `main.py` - The main Cloud Function implementation
- `requirements.txt` - Python dependencies
- `deploy-function.sh` - Deployment script
- `DEPLOYMENT_INSTRUCTIONS.md` - This file

## Prerequisites

1. **Google Cloud SDK installed and authenticated:**
   ```bash
   # Install gcloud CLI
   curl https://sdk.cloud.google.com | bash
   exec -l $SHELL
   
   # Authenticate
   gcloud auth login
   gcloud auth application-default login
   ```

2. **Set your project ID:**
   ```bash
   gcloud config set project YOUR_PROJECT_ID
   ```

3. **Enable required APIs:**
   ```bash
   gcloud services enable cloudfunctions.googleapis.com
   gcloud services enable cloudbuild.googleapis.com
   gcloud services enable storage.googleapis.com
   ```

## Deployment

### Option 1: Using the deployment script (Recommended)

1. Edit the configuration in `deploy-function.sh`:
   ```bash
   export PROJECT_ID="your-project-id"
   export REGION="us-central1"  # Choose your preferred region
   export FUNCTION_NAME="get-signed-url"
   export BUCKET_NAME="your-bucket-name"
   ```

2. Run the deployment script:
   ```bash
   # On Unix/Linux/macOS:
   chmod +x deploy-function.sh
   ./deploy-function.sh
   
   # On Windows (using Git Bash or similar):
   bash deploy-function.sh
   ```

### Option 2: Manual deployment

```bash
# Set variables
export PROJECT_ID="your-project-id"
export REGION="us-central1"
export FUNCTION_NAME="get-signed-url" 
export BUCKET_NAME="your-bucket-name"

# Deploy function
gcloud functions deploy $FUNCTION_NAME \
  --gen2 \
  --runtime=python311 \
  --region=$REGION \
  --source=. \
  --entry-point=get_signed_url \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars BUCKET_NAME=$BUCKET_NAME \
  --memory=256MB \
  --timeout=60s
```

## Environment Variables

The function requires the following environment variable:
- `BUCKET_NAME` - The name of your Google Cloud Storage bucket

## API Usage

### Endpoint
The deployed function will be available at:
```
https://REGION-PROJECT_ID.cloudfunctions.net/FUNCTION_NAME
```

### CORS Support
The function handles OPTIONS preflight requests with these headers:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS`
- `Access-Control-Allow-Headers: Authorization, Content-Type`
- `Access-Control-Max-Age: 3600`

### Request Format
```bash
POST https://REGION-PROJECT_ID.cloudfunctions.net/get-signed-url
Content-Type: application/json

{
  "fileName": "my-image.jpg",
  "contentType": "image/jpeg"
}
```

### Response Format
```json
{
  "signedUrl": "https://storage.googleapis.com/bucket/uploads/2024/01/15/10-30-45_my-image.jpg?X-Goog-Algorithm=...",
  "fileName": "my-image.jpg",
  "bucket": "your-bucket-name"
}
```

### Supported Content Types
- `image/jpeg`
- `image/jpg` 
- `image/png`
- `image/gif`
- `image/webp`
- `application/pdf`

## Frontend Usage Example

```javascript
// Generate signed URL
const response = await fetch('https://REGION-PROJECT_ID.cloudfunctions.net/get-signed-url', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    fileName: 'my-image.jpg',
    contentType: 'image/jpeg'
  })
});

const { signedUrl } = await response.json();

// Upload file directly to GCS
const uploadResponse = await fetch(signedUrl, {
  method: 'PUT',
  headers: {
    'Content-Type': 'image/jpeg'
  },
  body: fileBlob
});

if (uploadResponse.ok) {
  console.log('Upload successful!');
}
```

## Testing

### Test CORS preflight:
```bash
curl -X OPTIONS "https://REGION-PROJECT_ID.cloudfunctions.net/get-signed-url" \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v
```

### Test signed URL generation:
```bash
curl -X POST "https://REGION-PROJECT_ID.cloudfunctions.net/get-signed-url" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "test-image.jpg",
    "contentType": "image/jpeg"
  }'
```

## Security Considerations

1. **Bucket Permissions**: Ensure your bucket has appropriate IAM permissions
2. **CORS Policy**: The bucket should have CORS configured to allow uploads
3. **Content Type Validation**: The function validates allowed content types
4. **URL Expiration**: Signed URLs expire after 15 minutes

## Bucket CORS Configuration

If not automatically set by the deployment script, configure CORS manually:

```bash
# Create cors.json
echo '[{
  "origin":["*"],
  "method":["GET","PUT","POST","OPTIONS"],
  "responseHeader":["Content-Type","Access-Control-Allow-Origin"],
  "maxAgeSeconds":3600
}]' > cors.json

# Apply CORS policy
gsutil cors set cors.json gs://YOUR_BUCKET_NAME
```

## Monitoring and Logs

View function logs:
```bash
gcloud functions logs read get-signed-url --region=REGION
```

Monitor function metrics in the Google Cloud Console:
- Cloud Functions → your-function → Metrics

## Troubleshooting

1. **Permission Errors**: Ensure the function's service account has Storage Admin or appropriate permissions
2. **CORS Issues**: Verify bucket CORS configuration
3. **Invalid Content Type**: Check that the content type is in the allowed list
4. **Timeout**: Increase function timeout if needed (max 540s for gen2 functions)