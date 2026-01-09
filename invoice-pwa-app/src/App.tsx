import { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { pwaService } from './services/pwaService';
import { authService } from './services/auth';
import type { NetworkStatus } from './services/pwaService';
import { Toaster, toast } from 'react-hot-toast';
import MobileNavigation from './components/MobileNavigation';
import OfflineIndicator from './components/OfflineIndicator';
import InstallPrompt from './components/InstallPrompt';
import LoginScreen from './components/LoginScreen';
import Dashboard from './components/Dashboard';
import FileUpload from './components/FileUpload';
import Results from './components/Results';
import Settings from './components/Settings';

// Import Firebase config to initialize
import './config/firebase';

type TabType = 'dashboard' | 'upload' | 'results' | 'settings';

function App() {
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    isOnline: true,
    effectiveType: 'unknown',
    downlink: 0,
    rtt: 0
  });
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    // Initialize PWA service and setup network monitoring
    pwaService.onNetworkChange((status) => {
      setNetworkStatus(status);
      
      if (status.isOnline) {
        toast.success('Back online! Syncing data...', {
          icon: '🌐',
          duration: 3000
        });
      } else {
        toast.error('You are offline. Changes will be saved locally.', {
          icon: '📱',
          duration: 5000
        });
      }
    });

    // Setup authentication listener
    const unsubscribe = authService.onAuthStateChanged((user) => {
      setUser(user);
      setAuthLoading(false);
    });

    // Check if app can be installed
    setTimeout(() => {
      if (pwaService.canInstall() && !pwaService.isStandalone()) {
        setShowInstallPrompt(true);
      }
    }, 3000); // Show after 3 seconds

    // Initialize complete
    setIsLoading(false);

    return () => {
      unsubscribe();
    };
  }, []);

  const handleInstallApp = async () => {
    const installed = await pwaService.promptInstall();
    if (installed) {
      setShowInstallPrompt(false);
      toast.success('App installed successfully!', {
        icon: '📲',
        duration: 4000
      });
    }
  };

  const handleLogin = () => {
    // User state will be updated by the auth listener
    setCurrentTab('dashboard');
  };

  const handleLogout = async () => {
    try {
      await authService.signOut();
      toast.success('Signed out successfully');
      setCurrentTab('dashboard');
    } catch (error) {
      toast.error('Error signing out');
    }
  };

  const renderCurrentTab = () => {
    switch (currentTab) {
      case 'dashboard':
        return <Dashboard networkStatus={networkStatus} />;
      case 'upload':
        return <FileUpload networkStatus={networkStatus} />;
      case 'results':
        return <Results networkStatus={networkStatus} />;
      case 'settings':
        return <Settings networkStatus={networkStatus} onLogout={handleLogout} />;
      default:
        return <Dashboard networkStatus={networkStatus} />;
    }
  };

  if (isLoading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-700">Loading Invoice PWA...</h2>
          <p className="text-gray-500 mt-2">Setting up your mobile experience</p>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!user) {
    return (
      <>
        <LoginScreen onLogin={handleLogin} />
        <Toaster 
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
              fontSize: '14px',
            },
          }}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* PWA Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 safe-area-top">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">📄</span>
              </div>
              <h1 className="text-lg font-semibold text-gray-900">Invoice PWA</h1>
            </div>
            
            <div className="flex items-center space-x-2">
              {/* Network status indicator */}
              <div className={`w-2 h-2 rounded-full ${
                networkStatus.isOnline ? 'bg-green-500' : 'bg-red-500'
              }`}></div>
              
              {/* Connection quality indicator */}
              <span className="text-xs text-gray-500">
                {networkStatus.effectiveType}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full pb-16"> {/* Bottom padding for navigation */}
          {renderCurrentTab()}
        </div>
      </main>

      {/* Mobile Navigation */}
      <MobileNavigation 
        currentTab={currentTab} 
        onTabChange={setCurrentTab}
        networkStatus={networkStatus}
      />

      {/* Offline Indicator */}
      <OfflineIndicator isOnline={networkStatus.isOnline} />

      {/* Install Prompt */}
      {showInstallPrompt && (
        <InstallPrompt 
          onInstall={handleInstallApp}
          onDismiss={() => setShowInstallPrompt(false)}
        />
      )}

      {/* Toast Notifications */}
      <Toaster 
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
            fontSize: '14px',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />
    </div>
  );
}

export default App;
