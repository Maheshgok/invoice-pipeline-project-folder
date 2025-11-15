import {
  signInWithPopup,
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
  }

  /**
   * Sign in with Google
   */
  async signInWithGoogle(): Promise<UserCredential> {
    try {
      console.log('🔐 Initiating Google sign-in...')
      const result = await signInWithPopup(auth, this.googleProvider)
      console.log('✅ Google sign-in successful:', result.user.email)
      return result
    } catch (error: any) {
      console.error('❌ Google sign-in failed:', error)
      this.handleAuthError(error)
      throw error
    }
  }

  /**
   * Sign in with email and password
   */
  async signInWithEmail(credentials: LoginCredentials): Promise<UserCredential> {
    try {
      console.log('🔐 Signing in with email:', credentials.email)
      const result = await signInWithEmailAndPassword(auth, credentials.email, credentials.password)
      console.log('✅ Email sign-in successful:', result.user.email)
      return result
    } catch (error: any) {
      console.error('❌ Email sign-in failed:', error)
      this.handleAuthError(error)
      throw error
    }
  }

  /**
   * Sign up with email and password
   */
  async signUpWithEmail(credentials: LoginCredentials): Promise<UserCredential> {
    try {
      console.log('🔐 Creating account for:', credentials.email)
      const result = await createUserWithEmailAndPassword(auth, credentials.email, credentials.password)
      console.log('✅ Account created successfully:', result.user.email)
      return result
    } catch (error: any) {
      console.error('❌ Account creation failed:', error)
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
      console.log('👋 User signed out successfully')
    } catch (error: any) {
      console.error('❌ Sign-out failed:', error)
      throw error
    }
  }

  /**
   * Reset password
   */
  async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(auth, email)
      console.log('📧 Password reset email sent to:', email)
    } catch (error: any) {
      console.error('❌ Password reset failed:', error)
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
      console.error('❌ Failed to get ID token:', error)
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
      'auth/popup-closed-by-user': 'Sign-in was cancelled. Please try again.',
      'auth/popup-blocked': 'Popup was blocked by your browser. Please allow popups for this site.',
      'auth/network-request-failed': 'Network error. Please check your connection and try again.',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
    }

    const userFriendlyMessage = errorMessages[error.code] || error.message
    error.userMessage = userFriendlyMessage
  }
}

export const authService = new AuthService()