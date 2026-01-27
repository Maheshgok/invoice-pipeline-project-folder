# Invoice Processing System - Complete Deployment Script
# Deploys all services to GCP Cloud Run + Frontend to Netlify

Write-Host "🚀 Invoice Processing System - Full Cloud Deployment" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host ""

# Configuration
$PROJECT_ID = "watch-mail-trial"
$REGION = "asia-south1"
$SERVICES = @(
    @{name="initial-api"; path="initial-api/Cloudrun_version"},
    @{name="data-combiner"; path="data-combiner"},
    @{name="data-extractor-v2"; path="data-extractor-v2"},
    @{name="enrichment-worker"; path="enrichment-worker"},
    @{name="field-standardizer-v2"; path="field-standardizer-v2"},
    @{name="orchestrator-service"; path="orchestrator-service"}
)

# Check prerequisites
Write-Host "📋 Checking prerequisites..." -ForegroundColor Yellow

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Host "❌ gcloud CLI is not installed. Please install Google Cloud SDK first." -ForegroundColor Red
    exit 1
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "⚠️  git is not installed. You will not be able to push changes." -ForegroundColor Yellow
}

Write-Host "✅ Prerequisites checked" -ForegroundColor Green
Write-Host ""

# Ask what to deploy
Write-Host "What would you like to deploy?"
Write-Host "1) Backend services only (Cloud Run)"
Write-Host "2) Frontend only (Netlify)"
Write-Host "3) Both backend and frontend"
Write-Host "4) Specific service (manual selection)"
$deployChoice = Read-Host "Choose option (1-4)"

function Deploy-Backend-Services {
    Write-Host ""
    Write-Host "🔧 Deploying backend services to Cloud Run..." -ForegroundColor Cyan
    Write-Host ""
    
    foreach ($service in $SERVICES) {
        $serviceName = $service.name
        $servicePath = $service.path
        
        Write-Host "📦 Deploying $serviceName..." -ForegroundColor Yellow
        
        # Check if service path exists
        if (-not (Test-Path $servicePath)) {
            Write-Host "⚠️  Service path not found: $servicePath" -ForegroundColor Yellow
            continue
        }
        
        Push-Location $servicePath
        
        try {
            # Deploy to Cloud Run
            Write-Host "   🚀 Pushing to Cloud Run ($REGION)..." -ForegroundColor Cyan
            
            $deployCmd = "gcloud run deploy $serviceName --source . --region=$REGION --project=$PROJECT_ID"
            
            Write-Host "   Running: $deployCmd" -ForegroundColor Gray
            Invoke-Expression $deployCmd
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "   ✅ $serviceName deployed successfully!" -ForegroundColor Green
            } else {
                Write-Host "   ❌ Failed to deploy $serviceName" -ForegroundColor Red
            }
        }
        catch {
            Write-Host "   ❌ Error deploying $serviceName : $_" -ForegroundColor Red
        }
        finally {
            Pop-Location
        }
        
        Write-Host ""
    }
}

function Deploy-Frontend {
    Write-Host ""
    Write-Host "🎨 Deploying frontend to Netlify..." -ForegroundColor Cyan
    Write-Host ""
    
    $frontendPath = "invoice-app-v2"
    
    if (-not (Test-Path $frontendPath)) {
        Write-Host "❌ Frontend path not found: $frontendPath" -ForegroundColor Red
        return
    }
    
    Push-Location $frontendPath
    
    try {
        # Build frontend
        Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
        npm install
        
        Write-Host "🔨 Building frontend for production..." -ForegroundColor Yellow
        npm run build
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Frontend build successful!" -ForegroundColor Green
            Write-Host ""
            Write-Host "📤 Next steps:" -ForegroundColor Cyan
            Write-Host "   1. Push code to git: git add . && git commit -m \"Deploy: Modification tracking\" && git push origin main" -ForegroundColor White
            Write-Host "   2. Netlify will auto-deploy from the main branch" -ForegroundColor White
            Write-Host "   3. Monitor deployment at: https://app.netlify.com" -ForegroundColor White
        } else {
            Write-Host "❌ Frontend build failed" -ForegroundColor Red
        }
    }
    catch {
        Write-Host "❌ Error building frontend: $_" -ForegroundColor Red
    }
    finally {
        Pop-Location
    }
}

function Deploy-Specific-Service {
    Write-Host ""
    Write-Host "Select a service to deploy:" -ForegroundColor Cyan
    for ($i = 0; $i -lt $SERVICES.Count; $i++) {
        Write-Host "$($i + 1)) $($SERVICES[$i].name)"
    }
    
    $serviceChoice = [int](Read-Host "Choose service number") - 1
    
    if ($serviceChoice -lt 0 -or $serviceChoice -ge $SERVICES.Count) {
        Write-Host "❌ Invalid choice" -ForegroundColor Red
        return
    }
    
    $selectedService = $SERVICES[$serviceChoice]
    $serviceName = $selectedService.name
    $servicePath = $selectedService.path
    
    Write-Host ""
    Write-Host "🚀 Deploying $serviceName..." -ForegroundColor Cyan
    
    if (-not (Test-Path $servicePath)) {
        Write-Host "❌ Service path not found: $servicePath" -ForegroundColor Red
        return
    }
    
    Push-Location $servicePath
    
    try {
        Write-Host "🔨 Building and deploying to Cloud Run..." -ForegroundColor Yellow
        
        $deployCmd = "gcloud run deploy $serviceName --source . --region=$REGION --project=$PROJECT_ID"
        Write-Host "Running: $deployCmd" -ForegroundColor Gray
        
        Invoke-Expression $deployCmd
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ $serviceName deployed successfully!" -ForegroundColor Green
        } else {
            Write-Host "❌ Failed to deploy $serviceName" -ForegroundColor Red
        }
    }
    catch {
        Write-Host "❌ Error deploying $serviceName : $_" -ForegroundColor Red
    }
    finally {
        Pop-Location
    }
}

# Execute deployment based on choice
switch ($deployChoice) {
    "1" {
        Deploy-Backend-Services
    }
    "2" {
        Deploy-Frontend
    }
    "3" {
        Deploy-Backend-Services
        Deploy-Frontend
    }
    "4" {
        Deploy-Specific-Service
    }
    default {
        Write-Host "❌ Invalid choice" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "🎉 Deployment script completed!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Check service status: gcloud run services list --region=$REGION" -ForegroundColor White
Write-Host "   2. View logs: gcloud run services logs read <service-name> --region=$REGION --limit=50" -ForegroundColor White
Write-Host "   3. For frontend: Push to git and Netlify will auto-deploy" -ForegroundColor White
Write-Host ""
Write-Host "🔗 Service URLs:" -ForegroundColor Cyan
Write-Host "   initial-api: https://initial-api-812016027146.asia-south1.run.app" -ForegroundColor White
Write-Host "   data-combiner: https://data-combiner-812016027146.asia-south1.run.app" -ForegroundColor White
Write-Host "   Frontend: https://invoiceparse.netlify.app" -ForegroundColor White
Write-Host ""
Write-Host "📝 Deployed changes:" -ForegroundColor Cyan
Write-Host "   ✅ data-combiner: Added data_schemas subcollection (original, current, modifications)" -ForegroundColor Green
Write-Host "   ✅ initial-api: Added PUT /invoice-results/{job_id}/entries/{line_id} endpoint" -ForegroundColor Green
Write-Host "   ✅ frontend: Updated journal entry edit flow to persist to Firestore" -ForegroundColor Green
Write-Host ""
