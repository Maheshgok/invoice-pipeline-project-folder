import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Loader2, AlertTriangle, Clock, CreditCard } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
  requirePayment?: boolean
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requirePayment = true 
}) => {
  const { user, userProfile, loading } = useAuth()
  const location = useLocation()

  // Show loading while auth state is being determined
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // If payment is not required (like for admin pages), allow access
  if (!requirePayment) {
    return <>{children}</>
  }

  // If user profile is still loading, show loading
  if (!userProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-gray-600">Loading profile...</p>
        </div>
      </div>
    )
  }

  // Handle different payment statuses
  const paymentStatus = userProfile.paymentStatus?.status

  switch (paymentStatus) {
    case 'pending':
    case 'paid':
      // Redirect to onboarding for payment completion/verification
      return <Navigate to="/onboarding" replace />
    
    case 'verified':
    case 'free_trial':
      // Check if subscription has expired
      const expiresAt = userProfile.paymentStatus?.expiresAt
      if (expiresAt && expiresAt.toDate() < new Date()) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md mx-auto text-center p-6 bg-white rounded-lg shadow-sm border border-red-200">
              <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Subscription Expired</h2>
              <p className="text-gray-600 mb-6">
                Your subscription has expired. Please renew to continue using the service.
              </p>
              <button
                onClick={() => window.location.href = '/onboarding'}
                className="bg-red-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-red-700 transition-colors"
              >
                Renew Subscription
              </button>
            </div>
          </div>
        )
      }
      // Allow access if verified and not expired
      return <>{children}</>
    
    case 'expired':
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md mx-auto text-center p-6 bg-white rounded-lg shadow-sm border border-red-200">
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Payment Expired</h2>
            <p className="text-gray-600 mb-6">
              Your payment period has expired. Please make a new payment to continue.
            </p>
            <button
              onClick={() => window.location.href = '/onboarding'}
              className="bg-red-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-red-700 transition-colors"
            >
              Make Payment
            </button>
          </div>
        </div>
      )

    default:
      // If no payment status is found, redirect to onboarding
      return <Navigate to="/onboarding" replace />
  }
}

export default ProtectedRoute