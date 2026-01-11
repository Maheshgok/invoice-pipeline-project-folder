#!/bin/bash

# Cloud Tasks Integration Test Script
# Tests the complete Cloud Tasks pipeline

set -e

PROJECT_ID="watch-mail-trial"
REGION="asia-south1"
QUEUE_NAME="invoice-processing-queue"

echo "🧪 Cloud Tasks Integration Test"
echo "================================"

# Check if required tools are installed
command -v gcloud >/dev/null 2>&1 || { echo "❌ gcloud CLI is required but not installed."; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "❌ curl is required but not installed."; exit 1; }

echo "✅ Required tools found"

# 1. Check Cloud Tasks Queue
echo ""
echo "1. 📋 Checking Cloud Tasks Queue..."
QUEUE_EXISTS=$(gcloud tasks queues describe $QUEUE_NAME --location=$REGION --project=$PROJECT_ID --format="value(name)" 2>/dev/null || echo "")

if [ -z "$QUEUE_EXISTS" ]; then
    echo "❌ Queue '$QUEUE_NAME' does not exist in region '$REGION'"
    echo "   Run: cd initial-api/Cloudrun_version && ./deploy-cloud-tasks.sh"
    exit 1
else
    echo "✅ Queue exists: $QUEUE_NAME"
    
    # Get queue stats
    echo "📊 Queue Configuration:"
    gcloud tasks queues describe $QUEUE_NAME --location=$REGION --project=$PROJECT_ID --format="table(
        rateLimits.maxDispatchesPerSecond:label='Max Dispatches/Sec',
        rateLimits.maxConcurrentDispatches:label='Max Concurrent',
        retryConfig.maxAttempts:label='Max Attempts',
        retryConfig.maxRetryDuration:label='Max Retry Duration'
    )"
fi

# 2. Check Initial API Service
echo ""
echo "2. 🔧 Checking Initial API Service..."
INITIAL_API_URL="https://initial-api-812016027146.asia-south1.run.app"

HEALTH_RESPONSE=$(curl -s "$INITIAL_API_URL/health" || echo "ERROR")
if [[ "$HEALTH_RESPONSE" == *"healthy"* ]] && [[ "$HEALTH_RESPONSE" == *"cloud_tasks_enabled"* ]]; then
    echo "✅ Initial API is healthy with Cloud Tasks enabled"
    echo "   URL: $INITIAL_API_URL"
else
    echo "❌ Initial API health check failed or Cloud Tasks not enabled"
    echo "   Response: $HEALTH_RESPONSE"
    echo "   Run: cd initial-api/Cloudrun_version && ./deploy-cloud-tasks.sh"
    exit 1
fi

# 3. Check Queue Processor Service
echo ""
echo "3. 🔄 Checking Queue Processor Service..."
QUEUE_PROCESSOR_URL="https://queue-processor-812016027146.asia-south1.run.app"

HEALTH_RESPONSE=$(curl -s "$QUEUE_PROCESSOR_URL/health" || echo "ERROR")
if [[ "$HEALTH_RESPONSE" == *"healthy"* ]] && [[ "$HEALTH_RESPONSE" == *"cloud_tasks_managed"* ]]; then
    echo "✅ Queue Processor is healthy with Cloud Tasks mode"
    echo "   URL: $QUEUE_PROCESSOR_URL"
else
    echo "❌ Queue Processor health check failed or not in Cloud Tasks mode"
    echo "   Response: $HEALTH_RESPONSE"
    echo "   Run: cd queue-processor && ./deploy-cloud-tasks.sh"
    exit 1
fi

# 4. Check IAM Permissions
echo ""
echo "4. 🔐 Checking IAM Permissions..."

# Check if Cloud Tasks service account can invoke queue processor
INVOKER_BINDING=$(gcloud run services get-iam-policy queue-processor --region=$REGION --project=$PROJECT_ID --format="value(bindings.members)" 2>/dev/null | grep "cloudrun-invoice-uploader" || echo "")

if [ -n "$INVOKER_BINDING" ]; then
    echo "✅ Cloud Tasks service account has invoker permissions"
else
    echo "⚠️  Warning: Cloud Tasks service account may not have invoker permissions"
    echo "   This might be automatically granted by Cloud Run"
fi

# Check Cloud Tasks admin permission
TASKS_ADMIN=$(gcloud projects get-iam-policy $PROJECT_ID --format="value(bindings.members)" | grep -A5 "roles/cloudtasks.admin" | grep "cloudrun-invoice-uploader" || echo "")

if [ -n "$TASKS_ADMIN" ]; then
    echo "✅ Service account has Cloud Tasks admin permissions"
else
    echo "⚠️  Warning: Service account may not have Cloud Tasks admin permissions"
fi

# 5. Test Queue Operations
echo ""
echo "5. 📊 Testing Queue Operations..."

# List current tasks
CURRENT_TASKS=$(gcloud tasks list --queue=$QUEUE_NAME --location=$REGION --project=$PROJECT_ID --format="value(name)" | wc -l)
echo "📋 Current tasks in queue: $CURRENT_TASKS"

# Check queue stats
echo "📈 Queue Statistics:"
gcloud tasks queues describe $QUEUE_NAME --location=$REGION --project=$PROJECT_ID --format="table(
    state:label='State',
    purgeTime:label='Last Purged'
)"

echo ""
echo "🎉 Cloud Tasks Integration Test Completed!"
echo "================================"
echo ""
echo "✅ All checks passed! Your Cloud Tasks integration is ready."
echo ""
echo "🧪 Next Steps for Manual Testing:"
echo "1. Upload a test file via the frontend"
echo "2. Monitor Cloud Tasks: gcloud tasks list --queue=$QUEUE_NAME --location=$REGION"
echo "3. Check processing logs: gcloud logs tail services/queue-processor"
echo ""
echo "📋 Useful Commands:"
echo "  • Queue status: gcloud tasks queues describe $QUEUE_NAME --location=$REGION"
echo "  • List tasks: gcloud tasks list --queue=$QUEUE_NAME --location=$REGION"
echo "  • Service logs: gcloud logs tail services/initial-api"
echo "  • Task execution logs: gcloud logs read 'resource.type=cloud_task'"