#!/bin/bash

# Invoice Data Enrichment Service Deployment
set -e

echo "🚀 Deploying Enrichment Service to Cloud Run..."

# Configuration
PROJECT_ID="watch-mail-trial"
REGION="asia-south1"
SERVICE_NAME="enrichment-service"
SERVICE_ACCOUNT="enrichment-service-sa@watch-mail-trial.iam.gserviceaccount.com"

# Deploy with service account and secret access
gcloud run deploy $SERVICE_NAME \
    --source . \
    --platform managed \
    --region $REGION \
    --project $PROJECT_ID \
    --allow-unauthenticated \
    --service-account $SERVICE_ACCOUNT \
    --memory 1Gi \
    --cpu 1 \
    --concurrency 100 \
    --max-instances 10 \
    --timeout 300 \
    --set-env-vars GOOGLE_CLOUD_PROJECT=$PROJECT_ID,OPENAI_SECRET_NAME=enrichment-service-openai-key

echo "✅ Enrichment Service deployed successfully!"

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID --format='value(status.url)')

echo "🔗 Service URL: $SERVICE_URL"
echo "🔗 Health Check: $SERVICE_URL/health"
echo "🔗 Enrich Data: POST $SERVICE_URL/enrich"