# Technical Specifications - Invoice Processing Pipeline

## Project Overview
A comprehensive invoice processing system with AI-powered OCR, real-time data synchronization, and automated journal entry generation for Indian business accounting workflows.

---

## System Architecture

### High-Level Architecture
```
Frontend (React/Vite) → Firebase Auth → Cloud Run APIs → Cloud Storage → OpenAI Vision API → Firestore
```

### Data Flow Diagram (DFD)

#### Level 0 - Context Diagram
```
┌─────────────┐     ┌─────────────────────────────┐     ┌─────────────┐
│    User     │────▶│   Invoice Processing        │────▶│ Processed   │
│             │     │        System               │     │   Data      │
└─────────────┘     └─────────────────────────────┘     └─────────────┘
```

#### Level 1 - Main Processes
```
┌─────────┐   1.0   ┌─────────────┐   2.0   ┌─────────────┐   3.0   ┌─────────────┐
│  User   │────────▶│   Upload    │────────▶│   Process   │────────▶│   Display   │
│         │         │  Invoice    │         │  with AI    │         │  Results    │
└─────────┘         └─────────────┘         └─────────────┘         └─────────────┘
                            │                       │                       │
                            ▼                       ▼                       ▼
                    ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
                    │   Cloud     │       │   OpenAI    │       │ Firestore   │
                    │  Storage    │       │ Vision API  │       │ Real-time   │
                    └─────────────┘       └─────────────┘       └─────────────┘
```

#### Level 2 - Detailed Process Flow
```
Frontend                   Backend Services                    External Services
┌─────────────┐           ┌─────────────┐   ┌─────────────┐    ┌─────────────┐
│   Login     │──────────▶│ Firebase    │   │  Initial    │    │ Google      │
│ Component   │           │    Auth     │   │   API       │    │ OAuth 2.0   │
└─────────────┘           └─────────────┘   └─────────────┘    └─────────────┘
       │                         │                │                    │
       ▼                         ▼                ▼                    ▼
┌─────────────┐           ┌─────────────┐   ┌─────────────┐    ┌─────────────┐
│   Upload    │──────────▶│ File Upload │──▶│   Cloud     │    │   OpenAI    │
│ Component   │           │ Validation  │   │  Storage    │    │ Vision API  │
└─────────────┘           └─────────────┘   └─────────────┘    └─────────────┘
       │                         │                │                    │
       ▼                         ▼                ▼                    ▼
┌─────────────┐           ┌─────────────┐   ┌─────────────┐    ┌─────────────┐
│ Real-time   │◄──────────│ Queue       │──▶│  AI Image   │    │ Firestore   │
│ Results     │           │ Processor   │   │ Processing  │    │ Database    │
└─────────────┘           └─────────────┘   └─────────────┘    └─────────────┘
```

---

## Technology Stack

### Frontend Technologies
| Technology | Version | Purpose | Justification |
|------------|---------|---------|---------------|
| **React** | 18.2.0 | UI Framework | Modern component-based architecture, excellent ecosystem |
| **TypeScript** | 5.2.2 | Type Safety | Enhanced developer experience, compile-time error detection |
| **Vite** | 4.5.0 | Build Tool | Fast development server, optimized production builds |
| **Tailwind CSS** | 3.3.5 | Styling | Utility-first CSS, rapid UI development |
| **Firebase SDK** | 10.7.0 | Authentication & Firestore | Real-time data sync, Google OAuth integration |
| **Zustand** | 4.4.7 | State Management | Lightweight, TypeScript-friendly state management |
| **React Router** | 6.20.0 | Navigation | Client-side routing, SPA experience |
| **Framer Motion** | 10.16.0 | Animations | Smooth UI transitions, enhanced UX |

### Backend Technologies
| Technology | Version | Purpose | Justification |
|------------|---------|---------|---------------|
| **Python** | 3.11 | Backend Language | Excellent AI/ML library ecosystem, Google Cloud compatibility |
| **Flask** | 3.0.0 | Web Framework | Lightweight, flexible for microservices architecture |
| **Gunicorn** | 21.2.0 | WSGI Server | Production-ready Python application server |
| **Firebase Admin** | 6.2.0 | Authentication | Secure token validation, user management |

### Google Cloud Platform Services
| Service | Purpose | Configuration | Justification |
|---------|---------|---------------|---------------|
| **Cloud Run** | Container Hosting | 2GB RAM, 2 CPU, 900s timeout | Serverless, auto-scaling, cost-effective |
| **Cloud Storage** | File Storage | `watch-mail-trial-invoice-raw-files` bucket | Secure, scalable file storage |
| **Firestore** | Database | Real-time NoSQL database | Real-time sync, offline support, scalable |
| **Identity & Access Management** | Security | Service accounts, fine-grained permissions | Secure API access, least privilege principle |

### External APIs & Services
| Service | Version | Purpose | Justification |
|---------|---------|---------|---------------|
| **OpenAI Vision API** | ≥1.50.0 | AI Image Processing | State-of-the-art OCR and data extraction |
| **Firebase Authentication** | 10.7.0 | User Management | Google OAuth, secure authentication |
| **Netlify** | - | Frontend Hosting | CDN, continuous deployment, custom domains |

---

## Environment Variables & Configuration

### Frontend Environment Variables (Vite)
| Variable | Purpose | Example | Required |
|----------|---------|---------|----------|
| `VITE_FIREBASE_API_KEY` | Firebase configuration | `AIzaSy...` | ✅ |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain | `project.firebaseapp.com` | ✅ |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID | `watch-mail-trial` | ✅ |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket | `project.appspot.com` | ✅ |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging | `123456789` | ✅ |
| `VITE_FIREBASE_APP_ID` | Firebase app ID | `1:123:web:abc` | ✅ |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client | `123.googleusercontent.com` | ✅ |

### Backend Environment Variables (Cloud Run)
| Variable | Purpose | Example | Required |
|----------|---------|---------|----------|
| `PROJECT_ID` | GCP Project ID | `watch-mail-trial` | ✅ |
| `BUCKET_NAME` | Storage bucket name | `watch-mail-trial-invoice-raw-files` | ✅ |
| `OPENAI_API_KEY` | OpenAI API access | `sk-proj-...` | ✅ |
| `PORT` | Application port | `8080` | ❌ (default: 8080) |

---

## Dependency Versions

### Frontend Dependencies (package.json)
```json
{
  "dependencies": {
    "clsx": "^2.0.0",
    "date-fns": "^2.30.0",
    "firebase": "^10.7.0",
    "firebase-admin": "^12.0.0",
    "framer-motion": "^10.16.0",
    "lucide-react": "^0.294.0",
    "node-fetch": "^2.6.7",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-dropzone": "^14.3.8",
    "react-hot-toast": "^2.6.0",
    "react-pdf": "^7.6.0",
    "react-router-dom": "^6.20.0",
    "tailwind-merge": "^2.0.0",
    "zustand": "^4.4.7",
    "lambda-multipart-parser": "^1.0.1"
  },
  "devDependencies": {
    "@tailwindcss/forms": "^0.5.7",
    "@tailwindcss/typography": "^0.5.10",
    "@types/react": "^18.2.37",
    "@types/react-dom": "^18.2.15",
    "@vitejs/plugin-react": "^4.1.1",
    "autoprefixer": "^10.4.16",
    "eslint": "^8.53.0",
    "postcss": "^8.4.31",
    "tailwindcss": "^3.3.5",
    "typescript": "^5.2.2",
    "vite": "^4.5.0"
  }
}
```

### Backend Dependencies

#### Initial API Service (requirements.txt)
```txt
flask==2.3.0
flask-cors==4.0.0
google-cloud-storage==2.10.0
google-cloud-firestore==2.11.1
firebase-admin==6.2.0
gunicorn==21.0.0
```

#### Queue Processor Service (requirements.txt)
```txt
flask==3.0.0
google-cloud-firestore==2.13.1
google-cloud-storage==2.10.0
google-auth==2.23.4
firebase-admin==6.2.0
openai>=1.50.0
gunicorn==21.2.0
pdf2image==1.17.0
Pillow==10.4.0
httpx>=0.24.0
```

---

## Architectural Decisions & Justifications

### 1. Firestore as Primary Database
**Decision**: Use Firestore NoSQL database with real-time listeners
**Justification**:
- Real-time data synchronization without polling
- Offline support for mobile/web clients
- Automatic scaling and managed infrastructure
- Native Firebase Authentication integration
- Optimistic UI updates with conflict resolution

### 2. Single Collection Architecture
**Decision**: Consolidate data into `invoice_results` collection instead of separate collections
**Justification**:
- Simplified data model and queries
- Atomic transactions for related data
- Reduced complexity in frontend state management
- Better performance with fewer listener subscriptions
- Easier to maintain data consistency

### 3. Cloud Run for Backend Services
**Decision**: Use Google Cloud Run for containerized microservices
**Justification**:
- Serverless with automatic scaling (0 to N instances)
- Pay-per-request pricing model
- Native integration with other GCP services
- Container-based deployment for consistency
- Built-in load balancing and health checks

### 4. Netlify for Frontend Hosting
**Decision**: Host React application on Netlify
**Justification**:
- Automatic deployments from Git repository
- Global CDN for fast content delivery
- Built-in SSL certificates
- Environment variable management
- Form handling and serverless functions

### 5. OpenAI Vision API for OCR
**Decision**: Use OpenAI's GPT-4 Vision API instead of Google Vision API
**Justification**:
- Superior understanding of invoice context and structure
- Built-in reasoning capabilities for journal entry generation
- Natural language processing for complex business rules
- Structured JSON output with validation
- Better handling of Indian tax formats (GST, PAN, GSTIN)

### 6. Firebase Authentication with Google OAuth
**Decision**: Use Firebase Auth with Google OAuth 2.0
**Justification**:
- Seamless integration with Google Workspace
- Enterprise-grade security and compliance
- Built-in user management and profile handling
- Native integration with Firestore security rules
- Reduced authentication complexity

---

## System Components

### Frontend Components Architecture
```
src/
├── components/
│   ├── auth/          # Authentication components
│   ├── upload/        # File upload components  
│   ├── results/       # Results display components
│   └── common/        # Shared UI components
├── hooks/             # Custom React hooks
│   ├── useAuth.ts     # Authentication hook
│   ├── useMultiUpload.ts  # File upload hook
│   └── useFirestore.ts    # Firestore real-time hook
├── services/          # API and service layers
│   ├── auth.ts        # Authentication service
│   ├── firestore.ts   # Firestore service
│   └── upload.ts      # Upload service
└── types/             # TypeScript type definitions
```

**Active Frontend**: `invoice-app-v2` contains the full-featured implementation with all documented capabilities including file dropzone, state management, and UI enhancements.

### Backend Services Architecture
```
Cloud Run Services:
├── initial-api/       # File upload and authentication
│   ├── main.py        # Flask application
│   ├── requirements.txt
│   └── Dockerfile
└── queue-processor/   # AI processing and data storage
    ├── main.py        # Flask application
    ├── openai_processor.py  # OpenAI Vision API integration
    ├── queue_manager.py     # Job queue management
    ├── result_manager.py    # Firestore data management
    ├── background_processor.py  # Background processing
    ├── requirements.txt
    └── Dockerfile
```

---

## Security Configuration

### Firestore Security Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow authenticated users to read/write their own invoice results
    match /invoice_results/{document} {
      allow read, write: if request.auth != null 
        && request.auth.token.email_verified
        && resource.data.user_email == request.auth.token.email;
    }
    
    // Allow authenticated users to create new invoice results
    match /invoice_results/{document} {
      allow create: if request.auth != null 
        && request.auth.token.email_verified
        && request.resource.data.user_email == request.auth.token.email;
    }
  }
}
```

### CORS Configuration
- **Frontend Origin**: `https://invoiceparse.netlify.app`
- **Development Origins**: `http://localhost:3000`, `http://localhost:3001`
- **Allowed Methods**: GET, POST, PUT, DELETE, OPTIONS
- **Allowed Headers**: Authorization, Content-Type
- **Credentials**: Enabled for authenticated requests

---

## Docker Image Tracking

### Current Production Images

#### Queue Processor Service
**Image**: `asia-south1-docker.pkg.dev/watch-mail-trial/cloud-run-source-deploy/queue-processor@sha256:fe48a8dac90b5ef3e824bbc32d2a4b00d81c349250e16e1f5453820f6c319ab3`
- **Deployed**: 2025-11-20 09:52 UTC
- **Revision**: queue-processor-00018-26b
- **Key Changes**: 
  - OpenAI library updated to ≥1.50.0
  - Enhanced error handling in OpenAI client initialization
  - Improved timeout and retry configuration
  - Flask 3.0.0 upgrade
- **Status**: ✅ Active and stable

#### Initial API Service  
**Image**: `asia-south1-docker.pkg.dev/watch-mail-trial/cloud-run-source-deploy/initial-api@sha256:5d41d5dc1d60134a1e61b940cd7f5d1fecf6716ce17013a1703792b5744c5474`
- **Deployed**: 2025-11-13 09:34 UTC
- **Revision**: initial-api-00008-qgf
- **Key Features**:
  - Flask 2.3.0 with CORS support
  - Google Cloud Storage integration
  - Firebase authentication
  - File upload and signed URL generation
- **Status**: ✅ Stable - no updates needed

### Image Verification Commands

To verify current deployed images:
```bash
# Queue Processor
gcloud run services describe queue-processor \
  --region asia-south1 \
  --project watch-mail-trial \
  | grep -A1 "Image:"

# Initial API  
gcloud run services describe initial-api \
  --region asia-south1 \
  --project watch-mail-trial \
  | grep -A1 "Image:"
```

**Automated Tracking**: Use the provided scripts for easier image tracking:
- **Linux/MacOS**: `./scripts/track-images.sh`
- **Windows**: `.\scripts\track-images.ps1`

### Deployment History

| Date | Service | Image SHA | Changes |
|------|---------|-----------|---------|
| 2025-11-20 | queue-processor | `fe48a8da...` | OpenAI ≥1.50.0, error handling improvements |
| 2025-11-13 | initial-api | `5d41d5dc...` | Stable deployment with Flask 2.3.0 |

---

## Performance Specifications

### Cloud Run Configuration
| Service | Memory | CPU | Timeout | Concurrency | Latest Image |
|---------|--------|-----|---------|-------------|--------------|
| initial-api | 1GB | 1 vCPU | 600s | 1000 | `asia-south1-docker.pkg.dev/watch-mail-trial/cloud-run-source-deploy/initial-api@sha256:5d41d5dc1d60134a1e61b940cd7f5d1fecf6716ce17013a1703792b5744c5474` |
| queue-processor | 2GB | 2 vCPU | 900s | 100 | `asia-south1-docker.pkg.dev/watch-mail-trial/cloud-run-source-deploy/queue-processor@sha256:fe48a8dac90b5ef3e824bbc32d2a4b00d81c349250e16e1f5453820f6c319ab3` |

**Image Update Log:**
- **queue-processor**: Updated 2025-11-20 09:52 UTC - OpenAI library ≥1.50.0, improved error handling
- **initial-api**: Stable deployment from 2025-11-13 09:34 UTC

### File Upload Limits
- **Maximum File Size**: 10MB per file
- **Supported Formats**: PDF, JPEG, PNG
- **Maximum Files**: 10 files per batch upload
- **Processing Timeout**: 15 minutes per file

### Database Performance
- **Firestore Read/Write Limits**: 1 million operations per day (free tier)
- **Real-time Listeners**: Optimized with compound indices
- **Offline Support**: 5MB local cache per client

---

## Monitoring & Logging

### Google Cloud Logging
- **Log Retention**: 30 days
- **Log Levels**: INFO, WARNING, ERROR
- **Structured Logging**: JSON format with correlation IDs

### Application Monitoring
- **Health Checks**: `/health` endpoint on all services
- **Error Tracking**: Automatic error grouping in Cloud Console
- **Performance Monitoring**: Request latency and throughput metrics

---

## Deployment Configuration

### Netlify Deployment
```toml
[build]
  base = "invoice-app-v2"
  publish = "invoice-app-v2/dist" 
  command = "npm run build"

[build.environment]
  SECRETS_SCAN_OMIT_KEYS = "VITE_GOOGLE_CLIENT_ID,VITE_API_BASE_URL"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Cloud Run Deployment
```bash
# Initial API
gcloud run deploy initial-api \
  --source . \
  --platform managed \
  --region asia-south1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 600

# Queue Processor  
gcloud run deploy queue-processor \
  --source . \
  --platform managed \
  --region asia-south1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 900
```

---

## API Endpoints

### Initial API Service
| Endpoint | Method | Purpose | Authentication |
|----------|--------|---------|----------------|
| `/health` | GET | Health check | None |
| `/upload` | POST | File upload to Cloud Storage | Firebase Token |
| `/signed-url` | POST | Generate signed upload URL | Firebase Token |
| `/process-queue` | POST | Trigger queue processing | Firebase Token |

### Queue Processor Service  
| Endpoint | Method | Purpose | Authentication |
|----------|--------|---------|----------------|
| `/health` | GET | Health check | None |
| `/process-file` | POST | Process uploaded file | Firebase Token |
| `/queue-status` | GET | Get processing status | Firebase Token |

---

## Data Models

### Invoice Result Document (Firestore)
```typescript
interface InvoiceResult {
  id: string;
  user_email: string;
  file_name: string;
  file_url: string;
  upload_timestamp: Timestamp;
  processed_timestamp?: Timestamp;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string;
  
  // Extracted Invoice Data
  vendor_name: string;
  invoice_number: string; 
  invoice_date: string;
  due_date: string;
  total_amount: number;
  currency: string;
  gstin: string;
  pan: string;
  
  // Line Items
  items: InvoiceItem[];
  
  // Tax Details
  tax_details: {
    cgst: number;
    sgst: number; 
    igst: number;
    total_gst: number;
    taxable_amount: number;
  };
  
  // Generated Journal Entries
  suggested_journal_entries: JournalEntry[];
  double_entry_bookkeeping: {
    journal_entry_set: JournalEntrySet[];
  };
}
```

---

## Development Workflow

### Local Development Setup
```bash
# Frontend (Active: invoice-app-v2)
cd invoice-app-v2
npm install
npm run dev

# Backend Services
# Initial API
cd initial-api/Cloudrun_version
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py

# Queue Processor 
cd queue-processor
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

### Deployment Pipeline
1. **Development**: Local testing with hot reload
2. **Staging**: Netlify preview deploys for branches
3. **Production**: Automatic deployment on main branch merge
4. **Backend**: Manual Cloud Run deployment with gcloud CLI

---

## Cost Analysis

### Monthly Cost Estimates (Production)
| Service | Usage | Cost (USD) |
|---------|-------|------------|
| Cloud Run (both services) | ~1M requests | $12 |
| Cloud Storage | 100GB storage, 1TB transfer | $5 |
| Firestore | 1M reads, 500K writes | $1.50 |
| OpenAI API | 1000 image processing calls | $20 |
| Netlify Pro | Custom domain, forms | $19 |
| **Total** | | **~$57.50** |

### Scaling Considerations
- **10x Traffic**: ~$200/month
- **100x Traffic**: ~$1,200/month (requires architecture optimization)

---

## Future Enhancements

### Planned Features
1. **Batch Processing**: Process multiple invoices simultaneously
2. **Approval Workflow**: Multi-step invoice approval process
3. **ERP Integration**: Connect with popular accounting software
4. **Advanced Analytics**: Invoice processing insights and reporting
5. **Mobile Application**: Native iOS/Android apps
6. **Multi-language Support**: Support for regional Indian languages

### Technical Improvements
1. **Caching Layer**: Redis cache for frequently accessed data
2. **Message Queue**: Cloud Pub/Sub for reliable async processing  
3. **CDN Optimization**: CloudFlare integration for global performance
4. **Database Optimization**: Firestore compound indices optimization
5. **Monitoring**: Comprehensive APM with Datadog or New Relic

---

## Known Conflicts & Discrepancies

### 🚨 **Critical Issues Identified**

#### 1. **Project Structure Consolidation**
**Current State**: Successfully consolidated to active directories only:
- ✅ `invoice-app-v2/` - **Active frontend** (Netlify deployment)
- ✅ `initial-api/Cloudrun_version/` - **Active backend API**
- ✅ `queue-processor/` - **Active processing service**  
- ✅ `archived/` - Contains deprecated components

**Archived Components**:
- `invoice-bolt/` - Deprecated simplified frontend
- `invoice-processor/` - Legacy processing service
- `Cloudfunction_backup/` - Deprecated Cloud Function implementation

**Impact**: Clean project structure with no cross-dependencies between active and archived components.

#### 2. **Backend Service Version Misalignment**
**Flask Versions**:
- `initial-api`: Uses Flask 2.3.0
- `queue-processor`: Uses Flask 3.0.0
**Risk**: Potential compatibility issues and security vulnerabilities

**Firestore SDK Versions**:
- `initial-api`: Uses `google-cloud-firestore==2.11.1`
- `queue-processor`: Uses `google-cloud-firestore==2.13.1`
**Risk**: Data consistency issues and API compatibility problems

#### 3. **Cloud Run Configuration Gaps**
**Memory/CPU Limits**: Current deployments show no explicit resource limits
**Timeout Mismatch**: 
- Documented: `initial-api` 300s timeout
- Actual: `initial-api` 600s timeout

#### 4. **Project Structure Clean-up Complete** ✅
**Resolution**: Successfully archived deprecated components
- ✅ All unused directories moved to `archived/` folder
- ✅ Active components clearly identified and documented  
- ✅ No dependencies between active and archived code
- ✅ Archive documentation created for future reference

The active frontend (`invoice-app-v2`) contains all documented features and capabilities.

### 🔧 **Current Project Status**

✅ **Project Structure**: Clean and consolidated
✅ **Active Frontend**: `invoice-app-v2` with full feature set
✅ **Active Backend**: `initial-api/Cloudrun_version` and `queue-processor`
✅ **Archived Components**: Safely stored in `archived/` folder
✅ **Documentation**: Updated to reflect current state

### 📁 **Active Project Structure**

```
invoice-pipeline-project-folder/
├── invoice-app-v2/              # ACTIVE frontend (Netlify)
├── initial-api/
│   └── Cloudrun_version/        # ACTIVE backend API
├── queue-processor/             # ACTIVE processing service
├── shared/                      # Shared configurations  
├── archived/                    # Deprecated components
│   ├── invoice-bolt/           # Old frontend
│   ├── invoice-processor/      # Old processing service
│   └── Cloudfunction_backup/   # Old Cloud Function API
└── [documentation files...]
```

---

## Conclusion

This invoice processing pipeline represents a modern, scalable solution built on proven cloud technologies. The architecture prioritizes real-time user experience, security, and cost-effectiveness while maintaining flexibility for future enhancements.

The system successfully combines cutting-edge AI capabilities with robust cloud infrastructure to deliver a production-ready invoice processing solution tailored for Indian business requirements.