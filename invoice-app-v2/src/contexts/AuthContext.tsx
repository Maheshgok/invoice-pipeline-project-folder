import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth'
import { auth } from '../config/firebase'
import { authService } from '../services/auth'
import type { AuthContextType, LoginCredentials, User } from '../types/auth'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    console.log('🔄 Setting up auth state listener...')
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      try {
        if (firebaseUser) {
          const user = convertFirebaseUser(firebaseUser)
          console.log('✅ User authenticated:', user.email)
          setUser(user)
        } else {
          console.log('❌ User not authenticated')
          setUser(null)
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

  const value: AuthContextType = {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    logout: signOut,
    resetPassword,
    clearError,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}