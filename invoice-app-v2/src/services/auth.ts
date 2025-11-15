import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  UserCredential,
  User as FirebaseUser,
} from 'firebase/auth'
import { auth } from '../config/firebase'
import type { LoginCredentials } from '../types/auth'

export class AuthService {
  private googleProvider: GoogleAuthProvider

  constructor() {
    this.googleProvider = new GoogleAuthProvider()
    this.googleProvider.setCustomParameters({
      prompt: 'select_account'
    })
    
    // Check for redirect result on initialization
    this.checkRedirectResult()
  }

  /**
   * Check for redirect result from Google sign-in
   */
  private async checkRedirectResult(): Promise<void> {
    try {
      const result = await getRedirectResult(auth)
      if (result) {
        console.log(' Google redirect sign-in successful:', result.user.email)
      }
    } catch (error: any) {
      console.error(' Google redirect sign-in failed:', error)
    }
  }

  /**
   * Sign in with Google using popup with fallback to redirect
   */
  async signInWithGoogle(): Promise<UserCredential> {
    try {
      console.log(' Initiating Google sign-in...')
      
      // First try popup method
      const result = await signInWithPopup(auth, this.googleProvider)
      console.log(' Google sign-in successful:', result.user.email)
      return result
      
    } catch (error: any) {
      console.error(' Google sign-in popup failed:', error)
      
      // If popup fails, try redirect method
      if (error.code === 'auth/popup-blocked' || 
          error.code === 'auth/popup-closed-by-user' ||
          error.message.includes('popup') ||
          error.message.includes('Cross-Origin-Opener-Policy')) {
        
        console.log(' Falling back to redirect method...')
        try {
          await signInWithRedirect(auth, this.googleProvider)
          // The redirect will handle the rest
          return Promise.reject(new Error('REDIRECT_IN_PROGRESS'))
        } catch (redirectError: any) {
          console.error(' Google redirect sign-in failed:', redirectError)
          this.handleAuthError(redirectError)
          throw redirectError
        }
      }
      
      this.handleAuthError(error)
      throw error
    }
  }

  /**
   * Sign in with email and password
   */
  async signInWithEmail(credentials: LoginCredentials): Promise<UserCredential> {
    try {
      console.log(' Signing in with email:', credentials.email)
      const result = await signInWithEmailAndPassword(auth, credentials.email, credentials.password)
      console.log(' Email sign-in successful:', result.user.email)
      return result
    } catch (error: any) {
      console.error(' Email sign-in failed:', error)
      this.handleAuthError(error)
      throw error
    }
  }

  /**
   * Sign up with email and password
   */
  async signUpWithEmail(credentials: LoginCredentials): Promise<UserCredential> {
    try {
      console.log(' Creating account for:', credentials.email)
      const result = await createUserWithEmailAndPassword(auth, credentials.email, credentials.password)
      console.log(' Account created successfully:', result.user.email)
      return result
    } catch (error: any) {
      console.error(' Account creation failed:', error)
      this.handleAuthError(error)
      throw error
    }
  }

  /**
   * Sign out current user
   */
  async signOut(): Promise<void> {
    try {
      await firebaseSignOut(auth)
      console.log(' User signed out successfully')
    } catch (error: any) {
      console.error(' Sign-out failed:', error)
      throw error
    }
  }

  /**
   * Reset password
   */
  async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(auth, email)
      console.log(' Password reset email sent to:', email)
    } catch (error: any) {
      console.error(' Password reset failed:', error)
      this.handleAuthError(error)
      throw error
    }
  }

  /**
   * Get current user
   */
  getCurrentUser(): FirebaseUser | null {
    return auth.currentUser
  }

  /**
   * Get current user's ID token
   */
  async getIdToken(): Promise<string | null> {
    const user = this.getCurrentUser()
    if (!user) return null

    try {
      return await user.getIdToken()
    } catch (error) {
      console.error(' Failed to get ID token:', error)
      return null
    }
  }

  /**
   * Handle authentication errors with user-friendly messages
   */
  private handleAuthError(error: any): void {
    const errorMessages: Record<string, string> = {
      'auth/user-not-found': 'No account found with this email address.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/weak-password': 'Password should be at least 6 characters long.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/popup-closed-by-user': 'Sign-in was cancelled. Trying alternative method...',
      'auth/popup-blocked': 'Popup was blocked. Trying alternative method...',
      'auth/network-request-failed': 'Network error. Please check your connection and try again.',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
      'auth/unauthorized-domain': 'This domain is not authorized for OAuth operations.',
      'auth/operation-not-allowed': 'Google sign-in is not enabled for this project.',
    }

    const userFriendlyMessage = errorMessages[error.code] || error.message
    error.userMessage = userFriendlyMessage
  }
}

export const authService = new AuthService()
