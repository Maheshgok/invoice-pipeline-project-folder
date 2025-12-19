import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  serverTimestamp,
  Timestamp,
  writeBatch
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { authService } from './auth'
import type { User } from '../types/auth'

export interface UserProfile {
  uid: string
  email: string
  displayName: string | null
  photoURL: string | null
  role: 'super_admin' | 'org_admin' | 'user' | 'viewer'
  organizationId: string
  organizationRole: 'admin' | 'member' | 'viewer'
  permissions: UserPermissions
  department?: string
  createdAt: Timestamp
  updatedAt: Timestamp
  lastLoginAt: Timestamp
  isActive: boolean
  preferences: UserPreferences
  usage: UserUsageStats
  invitedBy?: string  // UID of admin who invited this user
  inviteStatus: 'pending' | 'accepted' | 'rejected'
}

export interface Organization {
  id: string
  name: string
  domain?: string  // Email domain for auto-assignment
  description?: string
  settings: OrganizationSettings
  subscription: SubscriptionDetails
  createdAt: Timestamp
  updatedAt: Timestamp
  ownerId: string
  isActive: boolean
  memberCount: number
  adminIds: string[]
}

export interface OrganizationSettings {
  allowSelfSignup: boolean
  requireAdminApproval: boolean
  dataRetentionDays: number
  maxUsersAllowed: number
  enableDepartments: boolean
  allowedDomains: string[]
}

export interface SubscriptionDetails {
  plan: 'free' | 'basic' | 'pro' | 'enterprise'
  status: 'active' | 'trial' | 'expired' | 'cancelled'
  startDate: Timestamp
  endDate?: Timestamp
  features: string[]
  limits: {
    maxUsers: number
    maxUploadsPerMonth: number
    maxStorageGB: number
    apiCallsPerMonth: number
  }
}

export interface UserInvite {
  id: string
  organizationId: string
  email: string
  role: 'org_admin' | 'user' | 'viewer'
  invitedBy: string
  invitedAt: Timestamp
  expiresAt: Timestamp
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  message?: string
}

export interface UserPermissions {
  canUpload: boolean
  canEdit: boolean
  canDelete: boolean
  canDownload: boolean
  canViewOwnData: boolean
  canViewOrgData: boolean  // Organization-wide data access
  canManageOrgUsers: boolean  // Manage users within organization
  canInviteUsers: boolean
  canConfigureOrg: boolean  // Organization settings
  maxFilesPerDay: number
  maxFileSize: number // in MB
  canAccessApi: boolean
  canExportData: boolean
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto'
  language: string
  timezone: string
  emailNotifications: boolean
  autoSave: boolean
  defaultCurrency: string
}

export interface UserUsageStats {
  totalUploads: number
  totalProcessed: number
  storageUsed: number // in MB
  lastUpload?: Timestamp
  uploadsToday: number
  uploadsThisMonth: number
}

// Default permissions for different organization roles
const ORG_ADMIN_PERMISSIONS: UserPermissions = {
  canUpload: true,
  canEdit: true,
  canDelete: true,
  canDownload: true,
  canViewOwnData: true,
  canViewOrgData: true,
  canManageOrgUsers: true,
  canInviteUsers: true,
  canConfigureOrg: true,
  maxFilesPerDay: 500,
  maxFileSize: 50,
  canAccessApi: true,
  canExportData: true
}

const DEFAULT_USER_PERMISSIONS: UserPermissions = {
  canUpload: true,
  canEdit: true,
  canDelete: true,
  canDownload: true,
  canViewOwnData: true,
  canViewOrgData: false,
  canManageOrgUsers: false,
  canInviteUsers: false,
  canConfigureOrg: false,
  maxFilesPerDay: 100,
  maxFileSize: 10,
  canAccessApi: false,
  canExportData: true
}

const VIEWER_PERMISSIONS: UserPermissions = {
  canUpload: false,
  canEdit: false,
  canDelete: false,
  canDownload: true,
  canViewOwnData: true,
  canViewOrgData: false,
  canManageOrgUsers: false,
  canInviteUsers: false,
  canConfigureOrg: false,
  maxFilesPerDay: 0,
  maxFileSize: 0,
  canAccessApi: false,
  canExportData: false
}

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'auto',
  language: 'en',
  timezone: 'UTC',
  emailNotifications: true,
  autoSave: true,
  defaultCurrency: 'INR'
}

const DEFAULT_USAGE: UserUsageStats = {
  totalUploads: 0,
  totalProcessed: 0,
  storageUsed: 0,
  uploadsToday: 0,
  uploadsThisMonth: 0
}

export class UserService {
  /**
   * Get permissions for a specific role
   */
  getPermissionsForRole(role: UserProfile['organizationRole']): UserPermissions {
    switch (role) {
      case 'admin':
        return ORG_ADMIN_PERMISSIONS
      case 'viewer':
        return VIEWER_PERMISSIONS
      case 'member':
      default:
        return DEFAULT_USER_PERMISSIONS
    }
  }

  /**
   * Determine organization ID for a user based on email domain or invite
   */
  async determineOrganizationId(email: string): Promise<string> {
    try {
      // First check for pending invites
      const invitesRef = collection(db, 'user_invites')
      const inviteQuery = query(invitesRef, 
        where('email', '==', email),
        where('status', '==', 'pending')
      )
      const inviteSnapshot = await getDocs(inviteQuery)
      
      if (!inviteSnapshot.empty) {
        const invite = inviteSnapshot.docs[0].data() as UserInvite
        return invite.organizationId
      }

      // Check for domain-based auto-assignment
      const domain = email.split('@')[1]
      const orgsRef = collection(db, 'organizations')
      const orgQuery = query(orgsRef, 
        where('settings.allowedDomains', 'array-contains', domain)
      )
      const orgSnapshot = await getDocs(orgQuery)
      
      if (!orgSnapshot.empty) {
        return orgSnapshot.docs[0].id
      }

      // Create default organization for new user
      return await this.createDefaultOrganization(email)
    } catch (error) {
      console.error('❌ Error determining organization:', error)
      // Fallback: Create a simple organization ID based on email domain
      const domain = email.split('@')[1].replace(/\./g, '-')
      const fallbackOrgId = `org-${domain}-${Date.now()}`
      console.log(`🔄 Using fallback organization ID: ${fallbackOrgId}`)
      
      try {
        // Try to create the fallback organization
        return await this.createDefaultOrganization(email)
      } catch (createError) {
        console.error('❌ Failed to create organization, using fallback ID:', createError)
        return fallbackOrgId
      }
    }
  }

  /**
   * Create a default organization for new user
   */
  async createDefaultOrganization(ownerEmail: string): Promise<string> {
    const orgRef = doc(collection(db, 'organizations'))
    const domain = ownerEmail.split('@')[1]
    
    const organization: Organization = {
      id: orgRef.id,
      name: `${domain} Organization`,
      domain,
      description: 'Auto-created organization',
      settings: {
        allowSelfSignup: false,
        requireAdminApproval: false,
        dataRetentionDays: 90,
        maxUsersAllowed: 10,
        enableDepartments: false,
        allowedDomains: [domain]
      },
      subscription: {
        plan: 'free',
        status: 'trial',
        startDate: serverTimestamp() as Timestamp,
        features: ['basic_processing', 'document_viewer'],
        limits: {
          maxUsers: 5,
          maxUploadsPerMonth: 100,
          maxStorageGB: 1,
          apiCallsPerMonth: 1000
        }
      },
      createdAt: serverTimestamp() as Timestamp,
      updatedAt: serverTimestamp() as Timestamp,
      ownerId: '', // Will be updated when user is created
      isActive: true,
      memberCount: 1,
      adminIds: []
    }

    await setDoc(orgRef, organization)
    return orgRef.id
  }
  /**
   * Get current user's UID for data isolation
   */
  getCurrentUserUID(): string | null {
    const user = authService.getCurrentUser()
    return user?.uid || null
  }

  /**
   * Get current user's email for legacy compatibility
   */
  getCurrentUserEmail(): string | null {
    const user = authService.getCurrentUser()
    return user?.email || null
  }

  /**
   * Create or update user profile on login
   */
  async createOrUpdateUserProfile(user: User): Promise<UserProfile> {
    try {
      const userRef = doc(db, 'users', user.uid)
      const userDoc = await getDoc(userRef)
      
      if (userDoc.exists()) {
        // Update existing user
        const existingProfile = userDoc.data() as UserProfile
        const updatedProfile: Partial<UserProfile> = {
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          lastLoginAt: serverTimestamp() as Timestamp,
          updatedAt: serverTimestamp() as Timestamp
        }
        
        await updateDoc(userRef, updatedProfile)
        
        return {
          ...existingProfile,
          ...updatedProfile,
          lastLoginAt: new Date() as any,
          updatedAt: new Date() as any
        }
      } else {
        // Create new user profile
        const organizationId = await this.determineOrganizationId(user.email)
        
        const newProfile: UserProfile = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          role: 'user', // Default role
          organizationId,
          organizationRole: 'member',
          permissions: this.getPermissionsForRole('member'),
          createdAt: serverTimestamp() as Timestamp,
          updatedAt: serverTimestamp() as Timestamp,
          lastLoginAt: serverTimestamp() as Timestamp,
          isActive: true,
          preferences: DEFAULT_PREFERENCES,
          usage: DEFAULT_USAGE,
          inviteStatus: 'accepted'
        }
        
        await setDoc(userRef, newProfile)
        
        return {
          ...newProfile,
          createdAt: new Date() as any,
          updatedAt: new Date() as any,
          lastLoginAt: new Date() as any
        }
      }
    } catch (error) {
      console.error('❌ Error creating/updating user profile:', error)
      throw error
    }
  }

  /**
   * Get user profile by UID
   */
  async getUserProfile(uid?: string): Promise<UserProfile | null> {
    try {
      const targetUID = uid || this.getCurrentUserUID()
      if (!targetUID) return null

      const userRef = doc(db, 'users', targetUID)
      const userDoc = await getDoc(userRef)
      
      return userDoc.exists() ? userDoc.data() as UserProfile : null
    } catch (error) {
      console.error('❌ Error fetching user profile:', error)
      return null
    }
  }

  /**
   * Check if user has specific permission
   */
  async hasPermission(permission: keyof UserPermissions): Promise<boolean> {
    try {
      const profile = await this.getUserProfile()
      if (!profile) return false
      
      const permissionValue = profile.permissions[permission]
      return typeof permissionValue === 'boolean' ? permissionValue : false
    } catch (error) {
      console.error('❌ Error checking permission:', error)
      return false
    }
  }

  /**
   * Check usage limits
   */
  async checkUsageLimits(): Promise<{
    canUpload: boolean
    reason?: string
    remainingUploads?: number
  }> {
    try {
      const profile = await this.getUserProfile()
      if (!profile) return { canUpload: false, reason: 'User profile not found' }

      const { permissions, usage } = profile
      
      // Check if user can upload
      if (!permissions.canUpload) {
        return { canUpload: false, reason: 'Upload permission denied' }
      }

      // Check daily limit
      if (usage.uploadsToday >= permissions.maxFilesPerDay) {
        return { 
          canUpload: false, 
          reason: `Daily upload limit reached (${permissions.maxFilesPerDay})` 
        }
      }

      return { 
        canUpload: true, 
        remainingUploads: permissions.maxFilesPerDay - usage.uploadsToday 
      }
    } catch (error) {
      console.error('❌ Error checking usage limits:', error)
      return { canUpload: false, reason: 'Error checking limits' }
    }
  }

  /**
   * Update usage statistics
   */
  async updateUsageStats(stats: Partial<UserUsageStats>): Promise<void> {
    try {
      const uid = this.getCurrentUserUID()
      if (!uid) return

      const userRef = doc(db, 'users', uid)
      await updateDoc(userRef, {
        usage: stats,
        updatedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('❌ Error updating usage stats:', error)
    }
  }

  /**
   * Increment upload counter
   */
  async incrementUploadCount(): Promise<void> {
    try {
      const profile = await this.getUserProfile()
      if (!profile) return

      const updatedUsage: UserUsageStats = {
        ...profile.usage,
        totalUploads: profile.usage.totalUploads + 1,
        uploadsToday: profile.usage.uploadsToday + 1,
        uploadsThisMonth: profile.usage.uploadsThisMonth + 1,
        lastUpload: serverTimestamp() as Timestamp
      }

      await this.updateUsageStats(updatedUsage)
    } catch (error) {
      console.error('❌ Error incrementing upload count:', error)
    }
  }

  /**
   * Reset daily usage counters (called by scheduler)
   */
  async resetDailyUsage(): Promise<void> {
    try {
      const usersRef = collection(db, 'users')
      const snapshot = await getDocs(usersRef)
      
      const batch = writeBatch(db)

      snapshot.forEach((doc) => {
        const userRef = doc.ref
        batch.update(userRef, {
          'usage.uploadsToday': 0,
          updatedAt: serverTimestamp()
        })
      })

      await batch.commit()
    } catch (error) {
      console.error('❌ Error resetting daily usage:', error)
    }
  }

  /**
   * Get user's data namespace for Firestore collections
   */
  getUserDataPath(collectionName: string): string {
    const uid = this.getCurrentUserUID()
    if (!uid) throw new Error('User not authenticated')
    
    return `users/${uid}/${collectionName}`
  }

  /**
   * Check file size against user limits
   */
  async validateFileSize(fileSizeInMB: number): Promise<{
    isValid: boolean
    reason?: string
    maxAllowed?: number
  }> {
    try {
      const profile = await this.getUserProfile()
      if (!profile) return { isValid: false, reason: 'User profile not found' }

      const maxSize = profile.permissions.maxFileSize
      
      if (fileSizeInMB > maxSize) {
        return {
          isValid: false,
          reason: `File size exceeds limit of ${maxSize}MB`,
          maxAllowed: maxSize
        }
      }

      return { isValid: true }
    } catch (error) {
      console.error('❌ Error validating file size:', error)
      return { isValid: false, reason: 'Error validating file size' }
    }
  }

  /**
   * Admin function: Update user permissions
   */
  async updateUserPermissions(targetUID: string, permissions: Partial<UserPermissions>): Promise<void> {
    try {
      // Check if current user is admin
      const currentProfile = await this.getUserProfile()
      if (!currentProfile?.permissions.canManageOrgUsers) {
        throw new Error('Insufficient permissions to manage users')
      }

      const userRef = doc(db, 'users', targetUID)
      await updateDoc(userRef, {
        permissions: permissions,
        updatedAt: serverTimestamp()
      })
    } catch (error) {
      console.error('❌ Error updating user permissions:', error)
      throw error
    }
  }

  /**
   * Create user invitation
   */
  async inviteUser(email: string, role: 'org_admin' | 'user' | 'viewer', message?: string): Promise<string> {
    try {
      const currentProfile = await this.getUserProfile()
      if (!currentProfile?.permissions.canInviteUsers) {
        throw new Error('Insufficient permissions to invite users')
      }

      // Check if user already exists
      const usersRef = collection(db, 'users')
      const existingUserQuery = query(usersRef, where('email', '==', email))
      const existingUserSnapshot = await getDocs(existingUserQuery)
      
      if (!existingUserSnapshot.empty) {
        throw new Error('User already exists in the system')
      }

      // Create invitation
      const inviteRef = doc(collection(db, 'user_invites'))
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + 7) // 7 days expiry

      const invite: UserInvite = {
        id: inviteRef.id,
        organizationId: currentProfile.organizationId,
        email,
        role,
        invitedBy: currentProfile.uid,
        invitedAt: serverTimestamp() as Timestamp,
        expiresAt: expiresAt as any,
        status: 'pending',
        message
      }

      await setDoc(inviteRef, invite)
      
      // TODO: Send invitation email
      console.log(`📧 User invitation created for ${email} to organization ${currentProfile.organizationId}`)
      
      return inviteRef.id
    } catch (error) {
      console.error('❌ Error creating user invitation:', error)
      throw error
    }
  }

  /**
   * Accept user invitation
   */
  async acceptInvitation(inviteId: string): Promise<void> {
    try {
      const inviteRef = doc(db, 'user_invites', inviteId)
      const inviteDoc = await getDoc(inviteRef)
      
      if (!inviteDoc.exists()) {
        throw new Error('Invitation not found')
      }

      const invite = inviteDoc.data() as UserInvite
      
      if (invite.status !== 'pending') {
        throw new Error('Invitation is no longer valid')
      }

      if (invite.expiresAt.toDate() < new Date()) {
        throw new Error('Invitation has expired')
      }

      // Update invitation status
      await updateDoc(inviteRef, {
        status: 'accepted',
        updatedAt: serverTimestamp()
      })

    } catch (error) {
      console.error('❌ Error accepting invitation:', error)
      throw error
    }
  }

  /**
   * Get organization info
   */
  async getOrganization(orgId?: string): Promise<Organization | null> {
    try {
      const currentProfile = await this.getUserProfile()
      const targetOrgId = orgId || currentProfile?.organizationId
      
      if (!targetOrgId) return null

      const orgRef = doc(db, 'organizations', targetOrgId)
      const orgDoc = await getDoc(orgRef)
      
      return orgDoc.exists() ? orgDoc.data() as Organization : null
    } catch (error) {
      console.error('❌ Error fetching organization:', error)
      return null
    }
  }

  /**
   * Admin function: List all users in organization
   */
  async getOrganizationUsers(): Promise<UserProfile[]> {
    try {
      // Check if current user is admin
      const currentProfile = await this.getUserProfile()
      if (!currentProfile?.permissions.canManageOrgUsers) {
        throw new Error('Insufficient permissions to view organization users')
      }

      const usersRef = collection(db, 'users')
      const q = query(usersRef, where('organizationId', '==', currentProfile.organizationId))
      const snapshot = await getDocs(q)
      
      return snapshot.docs.map(doc => doc.data() as UserProfile)
    } catch (error) {
      console.error('❌ Error fetching organization users:', error)
      throw error
    }
  }
}

export const userService = new UserService()