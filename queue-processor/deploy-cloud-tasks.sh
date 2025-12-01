#!/bin/bash

# Cloud Tasks Queue Processor Deployment Script
# Deploys the updated queue processor that handles Cloud Tasks callbacks

set -e

echo "🚀 Deploying Queue Processor with Cloud Tasks integration..."

# Configuration
PROJECT_ID="watch-mail-trial"
SERVICE_NAME="queue-processor"
REGION="asia-south1"
IMAGE_NAME="queue-processor-cloud-tasks"

# Check if we're in the right directory
if [ ! -f "main_cloud_tasks.py" ]; then
    echo "❌ Error: main_cloud_tasks.py not found. Make sure you're in the queue-processor directory"
    exit 1
fi

echo "📋 Project ID: $PROJECT_ID"
echo "🌍 Region: $REGION"
echo "🔧 Service: $SERVICE_NAME"

# Backup the original main.py and use the Cloud Tasks version
if [ -f "main.py" ] && [ ! -f "main_legacy.py" ]; then
    echo "📁 Backing up legacy main.py to main_legacy.py"
    cp main.py main_legacy.py
fi

echo "🔄 Using Cloud Tasks main.py..."
cp main_cloud_tasks.py main.py

# Build and deploy to Cloud Run
echo "🔨 Building and deploying to Cloud Run..."

gcloud run deploy $SERVICE_NAME \
    --source . \
    --project $PROJECT_ID \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --set-env-vars "PROJECT_ID=$PROJECT_ID,OPENAI_API_KEY_SECRET=openai-api-key-secret" \
    --memory 2Gi \
    --cpu 2 \
    --timeout 900 \
    --concurrency 10 \
    --min-instances 0 \
    --max-instances 5

# Get the deployed URL
DEPLOYED_URL=$(gcloud run services describe $SERVICE_NAME --project $PROJECT_ID --region $REGION --format "value(status.url)")

echo "✅ Deployment completed!"
echo "🌐 Service URL: $DEPLOYED_URL"
echo "📋 Service: $SERVICE_NAME"
echo "🔍 View logs: gcloud logs tail services/$SERVICE_NAME --project $PROJECT_ID"

# Verify Cloud Tasks queue exists
echo "🔍 Verifying Cloud Tasks queue..."
QUEUE_EXISTS=$(gcloud tasks queues describe invoice-processing-queue --location=$REGION --project=$PROJECT_ID --format="value(name)" 2>/dev/null || echo "")

if [ -z "$QUEUE_EXISTS" ]; then
    echo "⚠️ Warning: Cloud Tasks queue 'invoice-processing-queue' does not exist."
    echo "   Please deploy the initial-api first to create the queue."
    echo "   Run: cd ../initial-api/Cloudrun_version && ./deploy-cloud-tasks.sh"
else
    echo "✅ Cloud Tasks queue verified: invoice-processing-queue"
fi

# Set IAM permissions
echo "🔐 Setting up IAM permissions..."

# Allow the service account to access Firestore
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:812016027146-compute@developer.gserviceaccount.com" \
    --role="roles/datastore.user"

# Allow the service account to access Cloud Storage
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:812016027146-compute@developer.gserviceaccount.com" \
    --role="roles/storage.objectViewer"

# Allow the service account to access Secret Manager
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:812016027146-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

echo "🎉 Cloud Tasks Queue Processor deployment completed successfully!"
echo ""
echo "📋 Integration complete! Your invoice processing pipeline now uses Cloud Tasks:"
echo "  1. ✅ initial-api creates Cloud Tasks when files are uploaded"
echo "  2. ✅ queue-processor handles Cloud Tasks callbacks"
echo "  3. ✅ No more in-memory queue management"
echo "  4. ✅ GCP handles all queue reliability and retry logic"
echo ""
echo "🧪 Testing commands:"
echo "  - Test upload: curl -X POST https://initial-api-812016027146.asia-south1.run.app/upload_invoice"
echo "  - View queue: gcloud tasks list --queue=invoice-processing-queue --location=$REGION"
echo "  - Check processor: curl $DEPLOYED_URL/health"
echo ""
echo "🔍 Monitoring commands:"
echo "  - Queue stats: gcloud tasks queues describe invoice-processing-queue --location=$REGION"
echo "  - Service logs: gcloud logs tail services/$SERVICE_NAME"
echo "  - Task logs: gcloud logs read 'resource.type=cloud_task'"