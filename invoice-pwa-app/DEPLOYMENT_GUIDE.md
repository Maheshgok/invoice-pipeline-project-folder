# PWA Deployment Guide

## Overview
This guide covers deployment options for the Invoice Processing PWA, including Netlify, Vercel, and Firebase Hosting.

## Pre-Deployment Checklist

### 1. Environment Configuration
Ensure all environment variables are set:
```bash
# .env.production
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=your-app-id
VITE_INITIAL_API_ENDPOINT=https://initial-api-your-hash-uc.a.run.app
VITE_QUEUE_PROCESSOR_ENDPOINT=https://queue-processor-your-hash-uc.a.run.app
VITE_ARCHIVE_MANAGER_ENDPOINT=https://archive-manager-your-hash-uc.a.run.app
```

### 2. Build Verification
```bash
cd invoice-pwa-app
npm run build
```
- Verify no build errors
- Check bundle sizes are reasonable
- Test the preview build locally

### 3. PWA Requirements Check
- [ ] HTTPS certificate configured
- [ ] Service worker properly configured
- [ ] Manifest.json is valid
- [ ] Icons are optimized and correct sizes

## Deployment Options

## Option 1: Netlify (Recommended)

### 1. Automatic Deployment via Git

#### Setup Repository
```bash
# If not already in git
git init
git add .
git commit -m "Initial PWA commit"
git branch -M main
git remote add origin https://github.com/yourusername/invoice-pwa.git
git push -u origin main
```

#### Netlify Configuration
1. Go to [Netlify](https://netlify.com)
2. Click "New site from Git"
3. Connect your GitHub repository
4. Configure build settings:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
   - **Node version**: 18

#### Environment Variables
In Netlify dashboard → Site settings → Environment variables:
```
VITE_FIREBASE_API_KEY = your-api-key
VITE_FIREBASE_AUTH_DOMAIN = your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID = your-project-id
VITE_FIREBASE_STORAGE_BUCKET = your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID = 123456789
VITE_FIREBASE_APP_ID = your-app-id
VITE_INITIAL_API_ENDPOINT = https://initial-api-your-hash-uc.a.run.app
VITE_QUEUE_PROCESSOR_ENDPOINT = https://queue-processor-your-hash-uc.a.run.app
VITE_ARCHIVE_MANAGER_ENDPOINT = https://archive-manager-your-hash-uc.a.run.app
```

#### Netlify Configuration File
Create `netlify.toml` in project root:
```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "18"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/manifest.json"
  [headers.values]
    Content-Type = "application/manifest+json"

[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "no-cache"

[[headers]]
  for = "*.js"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "*.css"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

### 2. Manual Deployment via CLI
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Build the project
npm run build

# Deploy to Netlify
netlify deploy --prod --dir=dist
```

## Option 2: Vercel

### 1. Automatic Deployment
1. Go to [Vercel](https://vercel.com)
2. Import your Git repository
3. Configure project:
   - **Framework**: Vite
   - **Build command**: `npm run build`
   - **Output directory**: `dist`

### 2. Environment Variables
Add in Vercel dashboard → Settings → Environment Variables

### 3. Vercel Configuration
Create `vercel.json`:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/sw.js",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache"
        }
      ]
    },
    {
      "source": "/manifest.json",
      "headers": [
        {
          "key": "Content-Type",
          "value": "application/manifest+json"
        }
      ]
    }
  ]
}
```

## Option 3: Firebase Hosting

### 1. Setup Firebase Hosting
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize hosting in project directory
firebase init hosting
```

### 2. Firebase Configuration
Update `firebase.json`:
```json
{
  "hosting": {
    "public": "dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "/sw.js",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "no-cache"
          }
        ]
      },
      {
        "source": "/manifest.json",
        "headers": [
          {
            "key": "Content-Type",
            "value": "application/manifest+json"
          }
        ]
      },
      {
        "source": "**/*.@(js|css)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "public, max-age=31536000, immutable"
          }
        ]
      }
    ]
  }
}
```

### 3. Deploy
```bash
# Build the project
npm run build

# Deploy to Firebase
firebase deploy --only hosting
```

## Option 4: Custom Server (nginx)

### 1. Server Configuration
Create nginx configuration:
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    
    root /var/www/invoice-pwa/dist;
    index index.html;
    
    # Handle client-side routing
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Service worker should not be cached
    location /sw.js {
        add_header Cache-Control "no-cache";
        expires off;
    }
    
    # Manifest with correct MIME type
    location /manifest.json {
        add_header Content-Type "application/manifest+json";
    }
    
    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 2. Deployment Script
Create `deploy.sh`:
```bash
#!/bin/bash
set -e

echo "🚀 Starting PWA deployment..."

# Build the project
npm run build

# Copy files to server
rsync -avz --delete dist/ user@server:/var/www/invoice-pwa/dist/

# Restart nginx
ssh user@server "sudo systemctl reload nginx"

echo "✅ Deployment complete!"
```

## Post-Deployment Configuration

### 1. Domain and SSL
- Configure custom domain
- Ensure SSL certificate is valid
- Test HTTPS enforcement
- Verify redirect from HTTP to HTTPS

### 2. PWA Verification
After deployment, verify:
1. App installs properly on mobile/desktop
2. Service worker registers correctly
3. Offline functionality works
4. Push notifications work (if implemented)

### 3. Performance Optimization
1. Enable compression (gzip/brotli)
2. Configure proper caching headers
3. Set up CDN if needed
4. Optimize images and assets

### 4. Monitoring Setup
```javascript
// Add to index.html or main.ts
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('error', (event) => {
    console.error('Service Worker error:', event);
    // Send to monitoring service
  });
}
```

## CI/CD Pipeline

### GitHub Actions Example
Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy PWA

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
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Build
      run: npm run build
      env:
        VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
        VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
        # ... other environment variables
    
    - name: Deploy to Netlify
      uses: nwtgck/actions-netlify@v1.2
      with:
        publish-dir: './dist'
        production-branch: main
        github-token: ${{ secrets.GITHUB_TOKEN }}
        deploy-message: "Deploy from GitHub Actions"
      env:
        NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
        NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
```

## Troubleshooting Common Issues

### PWA Not Installing
- Check manifest.json is accessible
- Verify HTTPS is properly configured
- Ensure service worker registers without errors
- Check browser console for PWA-related errors

### Service Worker Issues
- Clear browser cache and service workers
- Check service worker updates properly
- Verify caching strategies are correct
- Test in incognito mode

### Build Failures
- Check Node.js version compatibility
- Verify all dependencies are installed
- Check for TypeScript errors
- Verify environment variables are set

### Performance Issues
- Analyze bundle size with `npm run build`
- Check for large dependencies
- Optimize images and assets
- Review caching strategies

## Security Considerations

### 1. Environment Variables
- Never commit sensitive keys to repository
- Use platform-specific secret management
- Rotate keys regularly
- Implement proper access controls

### 2. Content Security Policy
Add CSP headers:
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' 'unsafe-inline' https://*.googleapis.com; 
               style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; 
               font-src 'self' https://fonts.gstatic.com;
               img-src 'self' data: https:;
               connect-src 'self' https://*.firebase.com https://*.run.app;">
```

### 3. Firebase Security
- Configure proper Firestore security rules
- Set up appropriate Storage rules
- Enable App Check if available
- Monitor for suspicious activity

## Monitoring and Analytics

### 1. Error Tracking
```javascript
// Add error tracking
window.addEventListener('error', (event) => {
  // Send to error tracking service (Sentry, etc.)
  console.error('Global error:', event.error);
});

// Service worker errors
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('error', (event) => {
    // Track service worker errors
    console.error('SW error:', event);
  });
}
```

### 2. Performance Monitoring
```javascript
// Web Vitals tracking
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

getCLS(console.log);
getFID(console.log);
getFCP(console.log);
getLCP(console.log);
getTTFB(console.log);
```

### 3. User Analytics
- Set up Google Analytics 4
- Track PWA installations
- Monitor user engagement
- Track conversion funnels

## Maintenance

### Regular Tasks
1. Update dependencies monthly
2. Monitor performance metrics
3. Review error logs
4. Test PWA functionality
5. Update SSL certificates
6. Backup deployment configurations

### Version Management
- Use semantic versioning
- Maintain changelog
- Tag releases in Git
- Document breaking changes
- Plan deprecation timeline

This comprehensive deployment guide should help you successfully deploy and maintain your PWA in production.