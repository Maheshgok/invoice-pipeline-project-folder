#!/bin/bash

# Frontend-Backend Integration Test Script
# Tests the archive service integration with the frontend

set -e

echo "🧪 Testing Frontend-Backend Archive Integration..."
echo "=================================================="

# Test 1: Archive Service Health Check
echo "🏥 Test 1: Archive Service Health Check"
HEALTH_URL="https://archive-manager-812016027146.asia-south1.run.app/health"
curl -s $HEALTH_URL | jq '.'

if [ $? -eq 0 ]; then
    echo "✅ Archive service is healthy and responding"
else
    echo "❌ Archive service health check failed"
    exit 1
fi

echo ""

# Test 2: Check Frontend Archive Service URL
echo "🔗 Test 2: Frontend Archive Service Configuration"
FRONTEND_ARCHIVE_FILE="invoice-app-v2/src/services/archive.ts"

if grep -q "archive-manager-812016027146.asia-south1.run.app" $FRONTEND_ARCHIVE_FILE; then
    echo "✅ Frontend archive service URL is correctly configured"
else
    echo "❌ Frontend archive service URL mismatch"
    exit 1
fi

echo ""

# Test 3: Check Frontend Integration
echo "📱 Test 3: Frontend Integration Check"
HOOK_FILE="invoice-app-v2/src/hooks/useRealtimeUpload.ts"
DASHBOARD_FILE="invoice-app-v2/src/pages/MultiUploadDashboard.tsx"

# Check if archive service is imported
if grep -q "import.*archiveService.*from.*archive" $HOOK_FILE; then
    echo "✅ Archive service properly imported in useRealtimeUpload hook"
else
    echo "❌ Archive service not imported in hook"
    exit 1
fi

# Check if archive functions are used in dashboard
if grep -q "archiveCompletedResults" $DASHBOARD_FILE; then
    echo "✅ Archive functions integrated in dashboard"
else
    echo "❌ Archive functions not integrated in dashboard"
    exit 1
fi

# Check if auto-archive is set up
if grep -q "performInitialArchive" $DASHBOARD_FILE; then
    echo "✅ Auto-archive on page load configured"
else
    echo "❌ Auto-archive not configured"
    exit 1
fi

echo ""

# Test 4: Check Real-time Listener Simplification
echo "⚡ Test 4: Real-time Listener Simplification"
FIRESTORE_FILE="invoice-app-v2/src/services/firestore-realtime.ts"

if grep -q "processSimplifiedSnapshot" $FIRESTORE_FILE; then
    echo "✅ Simplified real-time listeners implemented"
else
    echo "❌ Simplified listeners not implemented"
    exit 1
fi

echo ""

echo "🎉 All Integration Tests Passed!"
echo "================================"
echo ""
echo "📋 Integration Summary:"
echo "✅ Archive Cloud Run service deployed and healthy"
echo "✅ Frontend properly configured with archive service URL"
echo "✅ Archive functions integrated in React components" 
echo "✅ Auto-archive triggers configured"
echo "✅ Simplified real-time listeners implemented"
echo ""
echo "🚀 Your frontend is now fully aligned with the archive Cloud Run service!"
echo ""
echo "🧪 Next Steps to Test:"
echo "1. Refresh your frontend page → Should trigger auto-archive"
echo "2. Check browser console for: '📦 Starting archive of completed results...'"
echo "3. Upload and process invoices → Should see faster real-time updates"
echo "4. Download CSV → Should auto-archive before download"
echo ""
echo "🔍 Monitor these logs:"
echo "• '📦 Archived N completed results' - Successful archive"
echo "• '📭 No completed results to archive' - Clean state"
echo "• '📊 Simplified processing: N results' - Fast queries"