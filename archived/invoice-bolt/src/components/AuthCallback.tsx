import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

/**
 * AuthCallback component - Simplified for Firebase Auth (popup-based)
 * Since we use Firebase popup auth, this mainly handles any legacy redirects
 */
const AuthCallback: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // For Firebase popup auth, just redirect to home
    console.log('🔄 Auth callback triggered, redirecting to home...');
    navigate('/', { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full mx-4">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Processing Authentication
          </h2>
          <p className="text-gray-600">
            Redirecting you to the application...
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;