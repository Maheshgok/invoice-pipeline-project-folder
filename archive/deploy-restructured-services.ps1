#!/usr/bin/env pwsh
# Deploy Restructured Services - Version 2.0 with Simple OpenAI Handlers
# This script deploys all services that have been restructured to use simple_openai_handler

param(
    [string]$ProjectId = "watch-mail-trial",
    [string]$Region = "asia-south1"
)

Write-Host "🚀 Deploying Restructured Services (Version 2.0) with Simple OpenAI Handlers" -ForegroundColor Green
Write-Host "📊 Project: $ProjectId" -ForegroundColor Cyan
Write-Host "🌍 Region: $Region" -ForegroundColor Cyan

# Set project context
gcloud config set project $ProjectId

# Function to check if shared handler exists
function Test-SharedHandler {
    param([string]$ServicePath)
    
    $sharedPath = Join-Path $ServicePath ".." "shared" "simple_openai_handler.py"
    if (Test-Path $sharedPath) {
        Write-Host "✅ Shared handler found for $ServicePath" -ForegroundColor Green
        return $true
    } else {
        Write-Host "❌ Shared handler NOT found for $ServicePath" -ForegroundColor Red
        return $false
    }
}

# Function to deploy service
function Deploy-Service {
    param(
        [string]$ServiceName,
        [string]$ServicePath,
        [string]$Version = "2.0.0"
    )
    
    Write-Host "`n🔧 Deploying $ServiceName (v$Version)..." -ForegroundColor Yellow
    
    # Check if shared handler is accessible
    if (-not (Test-SharedHandler $ServicePath)) {
        Write-Host "⚠️ Skipping $ServiceName - shared handler not found" -ForegroundColor Yellow
        return $false
    }
    
    # Change to service directory
    Push-Location $ServicePath
    
    try {
        # Deploy to Cloud Run
        $deployCmd = @(
            "gcloud", "run", "deploy", $ServiceName,
            "--source", ".",
            "--platform", "managed", 
            "--region", $Region,
            "--allow-unauthenticated",
            "--memory", "2Gi",
            "--cpu", "2",
            "--timeout", "900",
            "--concurrency", "10",
            "--min-instances", "0",
            "--max-instances", "10",
            "--port", "8080",
            "--set-env-vars", "PROJECT_ID=$ProjectId"
        )
        
        Write-Host "🚀 Running: $($deployCmd -join ' ')" -ForegroundColor Cyan
        & $deployCmd[0] $deployCmd[1..($deployCmd.Length-1)]
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ $ServiceName deployed successfully" -ForegroundColor Green
            
            # Get service URL
            $serviceUrl = gcloud run services describe $ServiceName --region=$Region --format="value(status.url)"
            Write-Host "🌐 Service URL: $serviceUrl" -ForegroundColor Cyan
            
            # Test health endpoint
            Write-Host "🏥 Testing health endpoint..." -ForegroundColor Yellow
            try {
                $healthResponse = Invoke-RestMethod -Uri "$serviceUrl/health" -TimeoutSec 30
                Write-Host "✅ Health check: $($healthResponse.status) (v$($healthResponse.version))" -ForegroundColor Green
            } catch {
                Write-Host "⚠️ Health check failed: $($_.Exception.Message)" -ForegroundColor Yellow
            }
            
            return $true
        } else {
            Write-Host "❌ Failed to deploy $ServiceName" -ForegroundColor Red
            return $false
        }
    } finally {
        Pop-Location
    }
}

# Services to deploy (in dependency order)
$servicesToDeploy = @(
    @{Name="data-extractor"; Path="data-extractor"; Description="Phase 1: Invoice data extraction with simple handler"},
    @{Name="queue-enrichment-processor"; Path="queue-enrichment-processor"; Description="Phase 2: Data enrichment with simple handler"}, 
    @{Name="data-combiner"; Path="data-combiner"; Description="Phase 3: Data combination with simple handler"},
    @{Name="pipeline-orchestrator"; Path="pipeline-orchestrator"; Description="Coordination service for all phases"}
)

$deploymentResults = @()

Write-Host "`n📋 Services to deploy:" -ForegroundColor Magenta
$servicesToDeploy | ForEach-Object {
    Write-Host "  • $($_.Name): $($_.Description)" -ForegroundColor White
}

# Deploy each service
foreach ($service in $servicesToDeploy) {
    $deployResult = Deploy-Service -ServiceName $service.Name -ServicePath $service.Path
    $deploymentResults += @{
        Name = $service.Name
        Success = $deployResult
        Path = $service.Path
    }
    
    Start-Sleep -Seconds 5  # Brief pause between deployments
}

# Summary
Write-Host "`n📊 DEPLOYMENT SUMMARY" -ForegroundColor Magenta
Write-Host "=" * 50 -ForegroundColor Gray

$successCount = ($deploymentResults | Where-Object { $_.Success }).Count
$totalCount = $deploymentResults.Count

Write-Host "✅ Successful: $successCount / $totalCount" -ForegroundColor Green

$deploymentResults | ForEach-Object {
    if ($_.Success) {
        Write-Host "  ✅ $($_.Name)" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $($_.Name)" -ForegroundColor Red
    }
}

if ($successCount -eq $totalCount) {
    Write-Host "`n🎉 All services deployed successfully!" -ForegroundColor Green
    Write-Host "🔗 Pipeline is ready for testing with simple OpenAI handlers" -ForegroundColor Cyan
} else {
    Write-Host "`n⚠️ Some services failed to deploy. Check logs above." -ForegroundColor Yellow
}

# Test pipeline health
Write-Host "`n🏥 Testing Overall Pipeline Health..." -ForegroundColor Yellow
try {
    $orchestratorUrl = gcloud run services describe pipeline-orchestrator --region=$Region --format="value(status.url)" 2>$null
    if ($orchestratorUrl) {
        $healthResponse = Invoke-RestMethod -Uri "$orchestratorUrl/health" -TimeoutSec 30
        Write-Host "✅ Pipeline Orchestrator: $($healthResponse.status) (v$($healthResponse.version))" -ForegroundColor Green
        
        # Test all services health through orchestrator
        try {
            $allHealthResponse = Invoke-RestMethod -Uri "$orchestratorUrl/health/services" -TimeoutSec 30
            Write-Host "🔍 All Services Health: $($allHealthResponse.overall_status)" -ForegroundColor Cyan
        } catch {
            Write-Host "⚠️ Could not check all services health" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "⚠️ Could not test pipeline health: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "`n🏁 Deployment script completed!" -ForegroundColor Magenta