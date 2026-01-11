import { 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider, 
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  type User
} from 'firebase/auth'
import { auth } from '../config/firebase'

class AuthService {
  private currentUser: User | null = null

  constructor() {
    // Listen for auth state changes
    firebaseOnAuthStateChanged(auth, (user) => {
      this.currentUser = user
    })
    
    // Handle redirect result on page load
    this.handleRedirectResult()
  }

  private async handleRedirectResult() {
    try {
      const result = await getRedirectResult(auth)
      if (result?.user) {
        console.log('✅ Redirect sign-in successful:', result.user.email)
      }
    } catch (error) {
      console.error('❌ Redirect sign-in error:', error)
    }
  }

  // Detect if device is mobile
  private isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           window.innerWidth <= 768
  }

  async signInWithGoogle(): Promise<User | null> {
    try {
      const provider = new GoogleAuthProvider()
      provider.addScope('email')
      provider.addScope('profile')
      
      // Use redirect for mobile devices, popup for desktop
      if (this.isMobile()) {
        console.log('📱 Using redirect flow for mobile device')
        await signInWithRedirect(auth, provider)
        // Note: signInWithRedirect doesn't return immediately
        // The result will be handled by getRedirectResult() after redirect
        return null
      } else {
        console.log('🖥️ Using popup flow for desktop')
        const result = await signInWithPopup(auth, provider)
        return result.user
      }
    } catch (error: any) {
      console.error('Google sign-in error:', error)
      
      // Provide user-friendly error messages
      let errorMessage = 'Login failed. Please try again.'
      
      if (error.code === 'auth/popup-blocked') {
        errorMessage = 'Popup was blocked. Please allow popups and try again.'
      } else if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Login was cancelled. Please try again.'
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your internet connection.'
      } else if (error.code === 'auth/unauthorized-domain') {
        const currentDomain = window.location.host
        if (currentDomain.includes('10.43.0.91') || currentDomain.match(/^\d+\.\d+\.\d+\.\d+/)) {
          errorMessage = `Network IP (${currentDomain}) not authorized. Please add this domain to Firebase Auth or use localhost tunneling.`
        } else {
          errorMessage = 'This domain is not authorized. Please contact support.'
        }
      }
      
      const enhancedError = new Error(errorMessage)
      ;(enhancedError as any).originalError = error
      throw enhancedError
    }
  }

  async signOut(): Promise<void> {
    try {
      await firebaseSignOut(auth)
      this.currentUser = null
    } catch (error) {
      console.error('Sign out error:', error)
      throw error
    }
  }

  getCurrentUser(): User | null {
    return auth.currentUser || this.currentUser
  }

  getCurrentUserUID(): string | null {
    const user = this.getCurrentUser()
    return user ? user.uid : null
  }

  async getIdToken(): Promise<string | null> {
    const user = this.getCurrentUser()
    if (!user) return null
    
    try {
      return await user.getIdToken()
    } catch (error) {
      console.error('Error getting ID token:', error)
      return null
    }
  }

  onAuthStateChanged(callback: (user: User | null) => void): () => void {
    return firebaseOnAuthStateChanged(auth, callback)
  }

  isAuthenticated(): boolean {
    return !!this.getCurrentUser()
  }

  getUserEmail(): string | null {
    const user = this.getCurrentUser()
    return user ? user.email : null
  }

  getUserDisplayName(): string | null {
    const user = this.getCurrentUser()
    return user ? user.displayName : null
  }

  getUserPhotoURL(): string | null {
    const user = this.getCurrentUser()
    return user ? user.photoURL : null
  }
}

export const authService = new AuthService()
export default authService