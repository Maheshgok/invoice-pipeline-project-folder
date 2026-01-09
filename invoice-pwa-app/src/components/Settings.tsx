import React from 'react';
import type { NetworkStatus } from '../services/pwaService';
import { pwaService } from '../services/pwaService';
import { authService } from '../services/auth';

interface SettingsProps {
  networkStatus: NetworkStatus;
  onLogout: () => void;
}

const Settings: React.FC<SettingsProps> = ({ networkStatus, onLogout }) => {
  const user = authService.getCurrentUser();

  const handleClearCache = async () => {
    try {
      await pwaService.clearCache();
      alert('Cache cleared successfully!');
    } catch (error) {
      alert('Failed to clear cache');
    }
  };

  const handleRequestNotifications = async () => {
    try {
      const permission = await pwaService.requestNotificationPermission();
      alert(`Notification permission: ${permission}`);
    } catch (error) {
      alert('Failed to request notification permission');
    }
  };

  return (
    <div className="p-4 pb-20 space-y-6">
      {/* User Profile Section */}
      {user && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Profile</h2>
          
          <div className="flex items-center space-x-4 mb-4">
            {user.photoURL ? (
              <img 
                src={user.photoURL} 
                alt="Profile" 
                className="w-12 h-12 rounded-full"
              />
            ) : (
              <div className="w-12 h-12 bg-primary-500 rounded-full flex items-center justify-center">
                <span className="text-white font-semibold">
                  {user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
                </span>
              </div>
            )}
            
            <div>
              <h3 className="font-medium text-gray-900">
                {user.displayName || 'User'}
              </h3>
              <p className="text-sm text-gray-500">{user.email}</p>
            </div>
          </div>
        </div>
      )}

      {/* App Info */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-4">App Information</h3>
        
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Version</span>
            <span className="text-sm font-medium">1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Install Status</span>
            <span className="text-sm font-medium">
              {pwaService.isStandalone() ? 'Installed' : 'Browser'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Network</span>
            <span className="text-sm font-medium">
              {networkStatus.isOnline ? 'Online' : 'Offline'} ({networkStatus.effectiveType})
            </span>
          </div>
        </div>
      </div>

      {/* PWA Settings */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-4">PWA Settings</h3>
        
        <div className="space-y-4">
          <button
            onClick={handleRequestNotifications}
            className="w-full btn-touch flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center space-x-3">
              <span className="text-lg">🔔</span>
              <span className="text-sm font-medium">Enable Notifications</span>
            </div>
            <span className="text-xs text-gray-500">→</span>
          </button>
          
          <button
            onClick={handleClearCache}
            className="w-full btn-touch flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center space-x-3">
              <span className="text-lg">🗑️</span>
              <span className="text-sm font-medium">Clear Cache</span>
            </div>
            <span className="text-xs text-gray-500">→</span>
          </button>
          
          <button
            className="w-full btn-touch flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            disabled
          >
            <div className="flex items-center space-x-3">
              <span className="text-lg">🔄</span>
              <span className="text-sm font-medium">Background Sync</span>
            </div>
            <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
              Active
            </span>
          </button>
        </div>
      </div>

      {/* Account Settings */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-4">Account</h3>
        
        <div className="space-y-4">
          <button className="w-full btn-touch flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
            <div className="flex items-center space-x-3">
              <span className="text-lg">👤</span>
              <span className="text-sm font-medium">Profile Settings</span>
            </div>
            <span className="text-xs text-gray-500">→</span>
          </button>
          
          <button 
            onClick={onLogout}
            className="w-full btn-touch flex items-center justify-between p-3 bg-red-50 rounded-lg hover:bg-red-100 transition-colors text-red-600"
          >
            <div className="flex items-center space-x-3">
              <span className="text-lg">🔐</span>
              <span className="text-sm font-medium">Security</span>
            </div>
            <span className="text-xs text-gray-500">→</span>
          </button>
          
          <button 
            onClick={onLogout}
            className="w-full btn-touch flex items-center justify-between p-3 bg-red-50 rounded-lg hover:bg-red-100 transition-colors text-red-600"
          >
            <div className="flex items-center space-x-3">
              <span className="text-lg">🚪</span>
              <span className="text-sm font-medium">Sign Out</span>
            </div>
            <span className="text-xs text-red-500">→</span>
          </button>
        </div>
      </div>

      {/* Debug Info (Development only) */}
      {import.meta.env.DEV && (
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <h3 className="font-semibold text-gray-700 mb-4">Debug Info</h3>
          <pre className="text-xs text-gray-600 overflow-auto">
            {JSON.stringify(networkStatus, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default Settings;