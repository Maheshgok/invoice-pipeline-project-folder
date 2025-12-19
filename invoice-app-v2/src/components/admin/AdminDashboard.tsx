import React, { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { userService, type UserProfile, type UserInvite, type Organization } from '../../services/userService'
import { Users, UserPlus, Settings, Shield, AlertCircle, CheckCircle, Clock, X } from 'lucide-react'
import toast from 'react-hot-toast'

export const AdminDashboard: React.FC = () => {
  const { userProfile, hasPermission } = useAuth()
  const [activeTab, setActiveTab] = useState<'users' | 'invites' | 'organization'>('users')
  const [users, setUsers] = useState<UserProfile[]>([])
  const [invites, setInvites] = useState<UserInvite[]>([])
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'user' as 'org_admin' | 'user' | 'viewer',
    message: ''
  })

  // Check if user has admin permissions
  const isAdmin = hasPermission('canManageOrgUsers')

  useEffect(() => {
    if (!isAdmin) return
    
    loadAdminData()
  }, [isAdmin])

  const loadAdminData = async () => {
    try {
      setLoading(true)
      
      // Load organization users
      const orgUsers = await userService.getOrganizationUsers()
      setUsers(orgUsers)
      
      // Load organization info
      const org = await userService.getOrganization()
      setOrganization(org)
      
      console.log('✅ Admin data loaded:', {
        users: orgUsers.length,
        organization: org?.name
      })
    } catch (error) {
      console.error('❌ Error loading admin data:', error)
      toast.error('Failed to load admin data')
    } finally {
      setLoading(false)
    }
  }

  const handleInviteUser = async () => {
    try {
      if (!inviteForm.email) {
        toast.error('Email is required')
        return
      }

      await userService.inviteUser(inviteForm.email, inviteForm.role, inviteForm.message)
      
      toast.success(`Invitation sent to ${inviteForm.email}`)
      setShowInviteModal(false)
      setInviteForm({ email: '', role: 'user', message: '' })
      
      // Reload data
      await loadAdminData()
    } catch (error: any) {
      console.error('❌ Error inviting user:', error)
      toast.error(error.message || 'Failed to send invitation')
    }
  }

  const handleUpdateUserRole = async (userId: string, newRole: UserProfile['organizationRole']) => {
    try {
      const permissions = userService.getPermissionsForRole(newRole)
      await userService.updateUserPermissions(userId, permissions)
      
      toast.success('User permissions updated')
      await loadAdminData()
    } catch (error: any) {
      console.error('❌ Error updating user role:', error)
      toast.error(error.message || 'Failed to update user role')
    }
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Access Denied
          </h3>
          <p className="text-gray-600">
            You don't have permission to access the admin dashboard.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading admin dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-gray-600">{organization?.name}</p>
            </div>
            <button
              onClick={() => setShowInviteModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Invite User
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { id: 'users', label: 'Users', icon: Users, count: users.length },
              { id: 'organization', label: 'Organization', icon: Settings }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`
                  flex items-center py-2 px-1 border-b-2 font-medium text-sm
                  ${activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <tab.icon className="h-4 w-4 mr-2" />
                {tab.label}
                {tab.count !== undefined && (
                  <span className="ml-2 bg-gray-100 text-gray-900 py-0.5 px-2 rounded-full text-xs">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === 'users' && (
            <UsersTab 
              users={users}
              onUpdateUserRole={handleUpdateUserRole}
              onReloadData={loadAdminData}
            />
          )}
          
          {activeTab === 'organization' && (
            <OrganizationTab 
              organization={organization}
              onUpdate={loadAdminData}
            />
          )}
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Invite User</h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="user@example.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as any })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="user">User</option>
                  <option value="org_admin">Organization Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Message (Optional)
                </label>
                <textarea
                  value={inviteForm.message}
                  onChange={(e) => setInviteForm({ ...inviteForm, message: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Welcome to our organization..."
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowInviteModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleInviteUser}
                className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700"
              >
                Send Invitation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Users Tab Component
interface UsersTabProps {
  users: UserProfile[]
  onUpdateUserRole: (userId: string, role: UserProfile['organizationRole']) => void
  onReloadData: () => void
}

const UsersTab: React.FC<UsersTabProps> = ({ users, onUpdateUserRole, onReloadData }) => {
  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 text-purple-800'
      case 'member': return 'bg-blue-100 text-blue-800'
      case 'viewer': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (isActive: boolean) => {
    return isActive ? (
      <CheckCircle className="h-4 w-4 text-green-500" />
    ) : (
      <AlertCircle className="h-4 w-4 text-red-500" />
    )
  }

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-md">
      <ul className="divide-y divide-gray-200">
        {users.map((user) => (
          <li key={user.uid} className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  {user.photoURL ? (
                    <img className="h-8 w-8 rounded-full" src={user.photoURL} alt="" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center">
                      <span className="text-sm font-medium text-gray-700">
                        {user.displayName?.[0] || user.email[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="ml-4">
                  <div className="flex items-center">
                    <p className="text-sm font-medium text-gray-900">
                      {user.displayName || 'No name'}
                    </p>
                    <div className="ml-2">
                      {getStatusIcon(user.isActive)}
                    </div>
                  </div>
                  <p className="text-sm text-gray-500">{user.email}</p>
                  <div className="flex items-center mt-1">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(user.organizationRole)}`}>
                      {user.organizationRole}
                    </span>
                    <span className="ml-2 text-xs text-gray-500">
                      Last login: {user.lastLoginAt?.toDate?.()?.toLocaleDateString() || 'Never'}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <select
                  value={user.organizationRole}
                  onChange={(e) => onUpdateUserRole(user.uid, e.target.value as UserProfile['organizationRole'])}
                  className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>
          </li>
        ))}
      </ul>
      
      {users.length === 0 && (
        <div className="px-6 py-12 text-center">
          <Users className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No users found</h3>
          <p className="mt-1 text-sm text-gray-500">
            Start by inviting users to your organization.
          </p>
        </div>
      )}
    </div>
  )
}

// Organization Tab Component
interface OrganizationTabProps {
  organization: Organization | null
  onUpdate: () => void
}

const OrganizationTab: React.FC<OrganizationTabProps> = ({ organization }) => {
  if (!organization) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">Organization not found</h3>
        <p className="mt-1 text-sm text-gray-500">Unable to load organization information.</p>
      </div>
    )
  }

  const getPlanBadgeColor = (plan: string) => {
    switch (plan) {
      case 'enterprise': return 'bg-purple-100 text-purple-800'
      case 'pro': return 'bg-blue-100 text-blue-800'
      case 'basic': return 'bg-green-100 text-green-800'
      case 'free': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-6">
      {/* Organization Info */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Organization Information
          </h3>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-500">Name</dt>
              <dd className="mt-1 text-sm text-gray-900">{organization.name}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Domain</dt>
              <dd className="mt-1 text-sm text-gray-900">{organization.domain || 'Not set'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Members</dt>
              <dd className="mt-1 text-sm text-gray-900">{organization.memberCount}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Created</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {organization.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Subscription Info */}
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Subscription Details
          </h3>
          <div className="flex items-center justify-between mb-4">
            <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${getPlanBadgeColor(organization.subscription.plan)}`}>
              {organization.subscription.plan.toUpperCase()}
            </span>
            <span className="text-sm text-gray-500">
              Status: {organization.subscription.status}
            </span>
          </div>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-500">Max Users</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {organization.memberCount} / {organization.subscription.limits.maxUsers}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Monthly Uploads</dt>
              <dd className="mt-1 text-sm text-gray-900">
                0 / {organization.subscription.limits.maxUploadsPerMonth}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Storage</dt>
              <dd className="mt-1 text-sm text-gray-900">
                0 GB / {organization.subscription.limits.maxStorageGB} GB
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">API Calls</dt>
              <dd className="mt-1 text-sm text-gray-900">
                0 / {organization.subscription.limits.apiCallsPerMonth}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}

export default AdminDashboard