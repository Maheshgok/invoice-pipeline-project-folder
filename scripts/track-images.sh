#!/bin/bash
# Image Tracking Script for Invoice Processing Pipeline
# Updates technical specifications with latest Docker images

PROJECT_ID="watch-mail-trial"
REGION="asia-south1"

echo "🔍 Fetching latest Docker images for invoice processing services..."

# Get queue-processor image
QUEUE_IMAGE=$(gcloud run services describe queue-processor \
  --region $REGION \
  --project $PROJECT_ID \
  --format="value(spec.template.spec.template.spec.containers[0].image)")

# Get initial-api image  
API_IMAGE=$(gcloud run services describe initial-api \
  --region $REGION \
  --project $PROJECT_ID \
  --format="value(spec.template.spec.template.spec.containers[0].image)")

# Get deployment timestamps
QUEUE_TIMESTAMP=$(gcloud run services describe queue-processor \
  --region $REGION \
  --project $PROJECT_ID \
  --format="value(metadata.creationTimestamp)")

API_TIMESTAMP=$(gcloud run services describe initial-api \
  --region $REGION \
  --project $PROJECT_ID \
  --format="value(metadata.creationTimestamp)")

echo ""
echo "📦 Current Production Images:"
echo ""
echo "🔧 Queue Processor:"
echo "   Image: $QUEUE_IMAGE"
echo "   Deployed: $QUEUE_TIMESTAMP"
echo ""
echo "🚀 Initial API:"
echo "   Image: $API_IMAGE" 
echo "   Deployed: $API_TIMESTAMP"
echo ""

# Create update log entry
CURRENT_DATE=$(date -u +"%Y-%m-%d %H:%M UTC")
echo "📝 Image Update Log Entry for TECHNICAL_SPECIFICATIONS.md:"
echo ""
echo "#### Updated: $CURRENT_DATE"
echo "- **queue-processor**: \`$QUEUE_IMAGE\`"
echo "- **initial-api**: \`$API_IMAGE\`"
echo ""

echo "✅ Image tracking completed!"
echo "💡 Tip: Copy the image hashes to update TECHNICAL_SPECIFICATIONS.md"