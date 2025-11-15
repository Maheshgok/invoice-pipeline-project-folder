/**
 * Firebase Configuration and Initialization
 * Configured for Firestore realtime listeners
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Firebase configuration - using environment variables with validation
console.log('🔍 Environment variables check:', {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY ? 'Present' : 'Missing',
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ? 'Present' : 'Missing', 
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID ? 'Present' : 'Missing',
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ? 'Present' : 'Missing',
  VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ? 'Present' : 'Missing',
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID ? 'Present' : 'Missing'
});

// Production configuration for watch-mail-trial project (journal-entry-helper web app)
const productionConfig = {
  apiKey: "AIzaSyDrr7F0k6r8WqApODpAdrvdgocTBMv0Ycw",
  authDomain: "watch-mail-trial.firebaseapp.com",
  projectId: "watch-mail-trial",
  storageBucket: "watch-mail-trial.firebasestorage.app",
  messagingSenderId: "812016027146",
  appId: "1:812016027146:web:3883c3114d289a687241f3",
  measurementId: "G-8SDCX2BRFL"
};

// Use env vars if available, otherwise use production config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || productionConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || productionConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || productionConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || productionConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || productionConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || productionConfig.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || productionConfig.measurementId
};

// Validate Firebase configuration
if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.authDomain) {
  console.error('❌ Firebase configuration incomplete:', firebaseConfig);
  console.warn('⚠️ Using fallback configuration for watch-mail-trial project');
  // Don't throw error, use fallback config instead
} else {
  console.log('✅ Firebase configuration loaded successfully:', {
    projectId: firebaseConfig.projectId,
    hasApiKey: !!firebaseConfig.apiKey,
    authDomain: firebaseConfig.authDomain
  });
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Auth  
export const auth = getAuth(app);

// Test configuration in development
if (import.meta.env.DEV) {
  import('../services/firebaseConfigTester');
}

// Test Firestore connection and permissions
if (import.meta.env.DEV) {
  console.log('🔥 Firebase initialized with config:', {
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain
  });
}

// Connect to emulator in development (optional)
if (import.meta.env.DEV && !import.meta.env.VITE_USE_FIREBASE_PROD) {
  console.log('🔧 Connecting to Firestore emulator...');
  try {
    connectFirestoreEmulator(db, 'localhost', 8080);
  } catch (error) {
    console.warn('⚠️ Firestore emulator connection failed:', error);
  }
}

export default app;