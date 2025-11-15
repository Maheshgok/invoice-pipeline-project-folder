import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, RefreshCw, Copy, Check } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { auth } from '../config/firebase';

const TokenDebugPanel: React.FC = () => {
  const [showTokens, setShowTokens] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<any>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const { user } = useAuth();

  const refreshTokenInfo = async () => {
    // Use Firebase auth currentUser directly instead of extended user object
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setTokenInfo(null);
      return;
    }
    
    try {
      const idToken = await currentUser.getIdToken();
      const info = {
        user: {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL
        },
        idToken: idToken,
        tokenExpiration: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
        tokenType: 'Firebase ID Token'
      };
      setTokenInfo(info);
    } catch (error) {
      console.error('Failed to get token info:', error);
      setTokenInfo(null);
    }
  };

  useEffect(() => {
    refreshTokenInfo();
    // Refresh token info every 30 seconds
    const interval = setInterval(refreshTokenInfo, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const truncateToken = (token: string, showFull: boolean = false) => {
    if (showFull) return token;
    return `${token.substring(0, 20)}...${token.substring(token.length - 10)}`;
  };

  if (!tokenInfo) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-800">No Firebase authentication found</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Firebase Authentication</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTokens(!showTokens)}
            className="flex items-center gap-2 text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-md transition-colors"
          >
            {showTokens ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showTokens ? 'Hide' : 'Show'} Token
          </button>
          <button
            onClick={refreshTokenInfo}
            className="flex items-center gap-2 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded-md transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">User Email</span>
            <span className="text-sm text-gray-800">{tokenInfo.user.email}</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">User ID</span>
            <span className="text-sm font-mono text-gray-600">{tokenInfo.user.uid}</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">ID Token</span>
            <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">Available</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">Token Type</span>
            <span className="text-sm text-gray-800">{tokenInfo.tokenType}</span>
          </div>
        </div>
      </div>

      {showTokens && (
        <div className="space-y-4 border-t pt-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-yellow-800 text-sm font-medium mb-1">⚠️ Security Warning</p>
            <p className="text-yellow-700 text-xs">
              This token provides access to your Firebase account. Never share it publicly.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Firebase ID Token</label>
              <button
                onClick={() => copyToClipboard(tokenInfo.idToken, 'firebase')}
                className="flex items-center gap-1 text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded transition-colors"
              >
                {copiedField === 'firebase' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copiedField === 'firebase' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="bg-gray-100 rounded p-2 font-mono text-xs break-all">
              {truncateToken(tokenInfo.idToken, showTokens)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TokenDebugPanel;