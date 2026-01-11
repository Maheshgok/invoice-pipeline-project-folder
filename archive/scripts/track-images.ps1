# Image Tracking Script for Invoice Processing Pipeline
# PowerShell version for Windows users

$PROJECT_ID = "watch-mail-trial"
$REGION = "asia-south1"

Write-Host "🔍 Fetching latest Docker images for invoice processing services..." -ForegroundColor Cyan

# Get queue-processor image
$QueueImage = gcloud run services describe queue-processor `
  --region $REGION `
  --project $PROJECT_ID `
  --format="value(spec.template.spec.template.spec.containers[0].image)"

# Get initial-api image  
$ApiImage = gcloud run services describe initial-api `
  --region $REGION `
  --project $PROJECT_ID `
  --format="value(spec.template.spec.template.spec.containers[0].image)"

# Get deployment timestamps
$QueueTimestamp = gcloud run services describe queue-processor `
  --region $REGION `
  --project $PROJECT_ID `
  --format="value(metadata.creationTimestamp)"

$ApiTimestamp = gcloud run services describe initial-api `
  --region $REGION `
  --project $PROJECT_ID `
  --format="value(metadata.creationTimestamp)"

Write-Host ""
Write-Host "📦 Current Production Images:" -ForegroundColor Green
Write-Host ""
Write-Host "🔧 Queue Processor:" -ForegroundColor Yellow
Write-Host "   Image: $QueueImage" -ForegroundColor White
Write-Host "   Deployed: $QueueTimestamp" -ForegroundColor Gray
Write-Host ""
Write-Host "🚀 Initial API:" -ForegroundColor Yellow  
Write-Host "   Image: $ApiImage" -ForegroundColor White
Write-Host "   Deployed: $ApiTimestamp" -ForegroundColor Gray
Write-Host ""

# Create update log entry
$CurrentDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd HH:mm UTC")
Write-Host "📝 Image Update Log Entry for TECHNICAL_SPECIFICATIONS.md:" -ForegroundColor Magenta
Write-Host ""
Write-Host "#### Updated: $CurrentDate"
Write-Host "- **queue-processor**: \`$QueueImage\`"  
Write-Host "- **initial-api**: \`$ApiImage\`"
Write-Host ""

Write-Host "✅ Image tracking completed!" -ForegroundColor Green
Write-Host "💡 Tip: Copy the image hashes to update TECHNICAL_SPECIFICATIONS.md" -ForegroundColor Cyan