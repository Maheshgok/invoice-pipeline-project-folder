import React from 'react';
import type { NetworkStatus } from '../services/pwaService';

interface DashboardProps {
  networkStatus: NetworkStatus;
}

const Dashboard: React.FC<DashboardProps> = ({ networkStatus }) => {
  const stats = [
    {
      label: 'Processed Today',
      value: '12',
      icon: '📄',
      change: '+3 from yesterday'
    },
    {
      label: 'Total This Month',
      value: '248',
      icon: '📊',
      change: '+15% from last month'
    },
    {
      label: 'Success Rate',
      value: '98.5%',
      icon: '✅',
      change: 'Excellent performance'
    }
  ];

  const recentActivity = [
    {
      id: 1,
      type: 'upload',
      filename: 'invoice-2024-001.pdf',
      status: 'completed',
      time: '2 minutes ago'
    },
    {
      id: 2,
      type: 'processing',
      filename: 'receipt-mobile-scan.jpg',
      status: 'processing',
      time: '5 minutes ago'
    },
    {
      id: 3,
      type: 'completed',
      filename: 'expense-report-Q4.pdf',
      status: 'completed',
      time: '1 hour ago'
    }
  ];

  return (
    <div className="p-4 pb-20 space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-primary-500 to-primary-600 rounded-2xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">Welcome Back!</h2>
        <p className="opacity-90 text-sm">
          {networkStatus.isOnline 
            ? 'Your invoices are syncing in real-time' 
            : 'Working offline - changes will sync when connected'
          }
        </p>
        
        {/* Network status indicator */}
        <div className="flex items-center mt-4 space-x-2">
          <div className={`w-3 h-3 rounded-full ${
            networkStatus.isOnline ? 'bg-green-400' : 'bg-yellow-400'
          }`}></div>
          <span className="text-sm opacity-90">
            {networkStatus.isOnline ? 'Online' : 'Offline'} • {networkStatus.effectiveType}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">{stat.icon}</span>
              <span className="text-2xl font-bold text-gray-900">{stat.value}</span>
            </div>
            <h3 className="font-medium text-gray-900 mb-1">{stat.label}</h3>
            <p className="text-xs text-gray-500">{stat.change}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-4">Quick Actions</h3>
        
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={() => window.location.href = '/quick-access'}
            className="btn-touch flex flex-col items-center justify-center p-4 bg-blue-50 rounded-xl border border-blue-100 hover:bg-blue-100 transition-colors"
          >
            <span className="text-2xl mb-2">🔗</span>
            <span className="text-sm font-medium text-blue-700">Quick Access</span>
          </button>
          
          <button className="btn-touch flex flex-col items-center justify-center p-4 bg-primary-50 rounded-xl border border-primary-100 hover:bg-primary-100 transition-colors">
            <span className="text-2xl mb-2">📸</span>
            <span className="text-sm font-medium text-primary-700">Scan Invoice</span>
          </button>
          
          <button className="btn-touch flex flex-col items-center justify-center p-4 bg-secondary-50 rounded-xl border border-secondary-100 hover:bg-secondary-100 transition-colors">
            <span className="text-2xl mb-2">📁</span>
            <span className="text-sm font-medium text-secondary-700">Browse Files</span>
          </button>
          
          <button className="btn-touch flex flex-col items-center justify-center p-4 bg-green-50 rounded-xl border border-green-100 hover:bg-green-100 transition-colors">
            <span className="text-2xl mb-2">📊</span>
            <span className="text-sm font-medium text-green-700">View Reports</span>
          </button>
          
          <button className="btn-touch flex flex-col items-center justify-center p-4 bg-purple-50 rounded-xl border border-purple-100 hover:bg-purple-100 transition-colors">
            <span className="text-2xl mb-2">⚡</span>
            <span className="text-sm font-medium text-purple-700">Bulk Process</span>
          </button>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Recent Activity</h3>
          <button className="text-primary-500 text-sm font-medium">View All</button>
        </div>
        
        <div className="space-y-3">
          {recentActivity.map((item) => (
            <div key={item.id} className="flex items-center space-x-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                item.status === 'completed' ? 'bg-green-100 text-green-600' :
                item.status === 'processing' ? 'bg-yellow-100 text-yellow-600' :
                'bg-gray-100 text-gray-600'
              }`}>
                {item.status === 'completed' ? '✓' : 
                 item.status === 'processing' ? '⏳' : '📄'}
              </div>
              
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {item.filename}
                </p>
                <p className="text-xs text-gray-500">{item.time}</p>
              </div>
              
              <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                item.status === 'completed' ? 'bg-green-100 text-green-700' :
                item.status === 'processing' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {item.status}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PWA Features */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-4">PWA Features</h3>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-lg">📱</span>
              <span className="text-sm font-medium">Offline Mode</span>
            </div>
            <div className={`w-3 h-3 rounded-full ${
              networkStatus.isOnline ? 'bg-green-400' : 'bg-yellow-400'
            }`}></div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-lg">🔄</span>
              <span className="text-sm font-medium">Background Sync</span>
            </div>
            <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
              Active
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-lg">🔔</span>
              <span className="text-sm font-medium">Push Notifications</span>
            </div>
            <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
              Available
            </span>
          </div>
        </div>
      </div>

      {/* Cross-Device Access Info */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
        <div className="flex items-start space-x-3">
          <span className="text-2xl">📱💻</span>
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 mb-2">Cross-Device Access</h3>
            <p className="text-sm text-blue-700 mb-3">
              Process invoices on your computer and access results anywhere!
            </p>
            <div className="text-xs text-blue-600 space-y-1">
              <div>• Upload on main website → Get shareable link</div>
              <div>• Access results on mobile → Download data</div>
              <div>• Results stored for 7 days automatically</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;