#!/bin/bash
set -e

# Configuration
PROJECT_ID="ocrinvoice-466611"
TOPIC="step-1-initiate"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "=== Testing Invoice Processor Service ==="

# Ensure correct project is set
echo "Setting project to: $PROJECT_ID"
gcloud config set project $PROJECT_ID

# Create a test message
echo "Creating test message..."
TEST_MESSAGE=$(cat <<EOF
{
    "gcs_uri": "gs://ocr-invoice-raw-files-bucket/raw/test-invoice.pdf",
    "backend_request_id": "test-$(date +%s)"
}
EOF
)

# Publish message to Pub/Sub
echo "Publishing message to topic: $TOPIC"
gcloud pubsub topics publish $TOPIC --message="$TEST_MESSAGE"

# Show success message
echo -e "${GREEN}Test message published successfully!${NC}"

# Wait a few seconds for processing
echo "Waiting for processing..."
sleep 5

# Show logs command
echo -e "\nFetching recent logs..."
gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=invoice-processor' \
    --limit 10 \
    --format='table(timestamp,severity,textPayload)' \
    --project=$PROJECT_ID

echo -e "\n${GREEN}Test complete!${NC}"
echo -e "To view more logs in real-time, run:"
echo -e "${GREEN}gcloud logging tail 'resource.type=cloud_run_revision AND resource.labels.service_name=invoice-processor' --project=$PROJECT_ID${NC}"