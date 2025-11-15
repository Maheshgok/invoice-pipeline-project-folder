#!/bin/bash

echo "🚀 Deploying Backend Services to watch-mail-trial Project"
echo "==========================================================="

# Set project variables
PROJECT_ID="watch-mail-trial"
PROJECT_NUMBER="812016027146"
REGION="asia-south1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}📋 Project Configuration:${NC}"
echo -e "  Project ID: ${PROJECT_ID}"
echo -e "  Project Number: ${PROJECT_NUMBER}"
echo -e "  Region: ${REGION}"
echo ""

# Check if gcloud is authenticated and set to correct project
echo -e "${BLUE}🔧 Setting up Google Cloud CLI...${NC}"
gcloud config set project $PROJECT_ID
gcloud config set run/region $REGION

echo ""
echo -e "${BLUE}🏗️  Required Infrastructure Setup:${NC}"
echo -e "${YELLOW}⚠️  Before deploying, ensure the following are created:${NC}"
echo ""
echo -e "${GREEN}✅ Service Accounts:${NC}"
echo "  - processor@watch-mail-trial.iam.gserviceaccount.com"
echo "  - cloudrun-invoice-uploader@watch-mail-trial.iam.gserviceaccount.com"
echo ""
echo -e "${GREEN}✅ Storage Buckets:${NC}"
echo "  - watch-mail-trial-invoice-raw-files"
echo "  - watch-mail-trial-invoice-processed-files"
echo ""
echo -e "${GREEN}✅ Pub/Sub Topics:${NC}"
echo "  - step-1-initiate"
echo "  - step-1-process-output-dev"
echo ""
echo -e "${GREEN}✅ APIs Enabled:${NC}"
echo "  - Cloud Run Admin API"
echo "  - Cloud Build API"
echo "  - Cloud Storage API"
echo "  - Pub/Sub API"
echo "  - Firestore API"
echo ""

# Ask for confirmation
read -p "$(echo -e ${YELLOW}Have you created all the required infrastructure? [y/N]:${NC} )" -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}❌ Please create the required infrastructure first.${NC}"
    echo -e "${BLUE}🔗 Use Google Cloud Console: https://console.cloud.google.com/welcome?project=${PROJECT_ID}${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}🚀 Starting Deployment...${NC}"

# Deploy Queue Processor
echo ""
echo -e "${GREEN}📦 Deploying Queue Processor...${NC}"
cd queue-processor
gcloud run deploy queue-processor \
    --source . \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --project $PROJECT_ID \
    --service-account processor@${PROJECT_ID}.iam.gserviceaccount.com \
    --memory 2Gi \
    --cpu 1 \
    --timeout 3600 \
    --concurrency 80 \
    --max-instances 10 \
    --set-env-vars PROJECT_ID=$PROJECT_ID,REGION=$REGION

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Queue Processor deployed successfully${NC}"
else
    echo -e "${RED}❌ Queue Processor deployment failed${NC}"
    exit 1
fi

# Deploy Initial API
echo ""
echo -e "${GREEN}📦 Deploying Initial API...${NC}"
cd ../initial-api/Cloudrun_version
gcloud run deploy initial-api \
    --source . \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --project $PROJECT_ID \
    --service-account cloudrun-invoice-uploader@${PROJECT_ID}.iam.gserviceaccount.com \
    --memory 1Gi \
    --cpu 1 \
    --timeout 300 \
    --concurrency 100 \
    --max-instances 5 \
    --set-env-vars PROJECT_ID=$PROJECT_ID,REGION=$REGION

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Initial API deployed successfully${NC}"
else
    echo -e "${RED}❌ Initial API deployment failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo ""
echo -e "${BLUE}📋 Service URLs:${NC}"
echo -e "  Queue Processor: https://queue-processor-${PROJECT_NUMBER}.${REGION}.run.app"
echo -e "  Initial API: https://initial-api-${PROJECT_NUMBER}.${REGION}.run.app"
echo ""
echo -e "${YELLOW}⚠️  Next Steps:${NC}"
echo -e "1. Update frontend .env file with new URLs"
echo -e "2. Test the endpoints with /health checks"
echo -e "3. Enable Google Authentication in Firebase Console"
echo -e "4. Test the complete flow"
echo ""