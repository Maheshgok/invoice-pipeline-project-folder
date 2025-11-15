import { useState, useEffect } from 'react';
import { authService, User } from '../services/authService';

interface UseAuthResult {
  user: User | null;
  isLoading: boolean;
  loading: boolean; // Alias for isLoading
  isSignedIn: boolean;
  isAuthenticated: boolean; // Alias for isSignedIn
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  logout: () => Promise<void>; // Alias for signOut
  error: string | null;
}

/**
 * Custom hook for Firebase authentication
 * Required for Firestore access with security rules
 */
export const useAuth = (): UseAuthResult => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = authService.onAuthStateChange((authUser) => {
      setUser(authUser);
      setIsLoading(false);
      
      if (authUser) {
        console.log('👤 User authenticated:', authUser.email);
      } else {
        console.log('🚫 No authenticated user');
      }
    });

    return unsubscribe;
  }, []);

  const signIn = async () => {
    try {
      setError(null);
      setIsLoading(true);
      await authService.signInWithGoogle();
    } catch (err: any) {
      setError(err.message);
      console.error('Sign-in error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setError(null);
      await authService.signOutUser();
    } catch (err: any) {
      setError(err.message);
      console.error('Sign-out error:', err);
    }
  };

  const logout = signOut; // Alias

  return {
    user,
    isLoading,
    loading: isLoading, // Alias for compatibility
    isSignedIn: !!user,
    isAuthenticated: !!user, // Alias for compatibility
    signIn,
    signOut,
    logout, // Alias for compatibility
    error
  };
};

