# PowerShell script to clear Firestore data for fresh testing
# This script activates the virtual environment and runs the cleanup

Write-Host "🔥 Starting Firestore Data Cleanup..." -ForegroundColor Yellow

# Activate virtual environment
$venvPath = "C:/Users/Dell 5330/OneDrive/Documents/InvoiceSetup/invoice-pipeline-project-folder/venv-test/Scripts/Activate.ps1"
if (Test-Path $venvPath) {
    Write-Host "📦 Activating virtual environment..." -ForegroundColor Green
    & $venvPath
} else {
    Write-Host "⚠️  Virtual environment not found at $venvPath" -ForegroundColor Red
    Write-Host "Please ensure you have the virtual environment set up" -ForegroundColor Red
    exit 1
}

# Change to project directory
$projectDir = "c:\Users\Dell 5330\OneDrive\Documents\InvoiceSetup\invoice-pipeline-project-folder"
Set-Location $projectDir

Write-Host "🗑️  Running Firestore cleanup script..." -ForegroundColor Green

# Run the Python cleanup script
python clear_firestore_data.py

Write-Host "`n✨ Firestore cleanup completed!" -ForegroundColor Green
Write-Host "You can now run fresh tests with clean data." -ForegroundColor Cyan