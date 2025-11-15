#!/bin/bash
set -e

# Configuration
PROJECT_ID="ocrinvoice-466611"
SERVICE_ACCOUNT="processor@ocrinvoice-466611.iam.gserviceaccount.com"

echo "=== Setting up IAM roles for Invoice Processor ==="

# Required roles
ROLES=(
  "roles/storage.objectViewer"      # To read files from Cloud Storage
  "roles/datastore.user"            # To access Firestore
  "roles/secretmanager.secretAccessor"  # To access OpenAI API key
  "roles/pubsub.publisher"          # To publish messages (if needed)
  "roles/logging.logWriter"         # To write logs
  "roles/monitoring.metricWriter"   # To write metrics
)

# Add roles to service account
for ROLE in "${ROLES[@]}"; do
  echo "Adding role: $ROLE"
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="$ROLE"
done

echo "=== IAM Setup Complete ==="