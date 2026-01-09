import React, { useState } from 'react';
import { toast } from 'react-hot-toast';

const QuickAccessPage: React.FC = () => {
  const [shareToken, setShareToken] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAccessResult = () => {
    if (!shareToken.trim()) {
      toast.error('Please enter a valid share token');
      return;
    }

    setLoading(true);
    // Navigate to shared result page
    window.location.href = `/shared/${shareToken.trim()}`;
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      
      // Extract token from full URL if pasted
      const tokenMatch = text.match(/\/shared\/([a-zA-Z0-9_-]+)/);
      if (tokenMatch) {
        setShareToken(tokenMatch[1]);
        toast.success('Share token extracted from URL');
      } else if (text.match(/^[a-zA-Z0-9_-]+$/)) {
        setShareToken(text);
        toast.success('Share token pasted');
      } else {
        toast.error('Invalid format. Please paste a share token or URL.');
      }
    } catch (error) {
      toast.error('Failed to access clipboard');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">🔗</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Quick Access</h1>
          <p className="text-gray-600">Enter your share token to view invoice results</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Share Token or URL
            </label>
            <div className="relative">
              <input
                type="text"
                value={shareToken}
                onChange={(e) => setShareToken(e.target.value)}
                placeholder="Enter share token..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              <button
                onClick={handlePasteFromClipboard}
                className="absolute right-2 top-2 bottom-2 px-3 text-xs bg-gray-100 hover:bg-gray-200 rounded border border-gray-300"
              >
                Paste
              </button>
            </div>
          </div>

          <button
            onClick={handleAccessResult}
            disabled={loading || !shareToken.trim()}
            className="w-full bg-primary-500 text-white py-3 rounded-lg hover:bg-primary-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                <span>Accessing...</span>
              </div>
            ) : (
              'Access Result'
            )}
          </button>
        </div>

        <div className="mt-8 bg-gray-50 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-2">How it works:</h3>
          <ol className="text-sm text-gray-600 space-y-1">
            <li>1. Process invoices on the main website</li>
            <li>2. Get a share link after processing</li>
            <li>3. Open the link on any device</li>
            <li>4. Download results as needed</li>
          </ol>
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={() => window.location.href = '/'}
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            ← Back to App
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuickAccessPage;