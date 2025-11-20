#!/usr/bin/env bash
set -e

#-bucket Config
PROJECT_ID="ocrinvoice-466611"
REGION="asia-south1"
SERVICE_ACCOUNT="cloudrun-invoice-uploader@ocrinvoice-466611.iam.gserviceaccount.com"
BUCKET_NAME="ocr-invoice-raw-files-bucket"
FUNCTION_NAME="get_signed_url"

# Set project
gcloud config set project $PROJECT_ID

# Ensure bucket exists
gcloud storage buckets create $BUCKET_NAME --location=$REGION || echo "Bucket already exists."

# Deploy function
gcloud functions deploy $FUNCTION_NAME \
  --gen2 \
  --runtime=python311 \
  --region=$REGION \
  --entry-point=get_signed_url \
  --trigger-http \
  --allow-unauthenticated \
  --service-account=$SERVICE_ACCOUNT \
  --set-env-vars="BUCKET_NAME=$BUCKET_NAME"

# Print deployed URL
echo "Deployed function URL:"
gcloud functions describe $FUNCTION_NAME \
  --region=$REGION \
  --format='value(serviceConfig.uri)'
