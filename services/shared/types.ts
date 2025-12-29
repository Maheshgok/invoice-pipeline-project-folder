// Shared types across all services

export interface User {
  uid: string
  email: string
  displayName?: string
  photoURL?: string
  emailVerified: boolean
  role: UserRole
  organizationId?: string
  packageId?: string
  createdAt: Date
  lastLoginAt?: Date
}

export type UserRole = 'user' | 'admin' | 'superadmin'

export interface Organization {
  id: string
  name: string
  domain?: string
  industry?: string
  address: {
    street: string
    city: string
    state: string
    country: string
    zipCode: string
  }
  adminUserId: string
  packageId?: string
  settings: {
    allowSelfSignup: boolean
    requireApproval: boolean
    maxUsers?: number
  }
  createdAt: Date
  updatedAt: Date
}

export interface PackageDefinition {
  id: string
  name: string
  type: 'consumption_based' | 'time_based'
  duration: number // days
  analysisLimit: number
  price: number
  currency: string
  features: string[]
  isActive: boolean
  isUnlimited: boolean
  createdAt: Date
  updatedAt: Date
  createdBy: string
}

export interface InvoiceProcessingResult {
  id: string
  userUID: string
  organizationId?: string
  fileName: string
  fileSize: number
  fileUrl: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  processingProgress?: number
  extractedData?: Record<string, any>
  error?: string
  createdAt: Date
  completedAt?: Date
}

// API Response types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Authentication types
export interface AuthToken {
  accessToken: string
  refreshToken?: string
  expiresAt: Date
}

export interface AuthContext {
  user: User | null
  token: AuthToken | null
  permissions: string[]
}