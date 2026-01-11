# Invoice Processing System - Deployment Guide

## 🚀 Deployment Options

### Option 1: Netlify Deployment (Recommended for Frontend)

#### PWA App Deployment:
```bash
# 1. Build the PWA
cd invoice-pwa-app
npm run build

# 2. Deploy to Netlify
# - Go to netlify.com and sign up
# - Drag and drop the 'dist' folder to Netlify
# - Or connect your GitHub repository for auto-deployment
```

#### Main App Deployment:
```bash
# 1. Build the main app
cd invoice-app-v2  
npm run build

# 2. Deploy to Netlify
# - Upload the 'dist' folder
# - Set environment variables in Netlify dashboard
```

### Option 2: Firebase Hosting

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase hosting
firebase init hosting

# Build and deploy
npm run build
firebase deploy --only hosting
```

### Option 3: Vercel Deployment

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy directly
vercel --prod

# Or connect GitHub repository for auto-deployment
```

## 🔧 Environment Setup

### Required Environment Variables:

#### For PWA (.env):
```env
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=your_app_id

# API Endpoints
VITE_INITIAL_API_URL=https://initial-api-xyz.run.app
VITE_INITIAL_ANALYSIS_URL=https://initial-analysis-xyz.run.app
VITE_ARCHIVE_MANAGER_URL=https://archive-manager-xyz.run.app
```

#### For Main App (.env):
```env
# Same Firebase config as above
REACT_APP_FIREBASE_API_KEY=your_firebase_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=123456789
REACT_APP_FIREBASE_APP_ID=your_app_id

# API Configuration
REACT_APP_INITIAL_API_URL=https://initial-api-xyz.run.app
REACT_APP_INITIAL_ANALYSIS_URL=https://initial-analysis-xyz.run.app
REACT_APP_ARCHIVE_MANAGER_URL=https://archive-manager-xyz.run.app
```

## 🧪 Testing Checklist

### Pre-Deployment Testing:

#### Functionality Tests:
- [ ] User registration and login
- [ ] File upload (PDF/images)
- [ ] Invoice processing and OCR
- [ ] Real-time data synchronization
- [ ] Mobile responsiveness (PWA)
- [ ] Offline functionality (PWA only)
- [ ] Push notifications (PWA only)
- [ ] Session security and logout
- [ ] Multi-tenant data isolation

#### Performance Tests:
- [ ] Page load times < 3 seconds
- [ ] File upload performance
- [ ] Database query optimization
- [ ] Mobile performance on 3G networks

#### Security Tests:
- [ ] Firebase security rules
- [ ] User data isolation
- [ ] Authentication flows
- [ ] Session management
- [ ] File upload security

### Browser Compatibility:
- [ ] Chrome (Desktop & Mobile)
- [ ] Firefox (Desktop & Mobile)
- [ ] Safari (Desktop & Mobile)
- [ ] Edge (Desktop & Mobile)

## 🔄 CI/CD Pipeline Setup

### GitHub Actions (Recommended):

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run tests
      run: npm test
      
    - name: Build application
      run: npm run build
      env:
        VITE_FIREBASE_API_KEY: ${{ secrets.FIREBASE_API_KEY }}
        # Add other environment variables
        
    - name: Deploy to Netlify
      uses: nwtgck/actions-netlify@v1.2
      with:
        publish-dir: './dist'
        production-branch: main
      env:
        NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
        NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
```

## 🏗️ Infrastructure Requirements

### Cloud Services:
1. **Firebase** (Authentication, Firestore, Storage)
2. **Google Cloud Run** (Backend API services)
3. **Netlify/Vercel** (Frontend hosting)
4. **Google Cloud Storage** (File storage)

### Monitoring:
- Firebase Analytics
- Google Cloud Monitoring
- Netlify Analytics
- Error tracking (Sentry)

## 📱 PWA Installation

### Manual Installation:
1. Visit the PWA URL in Chrome/Safari
2. Look for "Install" or "Add to Home Screen" prompt
3. Follow browser-specific installation steps

### Programmatic Installation:
The PWA includes automatic install prompts and handles installation flows.

## 🔐 Security Configuration

### Firebase Security Rules:
Ensure proper Firestore security rules are deployed:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // User data isolation
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Organization data with role-based access
    match /organizations/{orgId}/{document=**} {
      allow read, write: if request.auth != null && 
        resource.data.members[request.auth.uid] != null;
    }
  }
}
```

## 🚨 Troubleshooting

### Common Issues:
1. **Build Failures**: Check TypeScript errors and fix imports
2. **Firebase Connection**: Verify environment variables
3. **API Endpoints**: Ensure Cloud Run services are deployed
4. **CORS Issues**: Configure proper CORS settings
5. **PWA Installation**: Check manifest.json and service worker

### Debug Commands:
```bash
# Check build output
npm run build -- --mode=development

# Analyze bundle size
npm run analyze

# Check PWA audit
lighthouse https://your-pwa-url.com --view

# Test service worker
chrome://inspect/#service-workers
```

## 📊 Performance Optimization

### Recommendations:
1. Enable Gzip compression
2. Use CDN for static assets
3. Implement code splitting
4. Optimize images and fonts
5. Enable browser caching
6. Minimize bundle size

### Monitoring:
- Set up Google Analytics
- Monitor Core Web Vitals
- Track user engagement metrics
- Monitor error rates and performance