#!/bin/bash

# Queue Processor Deployment Script with Functional Handlers
# Deploys the updated queue processor with optimized functional handlers

set -e

echo "🚀 Deploying Queue Processor with Functional Handlers to Cloud Run..."

# Configuration
PROJECT_ID="watch-mail-trial"
REGION="asia-south1"
SERVICE_NAME="queue-processor"

# Navigate to queue-processor directory
cd "$(dirname "$0")"

echo "📁 Current directory: $(pwd)"
echo "📋 Project ID: $PROJECT_ID"
echo "🌍 Region: $REGION"

# Verify functional handler is present
if [ ! -f "functional_openai_handler.py" ]; then
    echo "❌ functional_openai_handler.py not found!"
    exit 1
fi

if [ ! -f "functional_processor.py" ]; then
    echo "❌ functional_processor.py not found!"
    exit 1
fi

echo "✅ Functional handlers found"

# Build and deploy
echo "🔨 Building and deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
    --source . \
    --platform managed \
    --region $REGION \
    --project $PROJECT_ID \
    --allow-unauthenticated \
    --memory 2Gi \
    --cpu 2 \
    --concurrency 50 \
    --max-instances 20 \
    --timeout 900 \
    --set-env-vars GOOGLE_CLOUD_PROJECT=$PROJECT_ID,OPENAI_API_KEY=$OPENAI_API_KEY

echo "✅ Queue Processor deployed successfully!"

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID --format='value(status.url)')

echo "🔗 Service URL: $SERVICE_URL"
echo "🔗 Health Check: $SERVICE_URL/health"
echo "🔗 Functional Health: $SERVICE_URL/health-functional"
echo "🔗 Process Task (Legacy): POST $SERVICE_URL/process-task"
echo "🔗 Process Functional (New): POST $SERVICE_URL/process-functional"

echo ""
echo "📝 Next Steps:"
echo "1. Test health endpoints:"
echo "   curl $SERVICE_URL/health"
echo "   curl $SERVICE_URL/health-functional"
echo "2. Test functional processing endpoint"
echo "3. Update frontend to use new functional endpoint"
echo ""
echo "🎉 Deployment complete!"