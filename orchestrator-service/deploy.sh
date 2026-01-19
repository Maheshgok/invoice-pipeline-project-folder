#!/bin/bash
# Deploy orchestrator-service to Cloud Run

set -e

PROJECT_ID="watch-mail-trial"
REGION="asia-south1"
SERVICE_NAME="orchestrator-service"

echo "🚀 Deploying $SERVICE_NAME to Cloud Run..."

# Build and push to Container Registry
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME --project=$PROJECT_ID

# Deploy to Cloud Run with PDF extractor URL
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --project $PROJECT_ID \
  --memory 256Mi \
  --timeout 60 \
  --concurrency 50 \
  --min-instances 0 \
  --max-instances 10 \
  --set-env-vars "PROJECT_ID=$PROJECT_ID,DATA_EXTRACTOR_URL=https://data-extractor-v2-812016027146.asia-south1.run.app,PDF_EXTRACTOR_URL=https://pdf-extractor-812016027146.asia-south1.run.app" \
  --allow-unauthenticated

echo "✅ Deployment complete!"
echo "🔗 Service URL: https://$SERVICE_NAME-812016027146.asia-south1.run.app"
