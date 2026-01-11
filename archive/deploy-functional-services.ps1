#!/usr/bin/env powershell
# Master Deployment Script for Functional Invoice Processing Services

Write-Host "🚀 Deploying Functional Invoice Processing Services..." -ForegroundColor Green

$PROJECT_ID = "watch-mail-trial"
$REGION = "asia-south1"

# Deploy Extraction Service
Write-Host "📋 Deploying Extraction Service..." -ForegroundColor Yellow
Set-Location extraction-service
try {
    gcloud run deploy extraction-service `
        --source . `
        --platform managed `
        --region $REGION `
        --project $PROJECT_ID `
        --allow-unauthenticated `
        --service-account "extraction-service-sa@${PROJECT_ID}.iam.gserviceaccount.com" `
        --memory 2Gi `
        --cpu 2 `
        --timeout 600 `
        --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID},OPENAI_SECRET_NAME=extraction-service-openai-key"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Extraction Service deployed successfully!" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Extraction Service deployment failed: $_" -ForegroundColor Red
} finally {
    Set-Location ..
}

# Deploy Enrichment Service
Write-Host "💡 Deploying Enrichment Service..." -ForegroundColor Yellow
Set-Location enrichment-service
try {
    gcloud run deploy enrichment-service `
        --source . `
        --platform managed `
        --region $REGION `
        --project $PROJECT_ID `
        --allow-unauthenticated `
        --service-account "enrichment-service-sa@${PROJECT_ID}.iam.gserviceaccount.com" `
        --memory 2Gi `
        --cpu 2 `
        --timeout 600 `
        --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID},OPENAI_SECRET_NAME=enrichment-service-openai-key"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Enrichment Service deployed successfully!" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Enrichment Service deployment failed: $_" -ForegroundColor Red
} finally {
    Set-Location ..
}

# Deploy Analysis Service
Write-Host "🔍 Deploying Analysis Service..." -ForegroundColor Yellow
Set-Location analysis-service
try {
    gcloud run deploy analysis-service `
        --source . `
        --platform managed `
        --region $REGION `
        --project $PROJECT_ID `
        --allow-unauthenticated `
        --service-account "analysis-service-sa@${PROJECT_ID}.iam.gserviceaccount.com" `
        --memory 2Gi `
        --cpu 2 `
        --timeout 600 `
        --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID},OPENAI_SECRET_NAME=analysis-service-openai-key"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Analysis Service deployed successfully!" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Analysis Service deployment failed: $_" -ForegroundColor Red
} finally {
    Set-Location ..
}

Write-Host ""
Write-Host "🎉 Deployment process completed!" -ForegroundColor Green
Write-Host "Check individual service status above for results." -ForegroundColor Cyan