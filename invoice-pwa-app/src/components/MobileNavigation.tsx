import React from 'react';
import type { NetworkStatus } from '../services/pwaService';

type TabType = 'dashboard' | 'upload' | 'results' | 'settings';

interface MobileNavigationProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  networkStatus: NetworkStatus;
}

const MobileNavigation: React.FC<MobileNavigationProps> = ({
  currentTab,
  onTabChange,
  networkStatus
}) => {
  const tabs = [
    {
      id: 'dashboard' as const,
      name: 'Dashboard',
      icon: '🏠',
      activeIcon: '🏠',
    },
    {
      id: 'upload' as const,
      name: 'Upload',
      icon: '📤',
      activeIcon: '📤',
    },
    {
      id: 'results' as const,
      name: 'Results',
      icon: '📊',
      activeIcon: '📊',
    },
    {
      id: 'settings' as const,
      name: 'Settings',
      icon: '⚙️',
      activeIcon: '⚙️',
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-bottom z-50">
      <div className="flex items-center justify-around px-2 py-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`btn-touch flex flex-col items-center justify-center px-3 py-2 rounded-lg transition-all duration-200 ${
              currentTab === tab.id
                ? 'bg-primary-50 text-primary-600'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
            disabled={!networkStatus.isOnline && (tab.id === 'upload' || tab.id === 'results')}
          >
            <span className="text-lg mb-1">
              {currentTab === tab.id ? tab.activeIcon : tab.icon}
            </span>
            <span className="text-xs font-medium">
              {tab.name}
            </span>
            
            {/* Offline indicator for network-dependent tabs */}
            {!networkStatus.isOnline && (tab.id === 'upload' || tab.id === 'results') && (
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></div>
            )}
          </button>
        ))}
      </div>
      
      {/* Network status bar */}
      {!networkStatus.isOnline && (
        <div className="bg-red-500 text-white text-center py-1">
          <span className="text-xs font-medium">Offline Mode</span>
        </div>
      )}
    </nav>
  );
};

export default MobileNavigation;