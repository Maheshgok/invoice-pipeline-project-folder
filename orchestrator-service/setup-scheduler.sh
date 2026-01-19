#!/bin/bash

# Cloud Scheduler Setup for Auto-Retry
# Deploys a scheduled job that triggers retries for jobs in RETRYING status

PROJECT_ID="watch-mail-trial"
REGION="asia-south1"
SERVICE_ACCOUNT="812016027146-compute@developer.gserviceaccount.com"

echo "☁️  Setting up Cloud Scheduler for auto-retry..."

# 1. Enable Cloud Scheduler API (if not already enabled)
gcloud services enable cloudscheduler.googleapis.com \
  --project=$PROJECT_ID

# 2. Create Cloud Task Queue for retry jobs (optional but recommended)
gcloud tasks queues create invoice-retry-queue \
  --location=$REGION \
  --max-concurrent-dispatches=10 \
  --max-dispatches-per-second=10 \
  --project=$PROJECT_ID 2>/dev/null || echo "Queue already exists"

# 3. Create Cloud Scheduler job to check for retryable jobs every minute
gcloud scheduler jobs create http invoice-retry-processor \
  --location=$REGION \
  --schedule="*/1 * * * *" \
  --uri="https://orchestrator-812016027146.asia-south1.run.app/process-retries" \
  --http-method=POST \
  --oidc-service-account-email=$SERVICE_ACCOUNT \
  --oidc-token-audience="https://orchestrator-812016027146.asia-south1.run.app" \
  --project=$PROJECT_ID 2>/dev/null || echo "Job already exists, updating..."

if [ $? -eq 0 ]; then
  echo "✅ Cloud Scheduler job created: invoice-retry-processor"
else
  # Update existing job
  gcloud scheduler jobs update http invoice-retry-processor \
    --location=$REGION \
    --schedule="*/1 * * * *" \
    --uri="https://orchestrator-812016027146.asia-south1.run.app/process-retries" \
    --http-method=POST \
    --oidc-service-account-email=$SERVICE_ACCOUNT \
    --oidc-token-audience="https://orchestrator-812016027146.asia-south1.run.app" \
    --project=$PROJECT_ID
  echo "✅ Cloud Scheduler job updated: invoice-retry-processor"
fi

echo ""
echo "Configuration complete!"
echo ""
echo "📝 The scheduler will:"
echo "  - Run every 1 minute"
echo "  - Call orchestrator-service /process-retries endpoint"
echo "  - Find all jobs with status=RETRYING and retry_scheduled_for <= now()"
echo "  - Trigger retry for each job"
echo ""
echo "🔍 To check scheduler status:"
echo "  gcloud scheduler jobs describe invoice-retry-processor --location=$REGION --project=$PROJECT_ID"
echo ""
echo "⏸️  To pause/resume:"
echo "  gcloud scheduler jobs pause invoice-retry-processor --location=$REGION --project=$PROJECT_ID"
echo "  gcloud scheduler jobs resume invoice-retry-processor --location=$REGION --project=$PROJECT_ID"
echo ""
echo "📊 To view execution history:"
echo "  gcloud scheduler jobs describe invoice-retry-processor --location=$REGION --project=$PROJECT_ID --format='value(lastExecutionTime)'"
