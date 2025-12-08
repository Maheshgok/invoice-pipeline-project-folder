import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth'
import { auth } from '../config/firebase'
import { authService } from '../services/auth'
import { userService, type UserProfile } from '../services/userService'
import type { AuthContextType, LoginCredentials, User } from '../types/auth'

// Enhanced context type with user management
interface EnhancedAuthContextType extends AuthContextType {
  userProfile: UserProfile | null
  refreshUserProfile: () => Promise<void>
  hasPermission: (permission: keyof UserProfile['permissions']) => boolean
  checkUsageLimits: () => Promise<ReturnType<typeof userService.checkUsageLimits>>
  validateFileSize: (fileSizeInMB: number) => Promise<ReturnType<typeof userService.validateFileSize>>
}

const AuthContext = createContext<EnhancedAuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Refresh user profile
  const refreshUserProfile = async () => {
    try {
      if (user) {
        const profile = await userService.getUserProfile(user.uid)
        setUserProfile(profile)
      }
    } catch (error) {
      console.error('Error refreshing user profile:', error)
    }
  }

  // Check if user has permission
  const hasPermission = (permission: keyof UserProfile['permissions']): boolean => {
    return userProfile?.permissions?.[permission] || false
  }

  // Check usage limits wrapper
  const checkUsageLimits = async () => {
    return await userService.checkUsageLimits()
  }

  // Validate file size wrapper
  const validateFileSize = async (fileSizeInMB: number) => {
    return await userService.validateFileSize(fileSizeInMB)
  }

  // Convert Firebase user to our User type
  const convertFirebaseUser = (firebaseUser: FirebaseUser): User => ({
    ...firebaseUser,
    id: firebaseUser.uid,
    email: firebaseUser.email || '',
    displayName: firebaseUser.displayName,
    photoURL: firebaseUser.photoURL,
    emailVerified: firebaseUser.emailVerified,
  })

  useEffect(() => {
    console.log('🔄 Setting up enhanced auth state listener...')
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const user = convertFirebaseUser(firebaseUser)
          console.log('✅ User authenticated:', user.email)
          setUser(user)
          
          // Create or update user profile
          try {
            const profile = await userService.createOrUpdateUserProfile(user)
            setUserProfile(profile)
            console.log('📋 User profile updated:', profile.role)
          } catch (profileError) {
            console.error('❌ Error managing user profile:', profileError)
            setUserProfile(null)
          }
        } else {
          console.log('❌ User not authenticated')
          setUser(null)
          setUserProfile(null)
        }
      } catch (err: any) {
        console.error('❌ Auth state change error:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })

    return () => {
      console.log('🔄 Cleaning up auth listener')
      unsubscribe()
    }
  }, [])

  const signInWithGoogle = async (): Promise<void> => {
    try {
      setError(null)
      setLoading(true)
      await authService.signInWithGoogle()
      // User state will be updated by onAuthStateChanged
    } catch (err: any) {
      setError(err.userMessage || err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const signInWithEmail = async (credentials: LoginCredentials): Promise<void> => {
    try {
      setError(null)
      setLoading(true)
      await authService.signInWithEmail(credentials)
      // User state will be updated by onAuthStateChanged
    } catch (err: any) {
      setError(err.userMessage || err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const signUpWithEmail = async (credentials: LoginCredentials): Promise<void> => {
    try {
      setError(null)
      setLoading(true)
      await authService.signUpWithEmail(credentials)
      // User state will be updated by onAuthStateChanged
    } catch (err: any) {
      setError(err.userMessage || err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const signOut = async (): Promise<void> => {
    try {
      setError(null)
      await authService.signOut()
      // User state will be updated by onAuthStateChanged
    } catch (err: any) {
      setError(err.message)
      throw err
    }
  }

  const resetPassword = async (email: string): Promise<void> => {
    try {
      setError(null)
      await authService.resetPassword(email)
    } catch (err: any) {
      setError(err.userMessage || err.message)
      throw err
    }
  }

  const clearError = (): void => {
    setError(null)
  }

  const value: EnhancedAuthContextType = {
    user,
    userProfile,
    loading,
    error,
    isAuthenticated: !!user && !!userProfile,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    logout: signOut,
    resetPassword,
    clearError,
    refreshUserProfile,
    hasPermission,
    checkUsageLimits,
    validateFileSize,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): EnhancedAuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}