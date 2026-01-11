# Cloud Tasks Queue Processor Deployment Script (PowerShell)
# Deploys the updated queue processor that handles Cloud Tasks callbacks

$ErrorActionPreference = "Stop"

Write-Host "🚀 Deploying Queue Processor with Cloud Tasks integration..." -ForegroundColor Green

# Configuration
$PROJECT_ID = "watch-mail-trial"
$SERVICE_NAME = "queue-processor"
$REGION = "asia-south1"

# Check if we're in the right directory
if (-not (Test-Path "main_cloud_tasks.py")) {
    Write-Host "❌ Error: main_cloud_tasks.py not found. Make sure you're in the queue-processor directory" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Project ID: $PROJECT_ID" -ForegroundColor Cyan
Write-Host "🌍 Region: $REGION" -ForegroundColor Cyan
Write-Host "🔧 Service: $SERVICE_NAME" -ForegroundColor Cyan

# Backup the original main.py and use the Cloud Tasks version
if ((Test-Path "main.py") -and (-not (Test-Path "main_legacy.py"))) {
    Write-Host "📁 Backing up legacy main.py to main_legacy.py" -ForegroundColor Yellow
    Copy-Item "main.py" "main_legacy.py"
}

Write-Host "🔄 Using Cloud Tasks main.py..." -ForegroundColor Yellow
Copy-Item "main_cloud_tasks.py" "main.py" -Force

# Build and deploy to Cloud Run
Write-Host "🔨 Building and deploying to Cloud Run..." -ForegroundColor Yellow

gcloud run deploy $SERVICE_NAME `
    --source . `
    --project $PROJECT_ID `
    --region $REGION `
    --platform managed `
    --allow-unauthenticated `
    --set-env-vars "PROJECT_ID=$PROJECT_ID,OPENAI_API_KEY_SECRET=openai-api-key-secret" `
    --memory 2Gi `
    --cpu 2 `
    --timeout 900 `
    --concurrency 10 `
    --min-instances 0 `
    --max-instances 5

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Deployment failed!" -ForegroundColor Red
    exit 1
}

# Get the deployed URL
$DEPLOYED_URL = gcloud run services describe $SERVICE_NAME --project $PROJECT_ID --region $REGION --format "value(status.url)"

Write-Host "✅ Deployment completed!" -ForegroundColor Green
Write-Host "🌐 Service URL: $DEPLOYED_URL" -ForegroundColor Cyan
Write-Host "📋 Service: $SERVICE_NAME" -ForegroundColor Cyan
Write-Host "🔍 View logs: gcloud logs tail services/$SERVICE_NAME --project $PROJECT_ID" -ForegroundColor Cyan

# Verify Cloud Tasks queue exists
Write-Host "🔍 Verifying Cloud Tasks queue..." -ForegroundColor Yellow
$QUEUE_EXISTS = $null
try {
    $QUEUE_EXISTS = gcloud tasks queues describe invoice-processing-queue --location=$REGION --project=$PROJECT_ID --format="value(name)" 2>$null
} catch {
    # Queue doesn't exist
}

if (-not $QUEUE_EXISTS) {
    Write-Host "⚠️ Warning: Cloud Tasks queue 'invoice-processing-queue' does not exist." -ForegroundColor Red
    Write-Host "   Please deploy the initial-api first to create the queue." -ForegroundColor Yellow
    Write-Host "   Run: cd ..\initial-api\Cloudrun_version ; .\deploy-cloud-tasks.ps1" -ForegroundColor Yellow
} else {
    Write-Host "✅ Cloud Tasks queue verified: invoice-processing-queue" -ForegroundColor Green
}

# Set IAM permissions
Write-Host "🔐 Setting up IAM permissions..." -ForegroundColor Yellow

# Allow the service account to access Firestore
gcloud projects add-iam-policy-binding $PROJECT_ID `
    --member="serviceAccount:812016027146-compute@developer.gserviceaccount.com" `
    --role="roles/datastore.user"

# Allow the service account to access Cloud Storage
gcloud projects add-iam-policy-binding $PROJECT_ID `
    --member="serviceAccount:812016027146-compute@developer.gserviceaccount.com" `
    --role="roles/storage.objectViewer"

# Allow the service account to access Secret Manager
gcloud projects add-iam-policy-binding $PROJECT_ID `
    --member="serviceAccount:812016027146-compute@developer.gserviceaccount.com" `
    --role="roles/secretmanager.secretAccessor"

Write-Host "🎉 Cloud Tasks Queue Processor deployment completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Integration complete! Your invoice processing pipeline now uses Cloud Tasks:" -ForegroundColor Green
Write-Host "  1. ✅ initial-api creates Cloud Tasks when files are uploaded" -ForegroundColor White
Write-Host "  2. ✅ queue-processor handles Cloud Tasks callbacks" -ForegroundColor White
Write-Host "  3. ✅ No more in-memory queue management" -ForegroundColor White
Write-Host "  4. ✅ GCP handles all queue reliability and retry logic" -ForegroundColor White
Write-Host ""
Write-Host "🧪 Testing commands:" -ForegroundColor Cyan
Write-Host "  - View queue: gcloud tasks list --queue=invoice-processing-queue --location=$REGION" -ForegroundColor White
Write-Host "  - Check processor: curl $DEPLOYED_URL/health" -ForegroundColor White
Write-Host ""
Write-Host "🔍 Monitoring commands:" -ForegroundColor Cyan
Write-Host "  - Queue stats: gcloud tasks queues describe invoice-processing-queue --location=$REGION" -ForegroundColor White
Write-Host "  - Service logs: gcloud logs tail services/$SERVICE_NAME" -ForegroundColor White
Write-Host "  - Task logs: gcloud logs read 'resource.type=cloud_task'" -ForegroundColor White