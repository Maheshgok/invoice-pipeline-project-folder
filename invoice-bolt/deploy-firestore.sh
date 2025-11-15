#!/bin/bash

echo "🔥 Deploying Firestore Security Rules..."

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI is not installed. Install it with: npm install -g firebase-tools"
    exit 1
fi

# Check if firebase project is configured
if [ ! -f .firebaserc ]; then
    echo "🔧 Initializing Firebase project..."
    firebase init firestore --project ocrinvoice-466611
else
    echo "✅ Firebase project already configured"
fi

# Deploy Firestore rules
echo "🚀 Deploying Firestore security rules..."
firebase deploy --only firestore:rules --project ocrinvoice-466611

echo ""
echo "✅ Firestore rules deployment complete!"
echo ""
echo "📋 Important: After deployment, verify that:"
echo "   1. Authenticated users can read their own invoice_results"
echo "   2. Client-side Firestore listeners work properly"
echo "   3. Security rules match user email with document user_email field"
echo ""