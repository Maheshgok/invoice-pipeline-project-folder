# Service Configuration Template

## Environment Variables

Copy this file to `.env` in each service directory and fill in the values.

### Common Variables (All Services)
```env
NODE_ENV=development
PORT=3001

# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com

# Logging
LOG_LEVEL=info
```

### SuperAdmin Service (.env)
```env
PORT=3001
SERVICE_NAME=superadmin-service
```

### Admin Service (.env)
```env
PORT=3002
SERVICE_NAME=admin-service

# Email Configuration (for invites)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Stripe (for billing)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Core Invoice Service (.env)
```env
PORT=3003
SERVICE_NAME=core-invoice-service

# Google Cloud Storage
GCS_BUCKET_NAME=watch-mail-trial-invoice-processing

# OpenAI
OPENAI_API_KEY=sk-...

# Cloud Tasks (for processing queue)
CLOUD_TASKS_PROJECT_ID=your-project-id
CLOUD_TASKS_LOCATION=us-central1
CLOUD_TASKS_QUEUE=invoice-processing
```

### Frontend Service URLs
```env
# API Service URLs (update in frontend config)
VITE_SUPERADMIN_SERVICE_URL=http://localhost:3001
VITE_ADMIN_SERVICE_URL=http://localhost:3002
VITE_CORE_SERVICE_URL=http://localhost:3003
```

## Development Setup

1. Copy environment templates to each service
2. Update Firebase project configuration
3. Install dependencies in each service:
   ```bash
   cd services/superadmin-service && npm install
   cd services/admin-service && npm install
   cd services/core-invoice-service && npm install
   ```
4. Start services:
   ```bash
   # Terminal 1
   cd services/superadmin-service && npm run dev
   
   # Terminal 2
   cd services/admin-service && npm run dev
   
   # Terminal 3
   cd services/core-invoice-service && npm run dev
   ```

## Deployment

Each service can be deployed independently to:
- Google Cloud Run
- AWS Lambda
- Azure Functions
- Docker containers
- Traditional servers

## Service Ports
- SuperAdmin Service: 3001
- Admin Service: 3002
- Core Invoice Service: 3003
- Frontend: 3000