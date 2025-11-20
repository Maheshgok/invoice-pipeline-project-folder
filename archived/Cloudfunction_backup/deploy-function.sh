#!/bin/bash
set -e

# --- Configuration ---
export PROJECT_ID="ocrinvoice-466611"
export REGION="asia-south1"
export FUNCTION_NAME="get-signed-url"
export BUCKET_NAME="ocr-invoice-raw-files-bucket"

echo "--- Deploying Google Cloud Function: ${FUNCTION_NAME} ---"

# 1. Set the active GCP project
echo "1. Setting GCP project to ${PROJECT_ID}..."
gcloud config set project ${PROJECT_ID}

# 2. Enable required Google Cloud services
echo "2. Enabling required APIs..."
gcloud services enable \
  cloudfunctions.googleapis.com \
  cloudbuild.googleapis.com \
  storage.googleapis.com \
  logging.googleapis.com

# 3. Create bucket if it doesn't exist (optional)
echo "3. Checking if bucket exists..."
if ! gsutil ls -b gs://${BUCKET_NAME} >/dev/null 2>&1; then
    echo "Creating bucket ${BUCKET_NAME}..."
    gsutil mb -p ${PROJECT_ID} -c STANDARD -l ${REGION} gs://${BUCKET_NAME}
    echo "Setting bucket CORS policy..."
    echo '[{"origin":["*"],"method":["GET","PUT","POST","OPTIONS"],"responseHeader":["Content-Type","Access-Control-Allow-Origin"],"maxAgeSeconds":3600}]' > cors.json
    gsutil cors set cors.json gs://${BUCKET_NAME}
    rm cors.json
else
    echo "Bucket ${BUCKET_NAME} already exists"
fi

# 4. Deploy the Cloud Function
echo "4. Deploying Cloud Function..."
gcloud functions deploy ${FUNCTION_NAME} \
  --gen2 \
  --runtime=python311 \
  --region=${REGION} \
  --source=. \
  --entry-point=get_signed_url \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars BUCKET_NAME=${BUCKET_NAME} \
  --memory=256MB \
  --timeout=60s

# 5. Get the function URL
echo "--- Deployment Complete ---"
FUNCTION_URL=$(gcloud functions describe ${FUNCTION_NAME} --region=${REGION} --format="value(serviceConfig.uri)")
echo "Function URL: ${FUNCTION_URL}"

# 6. Test the function
echo "--- Testing Function ---"
echo "Testing OPTIONS request (CORS preflight)..."
curl -X OPTIONS "${FUNCTION_URL}" \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v

echo -e "\n\nTesting POST request..."
curl -X POST "${FUNCTION_URL}" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "test-image.jpg",
    "contentType": "image/jpeg"
  }' \
  -v

echo -e "\n\n--- Setup Complete ---"
echo "Your function is ready at: ${FUNCTION_URL}"
echo "Environment variables set:"
echo "  BUCKET_NAME: ${BUCKET_NAME}"