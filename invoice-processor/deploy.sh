#!/bin/bash
set -e

# Configuration
PROJECT_ID="ocrinvoice-466611"
REGION="asia-south1"
SERVICE_NAME="invoice-processor"
TRIGGER_NAME="invoice-processor-trigger"
TOPIC_NAME="step-1-initiate"
SERVICE_ACCOUNT="processor@ocrinvoice-466611.iam.gserviceaccount.com"

echo "=== Deploying Invoice Processor to Cloud Run ==="

# Check for OpenAI API key
if [ -z "$OPENAI_KEY_INVOICE" ]; then
    echo "Error: OPENAI_KEY_INVOICE environment variable not set"
    exit 1
fi

# Set the active project
echo "Setting project to: $PROJECT_ID"
gcloud config set project $PROJECT_ID

# Verify Pub/Sub topic exists
echo "Verifying Pub/Sub topic: $TOPIC_NAME"
if ! gcloud pubsub topics describe $TOPIC_NAME --project=$PROJECT_ID; then
    echo "Error: Topic $TOPIC_NAME does not exist"
    exit 1
fi

# Clear existing environment variables
echo "Removing existing environment variables..."
gcloud run services update $SERVICE_NAME \
    --region=$REGION \
    --clear-env-vars

# Deploy to Cloud Run
echo "Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
    --source . \
    --region=$REGION \
    --platform=managed \
    --service-account=$SERVICE_ACCOUNT \
    --memory=1024Mi \
    --timeout=540s \
    --min-instances=0 \
    --max-instances=10 \
    --env-vars-file=.env.yaml \
    --clear-base-image

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)')
echo "Service URL: $SERVICE_URL"

# Check if Eventarc trigger exists
if ! gcloud eventarc triggers describe $TRIGGER_NAME --location=$REGION 2>/dev/null; then
    echo "Creating Pub/Sub trigger..."
    gcloud eventarc triggers create $TRIGGER_NAME \
        --location=$REGION \
        --destination-run-service=$SERVICE_NAME \
        --destination-run-region=$REGION \
        --event-filters="type=google.cloud.pubsub.topic.v1.messagePublished" \
        --transport-topic="projects/$PROJECT_ID/topics/$TOPIC_NAME" \
        --service-account=$SERVICE_ACCOUNT
else
    echo "Trigger $TRIGGER_NAME already exists"
fi

# Verify deployment
echo "=== Deployment Complete ==="
echo "Service Details:"
echo "Name: $SERVICE_NAME"
echo "Region: $REGION"
echo "URL: $SERVICE_URL"
echo "Trigger: $TRIGGER_NAME"
echo "Topic: $TOPIC_NAME"
echo "Service Account: $SERVICE_ACCOUNT"
