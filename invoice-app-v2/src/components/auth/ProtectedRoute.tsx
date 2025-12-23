import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionContext'
import { Loader2, AlertTriangle } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
  requirePayment?: boolean
  requiredPermission?: {
    action: string
    subject: string
    resource?: any
  }
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requirePayment = true,
  requiredPermission
}) => {
  const { user, userProfile, loading } = useAuth()
  const location = useLocation()

  // Try to get permissions, but handle case where provider isn't available yet
  let permissions: { can: (action: string, subject: string, resource?: any) => boolean } | null = null
  try {
    permissions = usePermissions()
  } catch (error) {
    // Permission context not available yet, will check permissions later
  }

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

  // Check required permission if specified
  if (requiredPermission && permissions) {
    const { action, subject, resource } = requiredPermission
    if (!permissions.can(action, subject, resource)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full bg-white rounded-lg shadow p-6 text-center">
            <div className="text-red-500 text-5xl mb-4">🚫</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-4">
              You don't have permission to access this feature.
            </p>
            <button
              onClick={() => window.history.back()}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Go Back
            </button>
          </div>
        </div>
      )
    }
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

  // TEMPORARY: Allow existing users without payment status to access the app
  // TODO: Remove this after all users have been migrated to the new payment system
  if (!userProfile.paymentStatus) {
    console.warn('User without payment status detected, allowing access temporarily:', user.email)
    return <>{children}</>
  }

  switch (paymentStatus) {
    case 'pending':
    case 'paid':
      // Only redirect to onboarding if we're not already there
      if (location.pathname !== '/onboarding') {
        return <Navigate to="/onboarding" replace />
      }
      // If already on onboarding, show the page
      return <>{children}</>
    
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
      // If no payment status is found, redirect to onboarding (only if not already there)
      if (location.pathname !== '/onboarding') {
        return <Navigate to="/onboarding" replace />
      }
      // If already on onboarding, allow access
      return <>{children}</>
  }
}

export default ProtectedRoute