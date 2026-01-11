import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { authService } from '../services/auth';

interface LoginScreenProps {
  onLogin: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const user = await authService.signInWithGoogle();
      if (user) {
        toast.success(`Welcome, ${user.displayName || 'User'}!`);
        onLogin();
      } else {
        // For mobile redirect flow, user will be null initially
        // The auth state change will be handled by the main App component
        toast.loading('Redirecting to Google...', { duration: 2000 });
      }
    } catch (error: any) {
      console.error('Login error:', error);
      toast.error(error.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">📄</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invoice PWA</h1>
          <p className="text-gray-600">AI-powered invoice processing</p>
        </div>

        {/* Features */}
        <div className="space-y-3 mb-8">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="text-green-600 text-sm">✓</span>
            </div>
            <span className="text-sm text-gray-700">Smart OCR & AI Processing</span>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-blue-600 text-sm">⚡</span>
            </div>
            <span className="text-sm text-gray-700">Real-time Results</span>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
              <span className="text-purple-600 text-sm">📱</span>
            </div>
            <span className="text-sm text-gray-700">Mobile-First PWA</span>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
              <span className="text-orange-600 text-sm">🔒</span>
            </div>
            <span className="text-sm text-gray-700">Secure & Private</span>
          </div>
        </div>

        {/* Login Button */}
        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full bg-white border-2 border-gray-200 rounded-lg p-4 flex items-center justify-center space-x-3 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              <span className="font-medium text-gray-700">Signing in...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span className="font-medium text-gray-700">Continue with Google</span>
            </>
          )}
        </button>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-xs text-gray-500">
            By continuing, you agree to our Terms of Service
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;