#!/bin/bash

# Cloud Tasks Queue Setup Script
# This script creates the necessary queues for invoice processing

PROJECT_ID="ocrinvoice-466611"
LOCATION="asia-south1"

echo "Setting up Cloud Tasks queues for invoice processing..."

# Main processing queue
echo "Creating main processing queue..."
gcloud tasks queues create invoice-processing-queue \
  --location=$LOCATION \
  --max-dispatches-per-second=2 \
  --max-concurrent-dispatches=3 \
  --max-attempts=3 \
  --min-backoff=60s \
  --max-backoff=300s \
  --max-retry-duration=3600s \
  --project=$PROJECT_ID

# High priority queue for premium users
echo "Creating high priority queue..."
gcloud tasks queues create invoice-processing-priority \
  --location=$LOCATION \
  --max-dispatches-per-second=5 \
  --max-concurrent-dispatches=5 \
  --max-attempts=3 \
  --min-backoff=30s \
  --max-backoff=180s \
  --max-retry-duration=3600s \
  --project=$PROJECT_ID

# Dead letter queue for failed tasks
echo "Creating dead letter queue..."
gcloud tasks queues create invoice-processing-deadletter \
  --location=$LOCATION \
  --max-dispatches-per-second=1 \
  --max-concurrent-dispatches=1 \
  --max-attempts=1 \
  --project=$PROJECT_ID

echo "Queues created successfully!"

# Grant necessary permissions
SERVICE_ACCOUNT="$PROJECT_ID@appspot.gserviceaccount.com"

echo "Granting Cloud Tasks permissions..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/cloudtasks.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/cloudtasks.enqueuer"

echo "Setup completed!"
echo ""
echo "Environment variables to add to Netlify:"
echo "USE_QUEUING=true"
echo "GOOGLE_CLOUD_PROJECT=$PROJECT_ID"
echo "REGION=$LOCATION"
echo "QUEUE_NAME=invoice-processing-queue"