/**
 * Authentication Service for Firebase
 * Implements Google OAuth2 sign-in required for Firestore access
 */

import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth } from '../config/firebase';

// Extended user interface to match existing app expectations
export interface User extends Omit<FirebaseUser, 'email'> {
  id: string;
  name: string;
  email: string; // Override to make email required
}

class AuthService {
  private provider: GoogleAuthProvider;

  constructor() {
    this.provider = new GoogleAuthProvider();
    // Request email scope explicitly
    this.provider.addScope('email');
    this.provider.addScope('profile');
    
    // Set custom parameters for OAuth2
    this.provider.setCustomParameters({
      prompt: 'select_account'
    });
  }

  /**
   * Sign in with Google popup
   */
  async signInWithGoogle(): Promise<User> {
    try {
      console.log('🔐 Starting Firebase Google sign-in...');
      
      // Check if auth domain is properly configured
      console.log('🔐 Firebase auth config:', {
        authDomain: auth.app.options.authDomain,
        projectId: auth.app.options.projectId,
        apiKey: auth.app.options.apiKey ? 'Present' : 'Missing'
      });
      
      const result = await signInWithPopup(auth, this.provider);
      console.log('✅ Firebase sign-in successful:', result.user.email);
      
      // Extend Firebase user with required properties
      const extendedUser = {
        ...result.user,
        id: result.user.uid,
        name: result.user.displayName || result.user.email || 'Unknown User',
        email: result.user.email || 'unknown@example.com' // Ensure email is always a string
      } as User;
      
      return extendedUser;
    } catch (error: any) {
      console.error('❌ Firebase sign-in failed:', error.message);
      
      // More specific error messages
      if (error.code === 'auth/popup-blocked') {
        throw new Error('Popup was blocked by the browser. Please allow popups for this site and try again.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('Sign-in was cancelled. Please try again.');
      } else if (error.code === 'auth/unauthorized-domain') {
        throw new Error('This domain is not authorized for Firebase authentication. Please contact support.');
      } else {
        throw new Error(`Firebase authentication failed: ${error.message}`);
      }
    }
  }

  /**
   * Sign out current user
   */
  async signOutUser(): Promise<void> {
    try {
      await signOut(auth);
      console.log('👋 User signed out');
    } catch (error: any) {
      console.error('❌ Sign-out failed:', error.message);
      throw error;
    }
  }

  /**
   * Get current user
   */
  getCurrentUser(): User | null {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return null;
    
    // Extend Firebase user with required properties
    return {
      ...firebaseUser,
      id: firebaseUser.uid,
      name: firebaseUser.displayName || firebaseUser.email || 'Unknown User',
      email: firebaseUser.email || 'unknown@example.com' // Ensure email is always a string
    } as User;
  }

  /**
   * Listen to auth state changes
   */
  onAuthStateChange(callback: (user: User | null) => void): () => void {
    return onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Extend Firebase user with required properties
        const extendedUser = {
          ...firebaseUser,
          id: firebaseUser.uid,
          name: firebaseUser.displayName || firebaseUser.email || 'Unknown User',
          email: firebaseUser.email || 'unknown@example.com' // Ensure email is always a string
        } as User;
        callback(extendedUser);
      } else {
        callback(null);
      }
    });
  }

  /**
   * Check if user is signed in
   */
  isSignedIn(): boolean {
    return !!auth.currentUser;
  }

  /**
   * Get user email safely
   */
  getUserEmail(): string | null {
    return auth.currentUser?.email || null;
  }
}

export const authService = new AuthService();