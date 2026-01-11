import React from 'react';

interface InstallPromptProps {
  onInstall: () => void;
  onDismiss: () => void;
}

const InstallPrompt: React.FC<InstallPromptProps> = ({ onInstall, onDismiss }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-t-2xl p-6 w-full max-w-md animate-slide-up safe-area-bottom">
        <div className="text-center">
          <div className="w-16 h-16 bg-primary-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📲</span>
          </div>
          
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            Install Invoice PWA
          </h3>
          
          <p className="text-gray-600 mb-6">
            Install our app for a better experience with offline access, push notifications, and faster loading.
          </p>
          
          <div className="flex space-x-3">
            <button
              onClick={onDismiss}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              Maybe Later
            </button>
            
            <button
              onClick={onInstall}
              className="flex-1 px-4 py-3 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 transition-colors"
            >
              Install App
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstallPrompt;