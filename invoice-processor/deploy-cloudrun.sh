#!/bin/bash

# Set variables
PROJECT_ID="ocrinvoice-466611"
REGION="asia-south1"
SERVICE_NAME="invoice-processor"

echo "Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --max-instances 10 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
  --set-env-vars-from-file .env.yaml \
  --project $PROJECT_ID