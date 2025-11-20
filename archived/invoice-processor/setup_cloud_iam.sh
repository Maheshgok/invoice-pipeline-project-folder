#!/bin/bash

# Variables
PROJECT_ID="ocrinvoice-466611"
SERVICE_NAME="invoice-processor"
REGION="asia-south1"

# Get the service account email
SERVICE_ACCOUNT=$(gcloud run services describe $SERVICE_NAME \
  --region $REGION \
  --format='value(serviceAccountEmail)')

# If service account is not set, use the default compute service account
if [ -z "$SERVICE_ACCOUNT" ]; then
  SERVICE_ACCOUNT="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
fi

echo "Setting up IAM roles for service account: $SERVICE_ACCOUNT"

# Grant necessary roles
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/storage.objectViewer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/firestore.writer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/pubsub.publisher"

# Grant additional monitoring roles for better observability
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/monitoring.metricWriter"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/cloudtrace.agent"

echo "IAM roles setup completed"