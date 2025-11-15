#!/bin/bash

# Infrastructure Setup for watch-mail-trial Project
echo "🏗️  Setting up infrastructure for watch-mail-trial project..."

PROJECT_ID="watch-mail-trial"
REGION="asia-south1"

# Set project
gcloud config set project $PROJECT_ID

echo "📋 Enabling required APIs..."
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable pubsub.googleapis.com
gcloud services enable firestore.googleapis.com

echo "👤 Creating service accounts..."
gcloud iam service-accounts create processor \
    --display-name="Invoice Processor Service Account"

gcloud iam service-accounts create cloudrun-invoice-uploader \
    --display-name="Cloud Run Invoice Uploader Service Account"

echo "🔑 Granting permissions..."
# Queue Processor permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:processor@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/storage.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:processor@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/datastore.user"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:processor@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/pubsub.editor"

# Initial API permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:cloudrun-invoice-uploader@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/storage.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:cloudrun-invoice-uploader@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/datastore.user"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:cloudrun-invoice-uploader@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/pubsub.editor"

echo "🪣 Creating storage buckets..."
gsutil mb -p $PROJECT_ID -l $REGION gs://watch-mail-trial-invoice-raw-files/
gsutil mb -p $PROJECT_ID -l $REGION gs://watch-mail-trial-invoice-processed-files/

echo "📨 Creating Pub/Sub topics..."
gcloud pubsub topics create step-1-initiate
gcloud pubsub topics create step-1-process-output-dev

echo "✅ Infrastructure setup complete!"
echo ""
echo "📋 Created:"
echo "  ✅ Service Accounts: processor, cloudrun-invoice-uploader"
echo "  ✅ Storage Buckets: watch-mail-trial-invoice-raw-files, watch-mail-trial-invoice-processed-files"
echo "  ✅ Pub/Sub Topics: step-1-initiate, step-1-process-output-dev"
echo "  ✅ Required APIs enabled"
echo ""
echo "🚀 Ready to deploy services with deploy-watch-mail-trial.sh"