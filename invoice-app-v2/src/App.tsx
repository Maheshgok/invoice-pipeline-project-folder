import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import { PermissionProvider } from './contexts/PermissionContext'
import MultiUploadDashboard from './pages/MultiUploadDashboard'
import Login from './pages/Login'
import WorkspaceSetup from './pages/WorkspaceSetup'
import OnboardingFlow from './components/onboarding/OnboardingFlow'
import PaymentManagementDashboard from './components/admin/PaymentManagementDashboard'
import ProtectedRoute from './components/auth/ProtectedRoute'

function App() {
  return (
    <AuthProvider>
      <PermissionProvider>
        <Router>
          <div className="min-h-screen bg-gray-50">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route 
                path="/workspace-setup" 
                element={
                  <ProtectedRoute requirePayment={false}>
                    <WorkspaceSetup />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/onboarding" 
                element={
                  <ProtectedRoute requirePayment={false}>
                    <OnboardingFlow />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/admin/payments" 
                element={
                  <ProtectedRoute 
                    requirePayment={false}
                    requiredPermission={{ action: 'manage', subject: 'payments' }}
                  >
                    <PaymentManagementDashboard />
                  </ProtectedRoute>
                } 
              />
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <MultiUploadDashboard />
                  </ProtectedRoute>
                }
              />
            </Routes>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
                borderRadius: '10px',
                padding: '16px',
              },
              success: {
                style: {
                  background: '#10B981',
                },
              },
              error: {
                style: {
                  background: '#EF4444',
                },
              },
            }}
          />
        </div>
      </Router>
    </PermissionProvider>
  </AuthProvider>
  )
}

export default App
