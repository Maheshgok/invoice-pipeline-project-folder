# URGENT: Firebase Web App Setup Required

## Issue
The Firebase authentication is failing because we don't have a proper web app registered in the Firebase project `ocrinvoice-466611`.

## Solution Steps

### 1. Go to Firebase Console
Navigate to: https://console.firebase.google.com/project/ocrinvoice-466611/overview

### 2. Add Web App
1. Click the "Web" icon (</>) to add a web app
2. App nickname: `invoice-bolt-web`
3. Check "Also set up Firebase Hosting" (optional)
4. Click "Register app"

### 3. Copy Configuration
You'll get a configuration object like this:
```javascript
const firebaseConfig = {
  apiKey: "your-actual-api-key",
  authDomain: "ocrinvoice-466611.firebaseapp.com",
  projectId: "ocrinvoice-466611",
  storageBucket: "ocrinvoice-466611.firebasestorage.app",
  messagingSenderId: "545188726513",
  appId: "1:545188726513:web:ACTUAL_APP_ID"
};
```

### 4. Update .env file
Replace the values in `/invoice-bolt/.env` with the actual ones from step 3.

### 5. Enable Google Authentication
In Firebase Console:
1. Go to "Authentication" → "Sign-in method"
2. Enable "Google" provider
3. Add authorized domains:
   - `localhost` (for development)
   - `invoiceparse.netlify.app` (for production)

### 6. Test the Setup
Run `npm run dev` and test the login flow.

## Current Status
- ❌ Web app not properly registered
- ❌ Using placeholder configuration values
- ✅ Firestore rules deployed
- ✅ Authentication service code ready

## Priority
🔴 CRITICAL - Authentication will not work without proper Firebase web app setup.