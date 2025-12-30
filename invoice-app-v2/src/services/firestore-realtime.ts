import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  Timestamp,
  DocumentData,
  QuerySnapshot,
  DocumentSnapshot,
  limit,
  writeBatch,
  getDocs
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { authService } from './auth'
import { userService } from './userService'

export interface InvoiceProcessingResult {
  id: string
  fileName: string
  fileSize: number
  status: 'queued' | 'processing' | 'completed' | 'error' | 'displayed'
  progress: number
  processedAt?: string
  userEmail: string
  userUID: string  // Added for better user isolation
  extractedData?: any
  error?: string
  jobId?: string
  gcsPath?: string
  createdAt: Timestamp
  updatedAt: Timestamp
  displayedAt?: string
  frontendStatus?: 'displayed' | 'downloaded' | 'archived'
  organization?: string  // For organization-level data sharing
  department?: string   // For department-level data sharing
  visibility: 'private' | 'organization' | 'public'  // Data visibility level
}

class RealtimeFirestoreService {
  private unsubscribers: (() => void)[] = []
  private activeJobIds: Set<string> = new Set()
  private resultsCache: Map<string, InvoiceProcessingResult> = new Map()
  private activeResultsCache: Map<string, InvoiceProcessingResult> = new Map()
  private recentResultsCache: Map<string, InvoiceProcessingResult> = new Map()

  /**
   * Listen to user's active results with USER-ISOLATED strategy
   * Simplified to always use user-isolated collections for consistency
   */
  listenToActiveResults(onUpdate: (results: InvoiceProcessingResult[]) => void, onError: (error: Error) => void) {
    const user = authService.getCurrentUser()
    if (!user?.uid) {
      onError(new Error('User not authenticated'))
      return
    }

    console.log('🔥 Setting up USER-ISOLATED listener for UID:', user.uid)
    console.log('📊 Using user-isolated collection strategy for consistency')

    // SIMPLIFIED: Always use user-isolated strategy
    this.setupUserIsolatedListener(user, onUpdate, onError)
  }

  /**
   * Setup smart organization listener with proper collection routing and indexing
   * Priority: Organization collection -> User collection -> Legacy collection
   */
  private async setupSmartOrganizationListener(onUpdate: (results: InvoiceProcessingResult[]) => void, onError: (error: Error) => void) {
    try {
      const user = authService.getCurrentUser()
      if (!user?.uid) {
        onError(new Error('User not authenticated'))
        return
      }

      // Get user profile to determine data access scope
      const userProfile = await userService.getUserProfile()
      if (!userProfile) {
        console.log('⚠️  No user profile found, falling back to user-isolated data')
        this.setupUserIsolatedListener(user, onUpdate, onError)
        return
      }

      // Check if user has organization
      if (!userProfile.organizationId) {
        console.log('👤 No organization assigned, using user-isolated collection')
        console.log('🔍 DEBUG: User profile organizationId:', userProfile.organizationId)
        console.log('🔍 DEBUG: User UID:', user.uid)
        console.log('🔍 DEBUG: Target collection will be:', `users/${user.uid}/invoice_results`)
        this.setupUserIsolatedListener(user, onUpdate, onError)
        return
      }

      // For non-admin users, prefer user-isolated to avoid permission issues
      const isOrgAdmin = userProfile.permissions?.canViewOrgData || userProfile.organizationRole === 'admin'
      if (!isOrgAdmin) {
        console.log('👤 Regular user, using user-isolated collection to avoid permission issues')
        this.setupUserIsolatedListener(user, onUpdate, onError)
        return
      }

      console.log('🏢 Data access scope for user:', {
        uid: userProfile.uid,
        organizationId: userProfile.organizationId,
        canViewOrgData: userProfile.permissions?.canViewOrgData || false
      })

      // Use organization-scoped collection
      const orgCollectionPath = `organizations/${userProfile.organizationId}/invoice_results`
      
      // Simple query with just organizationId - client-side filtering for user access
      console.log('🏢 Setting up organization data query with organizationId index')
      const dataQuery = query(
        collection(db, orgCollectionPath),
        where('organizationId', '==', userProfile.organizationId),
        limit(200) // Higher limit since we'll filter client-side
      )

      const unsubscribe = onSnapshot(
        dataQuery,
        async (snapshot: QuerySnapshot<DocumentData>) => {
          const accessType = userProfile.permissions?.canViewOrgData ? 'organization' : 'user'
          console.log(`🔒 ${accessType} data snapshot:`, snapshot.docs.length, 'documents')
          
          // Additional permission check
          const canView = await userService.hasPermission('canViewOwnData')
          if (!canView) {
            onError(new Error('Insufficient permissions to view data'))
            return
          }
          
          // Process all results then filter client-side based on permissions
          const allResults = this.processOrganizationSnapshot(snapshot, userProfile)
          
          // Client-side filtering based on user permissions
          const filteredResults = userProfile.permissions?.canViewOrgData 
            ? allResults // Admins see all org data
            : allResults.filter(result => result.userUID === user.uid) // Users see only their data
            
          console.log(`📊 Filtered ${filteredResults.length} results from ${allResults.length} total (${accessType} access)`)
          
          // If no results found in organization collection, fall back to user collection
          if (filteredResults.length === 0 && snapshot.docs.length === 0) {
            console.log('🔄 Organization collection empty, falling back to user collection...')
            this.setupUserIsolatedListener(user, onUpdate, onError)
            return
          }
          
          // Cache results
          filteredResults.forEach(result => {
            if (result.jobId) {
              this.activeResultsCache.set(result.jobId, result)
            }
          })
          
          onUpdate(filteredResults)
        },
        (error) => {
          console.error('❌ Organization listener error:', error)
          
          // Check if it's a permissions error
          if (error.code === 'permission-denied' || error.message.includes('Missing or insufficient permissions')) {
            console.log('🔄 Permission denied for organization data, falling back to user-isolated...')
            
            // Clean up current listener
            if (unsubscribe) {
              unsubscribe()
            }
            
            // Fallback to user-isolated collection
            const currentUser = authService.getCurrentUser()
            if (currentUser?.uid) {
              this.setupUserIsolatedListener(currentUser, onUpdate, onError)
            } else {
              onError(error)
            }
          } else {
            // For other errors, pass through
            onError(error)
          }
        }
      )

      this.unsubscribers.push(unsubscribe)
    } catch (error) {
      console.error('❌ Error setting up organization listener:', error)
      console.log('🔄 Attempting fallback to user-isolated listener...')
      
      // Fallback to user-isolated collection on any error
      const user = authService.getCurrentUser()
      if (user?.uid) {
        this.setupUserIsolatedListener(user, onUpdate, onError)
      } else {
        onError(error as Error)
      }
    }
  }

  /**
   * Setup user-isolated data listener (fallback for users without organization)
   */
  private setupUserIsolatedListener(user: any, onUpdate: (results: InvoiceProcessingResult[]) => void, onError: (error: Error) => void) {
    console.log('🏠 Setting up user-isolated listener for UID:', user.uid)
    console.log('🏠 User-isolated collection path:', `users/${user.uid}/invoice_results`)
    console.log('🔍 DEBUG: About to query collection:', `users/${user.uid}/invoice_results`)
    console.log('🔍 DEBUG: Query conditions: userUID ==', user.uid)
    
    // Clean up any existing listeners to prevent duplicates
    this.cleanup()
    
    const userCollectionPath = `users/${user.uid}/invoice_results`
    
    // Since we're querying a user-specific subcollection, we don't need the userUID filter
    // This was causing the query to return 0 results due to field name mismatch
    const userQuery = query(
      collection(db, userCollectionPath),
      orderBy('created_at', 'desc'), // Order by creation time
      limit(50)
    )

    const unsubscribe = onSnapshot(
      userQuery,
      (snapshot) => {
        console.log('🏠 User-isolated data snapshot:', snapshot.docs.length, 'documents from', userCollectionPath)
        console.log('🔍 DEBUG: Snapshot details:', snapshot.docs.map(doc => ({
          id: doc.id,
          status: doc.data().status,
          userUID: doc.data().userUID,
          created_at: doc.data().created_at
        })))
        
        if (snapshot.docs.length === 0) {
          console.log('� User collection is empty - no documents found')
          console.log('🔍 Expected collection path:', userCollectionPath)
          onUpdate([]) // Return empty array instead of fallback
          return
        }
        
        const results = this.processUserIsolatedSnapshot(snapshot, user)
        
        // Cache results
        results.forEach(result => {
          if (result.jobId) {
            this.activeResultsCache.set(result.jobId, result)
          }
        })
        
        onUpdate(results)
      },
      (error) => {
        console.error('❌ Error in user-isolated listener:', error)
        console.log('🔄 Falling back to legacy collection...')
        this.setupLegacyListener(user, onUpdate, onError)
      }
    )

    this.unsubscribers.push(unsubscribe)
  }

  /**
   * Setup legacy collection listener (final fallback)
   * Queries the root 'invoice_results' collection for backward compatibility
   */
  private setupLegacyListener(user: any, onUpdate: (results: InvoiceProcessingResult[]) => void, onError: (error: Error) => void) {
    console.log('🔄 Setting up legacy collection listener for user:', user.email)
    
    // Clean up any existing listeners to prevent duplicates
    this.cleanup()
    
    // Query the root collection by user email (legacy pattern)
    const legacyQuery = query(
      collection(db, 'invoice_results'),
      where('user_email', '==', user.email),
      limit(50)
    )

    const unsubscribe = onSnapshot(
      legacyQuery,
      (snapshot) => {
        console.log('🔄 Legacy collection snapshot:', snapshot.docs.length, 'documents')
        
        const results = this.processLegacySnapshot(snapshot, user)
        
        // Cache results
        results.forEach(result => {
          if (result.jobId) {
            this.activeResultsCache.set(result.jobId, result)
          }
        })
        
        onUpdate(results)
      },
      onError
    )

    this.unsubscribers.push(unsubscribe)
  }

  /**
   * OPTIMIZED: Listen to recently displayed results (separate query)
   * Only loads when user explicitly wants to see recent history
   */
  listenToRecentResults(onUpdate: (results: InvoiceProcessingResult[]) => void, onError: (error: Error) => void) {
    const user = authService.getCurrentUser()
    if (!user?.email) {
      onError(new Error('User not authenticated'))
      return
    }

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    console.log('🗓️ Setting up RECENT results listener for:', user.email)

    // ⚙️ ULTRA-SIMPLIFIED query to work immediately without any indexes
    const recentQuery = query(
      collection(db, 'invoice_results'),
      where('user_email', '==', user.email),
      limit(40)  // No orderBy, no compound filters - works immediately
    )

    const unsubscribe = onSnapshot(
      recentQuery,
      (snapshot) => {
        console.log('🗓️ RECENT results snapshot:', snapshot.docs.length, 'documents')
        
        const results = this.processRecentSnapshot(snapshot)
        
        // Cache recent results
        results.forEach(result => {
          if (result.jobId) {
            this.recentResultsCache.set(result.jobId, result)
          }
        })
        
        onUpdate(results)
      },
      onError
    )

    this.unsubscribers.push(unsubscribe)
  }

  /**
   * Real-time listener for ALL new invoice results for current user
   * Automatically pushes updates when new documents are added/modified
   */
  listenToAllUserResults(onUpdate: (results: InvoiceProcessingResult[]) => void, onError: (error: Error) => void) {
    const user = authService.getCurrentUser()
    if (!user) {
      console.log('❌ No authenticated user for Firestore listener')
      onError(new Error('User not authenticated'))
      return
    }

    if (!user.email) {
      console.log('❌ User has no email for Firestore listener')
      onError(new Error('User email not available'))
      return
    }

    console.log('🔥 Setting up REAL-TIME listener for user:', user.email)

    // Listen to ALL invoice_results for current user
    // Removed orderBy to prevent index requirement issues
    const resultsQuery = query(
      collection(db, 'invoice_results'),
      where('user_email', '==', user.email),
      limit(50) // Limit to recent 50 results for performance
    )

    const unsubscribe = onSnapshot(
      resultsQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        console.log('📡 REAL-TIME snapshot received:', {
          docCount: snapshot.docs.length,
          hasChanges: !snapshot.metadata.fromCache,
          source: snapshot.metadata.fromCache ? 'cache' : 'server'
        })

        // Track what changed
        const changes = snapshot.docChanges()
        console.log('📋 Document changes:', {
          added: changes.filter(change => change.type === 'added').length,
          modified: changes.filter(change => change.type === 'modified').length,
          removed: changes.filter(change => change.type === 'removed').length
        })

        const results: InvoiceProcessingResult[] = []
        
        snapshot.forEach((doc: DocumentSnapshot<DocumentData>) => {
          const data = doc.data()
          
          if (data) {
            const docJobId = data.job_id
            
            // Filter for new format job IDs only
            const isNewFormat = docJobId && docJobId.match(/^[A-Z0-9]{3}-[A-Z0-9]{6}-[A-Z0-9]{4}$/)
            const isAlreadyDisplayed = data.frontend_status === 'displayed'
            
            if (isNewFormat) {
              // Always include in results, but mark display status
              const shouldShowInNotifications = !isAlreadyDisplayed
              const result: InvoiceProcessingResult = {
                id: doc.id,
                fileName: this.extractFileNameFromPath(data.bucket_path) || '',
                fileSize: 0,
                status: isAlreadyDisplayed ? 'displayed' : this.mapBackendStatus(data.status),
                progress: this.calculateProgress(data.status),
                processedAt: data.completed_at || data.updated_at,
                userEmail: data.user_email || '',
                extractedData: data.result,
                error: data.error,
                jobId: data.job_id,
                gcsPath: data.bucket_path,
                createdAt: this.stringToTimestamp(data.created_at),
                updatedAt: this.stringToTimestamp(data.updated_at || data.created_at),
                displayedAt: data.displayed_at,
                frontendStatus: data.frontend_status,
                userUID: data.user_uid || data.userUID || '',
                visibility: 'private' as const
              }
              
              // Add metadata for notification filtering
              ;(result as any).shouldShowInNotifications = shouldShowInNotifications
              
              // Cache the result
              this.resultsCache.set(docJobId, result)
              results.push(result)
              
              console.log('✅ Processed document:', {
                jobId: docJobId,
                status: result.status,
                progress: result.progress
              })
            } else {
              console.log('⏭️ Skipping old format job ID:', docJobId)
            }
          }
        })

        console.log('🎯 Total results processed:', results.length)
        onUpdate(results)
      },
      (error) => {
        console.error('❌ Real-time listener error:', error)
        onError(error)
      }
    )

    this.unsubscribers.push(unsubscribe)
  }

  /**
   * Process simplified snapshot - no filtering needed since archive keeps collection clean
   */
  private processSimplifiedSnapshot(snapshot: QuerySnapshot<DocumentData>): InvoiceProcessingResult[] {
    const results: InvoiceProcessingResult[] = []
    
    snapshot.forEach((doc) => {
      const data = doc.data()
      const docJobId = data.job_id
      
      // Only filter for production job ID format
      if (docJobId && docJobId.match(/^[A-Z0-9]{3}-[A-Z0-9]{6}-[A-Z0-9]{4}$/)) {
        const result: InvoiceProcessingResult = {
          id: doc.id,
          fileName: this.extractFileNameFromPath(data.bucket_path) || '',
          fileSize: 0,
          status: this.mapBackendStatus(data.status),
          progress: this.calculateProgress(data.status),
          processedAt: data.completed_at || data.updated_at,
          userEmail: data.user_email || '',
          extractedData: data.result,
          error: data.error,
          jobId: data.job_id,
          gcsPath: data.bucket_path,
          createdAt: this.stringToTimestamp(data.created_at),
          updatedAt: this.stringToTimestamp(data.updated_at || data.created_at),
          displayedAt: data.displayed_at,
          frontendStatus: data.frontend_status,
          userUID: data.user_uid || data.userUID || '',
          visibility: 'private' as const
        }
        
        results.push(result)
      }
    })
    
    // Client-side sorting by creation date (newest first)
    results.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds)
    
    console.log(`📊 Simplified processing: ${results.length} results from ${snapshot.docs.length} total`)
    return results
  }

  /**
   * Process active results snapshot with basic client-side filtering (LEGACY - kept for compatibility)
   */
  private processActiveSnapshot(snapshot: QuerySnapshot<DocumentData>): InvoiceProcessingResult[] {
    const results: InvoiceProcessingResult[] = []
    
    snapshot.forEach((doc) => {
      const data = doc.data()
      const docJobId = data.job_id
      
      // Filter for production job ID format
      if (docJobId && docJobId.match(/^[A-Z0-9]{3}-[A-Z0-9]{6}-[A-Z0-9]{4}$/)) {
        // Basic client-side filtering for active/recent items
        const status = data.status || 'unknown'
        const frontendStatus = data.frontend_status
        
        // Show active processing items and recent completions
        const isActiveProcessing = ['queued', 'processing'].includes(status)
        const isRecentCompletion = status === 'completed' && frontendStatus !== 'displayed'
        
        if (isActiveProcessing || isRecentCompletion) {
          const result: InvoiceProcessingResult = {
            id: doc.id,
            fileName: this.extractFileNameFromPath(data.bucket_path) || '',
            fileSize: 0,
            status: this.mapBackendStatus(data.status),
            progress: this.calculateProgress(data.status),
            processedAt: data.completed_at || data.updated_at,
            userEmail: data.user_email || '',
            extractedData: data.result,
            error: data.error,
            jobId: data.job_id,
            gcsPath: data.bucket_path,
            createdAt: this.stringToTimestamp(data.created_at),
            updatedAt: this.stringToTimestamp(data.updated_at || data.created_at),
            displayedAt: data.displayed_at,
            frontendStatus: data.frontend_status
          }
          
          results.push(result)
        }
      }
    })
    
    // Client-side sorting by creation date (newest first)
    results.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds)
    
    console.log(`📊 Filtered ${results.length} active/recent items from ${snapshot.docs.length} total`)
    return results
  }

  /**
   * Process recent results snapshot
   */
  private processRecentSnapshot(snapshot: QuerySnapshot<DocumentData>): InvoiceProcessingResult[] {
    const results: InvoiceProcessingResult[] = []
    
    snapshot.forEach((doc) => {
      const data = doc.data()
      const docJobId = data.job_id
      
      if (docJobId && docJobId.match(/^[A-Z0-9]{3}-[A-Z0-9]{6}-[A-Z0-9]{4}$/)) {
        const result: InvoiceProcessingResult = {
          id: doc.id,
          fileName: this.extractFileNameFromPath(data.bucket_path) || '',
          fileSize: 0,
          status: 'displayed' as const,
          progress: 100,
          processedAt: data.completed_at || data.updated_at,
          userEmail: data.user_email || '',
          extractedData: data.result,
          error: data.error,
          jobId: data.job_id,
          gcsPath: data.bucket_path,
          createdAt: this.stringToTimestamp(data.created_at),
          updatedAt: this.stringToTimestamp(data.updated_at || data.created_at),
          displayedAt: data.displayed_at,
          frontendStatus: data.frontend_status
        }
        
        results.push(result)
      }
    })
    
    return results
  }

  /**
   * Process organization-scoped snapshot for users with organizations
   */
  private processOrganizationSnapshot(snapshot: QuerySnapshot<DocumentData>, userProfile: any): InvoiceProcessingResult[] {
    const results: InvoiceProcessingResult[] = []
    
    snapshot.forEach((doc) => {
      const data = doc.data()
      
      // Process organization-scoped data
      const result: InvoiceProcessingResult = {
        id: doc.id,
        fileName: this.extractFileNameFromPath(data.bucket_path) || data.fileName || '',
        fileSize: data.fileSize || 0,
        status: this.mapBackendStatus(data.status),
        progress: this.calculateProgress(data.status),
        processedAt: data.completed_at || data.updated_at,
        userEmail: data.user_email || data.userEmail || '',
        extractedData: data.result || data.extractedData,
        error: data.error,
        jobId: data.job_id || data.jobId,
        gcsPath: data.bucket_path || data.gcsPath,
        createdAt: data.createdAt || this.stringToTimestamp(data.created_at),
        updatedAt: data.updatedAt || this.stringToTimestamp(data.updated_at || data.created_at),
        displayedAt: data.displayed_at || data.displayedAt,
        frontendStatus: data.frontend_status || data.frontendStatus,
        userUID: data.userUID || data.user_uid || userProfile.uid,
        visibility: 'organization' as const,
        organization: userProfile.organizationId
      }
      
      results.push(result)
    })
    
    // Sort by creation date (newest first) - client-side sorting to avoid compound indexes
    results.sort((a, b) => {
      const getTime = (timestamp: any) => {
        if (!timestamp) return 0
        if (timestamp.seconds) return timestamp.seconds
        if (typeof timestamp === 'string') return new Date(timestamp).getTime() / 1000
        if (timestamp instanceof Date) return timestamp.getTime() / 1000
        return 0
      }
      
      return getTime(b.createdAt) - getTime(a.createdAt)
    })
    
    console.log(`🏢 Organization processing: ${results.length} results from ${snapshot.docs.length} documents`)
    return results
  }

  /**
   * Process user-isolated snapshot for users without organizations
   */
  private processUserIsolatedSnapshot(snapshot: QuerySnapshot<DocumentData>, user: any): InvoiceProcessingResult[] {
    const results: InvoiceProcessingResult[] = []
    
    snapshot.forEach((doc) => {
      const data = doc.data()
      
      // Process user-isolated data
      const result: InvoiceProcessingResult = {
        id: doc.id,
        fileName: this.extractFileNameFromPath(data.bucket_path) || data.fileName || '',
        fileSize: data.fileSize || 0,
        status: this.mapBackendStatus(data.status),
        progress: this.calculateProgress(data.status),
        processedAt: data.completed_at || data.updated_at,
        userEmail: user.email,
        extractedData: data.result || data.extractedData,
        error: data.error,
        jobId: data.job_id || data.jobId,
        gcsPath: data.bucket_path || data.gcsPath,
        createdAt: data.createdAt || this.stringToTimestamp(data.created_at),
        updatedAt: data.updatedAt || this.stringToTimestamp(data.updated_at || data.created_at),
        displayedAt: data.displayed_at || data.displayedAt,
        frontendStatus: data.frontend_status || data.frontendStatus,
        userUID: user.uid,
        visibility: 'private' as const
      }
      
      results.push(result)
    })
    
    // Sort by creation date (newest first) - client-side sorting to avoid compound indexes
    results.sort((a, b) => {
      const getTime = (timestamp: any) => {
        if (!timestamp) return 0
        if (timestamp.seconds) return timestamp.seconds
        if (typeof timestamp === 'string') return new Date(timestamp).getTime() / 1000
        if (timestamp instanceof Date) return timestamp.getTime() / 1000
        return 0
      }
      
      return getTime(b.createdAt) - getTime(a.createdAt)
    })
    
    console.log(`🏠 User-isolated processing: ${results.length} results from ${snapshot.docs.length} documents`)
    return results
  }

  /**
   * Process legacy collection snapshot for backward compatibility
   */
  private processLegacySnapshot(snapshot: QuerySnapshot<DocumentData>, user: any): InvoiceProcessingResult[] {
    const results: InvoiceProcessingResult[] = []
    
    snapshot.forEach((doc) => {
      const data = doc.data()
      const docJobId = data.job_id
      
      // Only process documents that match expected job ID pattern
      if (docJobId && docJobId.match(/^[A-Z0-9]{3}-[A-Z0-9]{6}-[A-Z0-9]{4}$/)) {
        const result: InvoiceProcessingResult = {
          id: doc.id,
          fileName: this.extractFileNameFromPath(data.bucket_path) || '',
          fileSize: 0,
          status: this.mapBackendStatus(data.status) || 'displayed',
          progress: this.calculateProgress(data.status),
          processedAt: data.completed_at || data.updated_at,
          userEmail: user.email,
          extractedData: data.result,
          error: data.error,
          jobId: data.job_id,
          gcsPath: data.bucket_path,
          createdAt: this.stringToTimestamp(data.created_at),
          updatedAt: this.stringToTimestamp(data.updated_at || data.created_at),
          displayedAt: data.displayed_at,
          frontendStatus: data.frontend_status,
          userUID: user.uid,
          visibility: 'private' as const
        }
        
        results.push(result)
      }
    })
    
    // Sort by creation date (newest first)
    results.sort((a, b) => {
      const getTime = (timestamp: any) => {
        if (!timestamp) return 0
        if (timestamp.seconds) return timestamp.seconds
        if (typeof timestamp === 'string') return new Date(timestamp).getTime() / 1000
        if (timestamp instanceof Date) return timestamp.getTime() / 1000
        return 0
      }
      
      return getTime(b.createdAt) - getTime(a.createdAt)
    })
    
    console.log(`🔄 Legacy collection processing: ${results.length} results from ${snapshot.docs.length} documents`)
    return results
  }

  /**
   * Get combined active and recent results from cache
   */
  getCombinedCachedResults(): InvoiceProcessingResult[] {
    const activeResults = Array.from(this.activeResultsCache.values())
    const recentResults = Array.from(this.recentResultsCache.values())
    
    // Deduplicate and combine
    const combined = new Map<string, InvoiceProcessingResult>()
    
    activeResults.forEach(result => {
      if (result.jobId) combined.set(result.jobId, result)
    })
    
    recentResults.forEach(result => {
      if (result.jobId && !combined.has(result.jobId)) {
        combined.set(result.jobId, result)
      }
    })
    
    return Array.from(combined.values())
      .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds)
  }

  /**
   * Track specific job IDs for targeted updates
   * This allows monitoring specific uploads while still getting all user data
   */
  trackJobIds(jobIds: string[]): void {
    jobIds.forEach(jobId => this.activeJobIds.add(jobId))
    console.log('📌 Tracking job IDs:', Array.from(this.activeJobIds))
  }

  /**
   * Get cached results for specific job IDs
   */
  getCachedResults(jobIds: string[]): InvoiceProcessingResult[] {
    return jobIds
      .map(jobId => this.resultsCache.get(jobId))
      .filter(Boolean) as InvoiceProcessingResult[]
  }

  /**
   * Real-time listener for specific job IDs only
   * More efficient when you only want to track specific uploads
   */
  listenToSpecificJobs(jobIds: string[], onUpdate: (results: InvoiceProcessingResult[]) => void, onError: (error: Error) => void) {
    const user = authService.getCurrentUser()
    if (!user) {
      onError(new Error('User not authenticated'))
      return
    }

    if (jobIds.length === 0) {
      onUpdate([])
      return
    }

    console.log('🎯 Setting up TARGETED real-time listener for jobs:', jobIds)

    // Use 'in' query for specific job IDs (max 10 at a time due to Firestore limit)
    const batches = this.chunkArray(jobIds, 10)
    
    batches.forEach((batch, index) => {
      const resultsQuery = query(
        collection(db, 'invoice_results'),
        where('user_email', '==', user.email),
        where('job_id', 'in', batch)
      )

      const unsubscribe = onSnapshot(
        resultsQuery,
        (snapshot: QuerySnapshot<DocumentData>) => {
          console.log(`📡 Targeted snapshot ${index + 1} received:`, {
            docCount: snapshot.docs.length,
            batch: batch
          })

          const batchResults: InvoiceProcessingResult[] = []
          
          snapshot.forEach((doc: DocumentSnapshot<DocumentData>) => {
            const data = doc.data()
            if (data) {
              const result: InvoiceProcessingResult = {
                id: doc.id,
                fileName: this.extractFileNameFromPath(data.bucket_path) || '',
                fileSize: 0,
                status: this.mapBackendStatus(data.status),
                progress: this.calculateProgress(data.status),
                processedAt: data.completed_at || data.updated_at,
                userEmail: data.user_email || '',
                extractedData: data.result,
                error: data.error,
                jobId: data.job_id,
                gcsPath: data.bucket_path,
                createdAt: this.stringToTimestamp(data.created_at),
                updatedAt: this.stringToTimestamp(data.updated_at || data.created_at)
              }
              
              batchResults.push(result)
            }
          })

          // Combine results from all batches
          const allResults = this.getCombinedResults(jobIds)
          onUpdate(allResults)
        },
        (error) => {
          console.error(`❌ Targeted listener ${index + 1} error:`, error)
          onError(error)
        }
      )

      this.unsubscribers.push(unsubscribe)
    })
  }

  /**
   * Extract journal entries from results
   */
  extractJournalEntriesFromResults(results: InvoiceProcessingResult[]): any[] {
    const entries: any[] = []
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Extracting journal entries from', results.length, 'results')
    }
    
    results.forEach((result, resultIndex) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`📋 Processing result ${resultIndex + 1}:`, {
          jobId: result.jobId,
          hasExtractedData: !!result.extractedData
        })
      }

      // Check both possible data structures
      let journalData = null
      
      // Structure 1: extractedData.double_entry_bookkeeping (original structure)
      if (result.extractedData?.double_entry_bookkeeping) {
        journalData = result.extractedData.double_entry_bookkeeping
        if (process.env.NODE_ENV === 'development') {
          console.log('📊 Found journal data in extractedData.double_entry_bookkeeping')
        }
      }
      // Structure 2: extractedData.extracted_data.double_entry_bookkeeping (new structure)
      else if (result.extractedData?.extracted_data?.double_entry_bookkeeping) {
        journalData = result.extractedData.extracted_data.double_entry_bookkeeping
        if (process.env.NODE_ENV === 'development') {
          console.log('📊 Found journal data in extractedData.extracted_data.double_entry_bookkeeping')
        }
      }
      
      if (journalData) {
        const journalSets = journalData.journal_entry_set || []
        if (process.env.NODE_ENV === 'development') {
          console.log('📝 Found', journalSets.length, 'journal entry sets')
        }
        
        journalSets.forEach((journalSet: any, setIndex: number) => {
          const journalEntries = journalSet.entries || []
          if (process.env.NODE_ENV === 'development') {
            console.log(`🔢 Set ${setIndex + 1} has`, journalEntries.length, 'entries')
          }
          
          // Calculate balance for this journal set
          const totalDebits = journalEntries.reduce((sum: number, entry: any) => 
            sum + (parseFloat(entry.debit_amount) || 0), 0)
          const totalCredits = journalEntries.reduce((sum: number, entry: any) => 
            sum + (parseFloat(entry.credit_amount) || 0), 0)
          const isSetBalanced = Math.abs(totalDebits - totalCredits) < 0.01 // Allow for small rounding differences
          
          if (process.env.NODE_ENV === 'development') {
            console.log(`⚖️ Set ${setIndex + 1} balance: Debits: ₹${totalDebits}, Credits: ₹${totalCredits}, Balanced: ${isSetBalanced}`)
          }
          
          journalEntries.forEach((entry: any, entryIndex: number) => {
            const invoiceNumber = result.extractedData?.extracted_data?.invoice_number || 
                                  result.extractedData?.invoice_number || 
                                  'N/A'
            const vendorName = result.extractedData?.extracted_data?.vendor_name || 
                               result.extractedData?.vendor_name || 
                               'Unknown'
            const invoiceDate = result.extractedData?.extracted_data?.invoice_date || 
                                result.extractedData?.invoice_date || 
                                entry.date || 
                                journalSet.date || 
                                ''

            const journalEntry = {
              id: `${result.jobId}_${setIndex}_${entryIndex}`,
              invoiceId: result.id,
              invoiceNumber: invoiceNumber,
              vendor: vendorName,
              entryIndex: entryIndex,
              date: invoiceDate,
              accountName: entry.account_name || '',
              accountCode: entry.account_code || '',
              accountType: entry.account_type || '',
              debitAmount: parseFloat(entry.debit_amount) || 0,
              creditAmount: parseFloat(entry.credit_amount) || 0,
              narration: entry.narration || journalSet.entry_description || '',
              isBalanced: isSetBalanced, // Add balance status
              userId: result.userEmail,
              createdAt: result.createdAt
            }
            
            if (process.env.NODE_ENV === 'development') {
              console.log(`✅ Added journal entry:`, {
                id: journalEntry.id,
                invoiceId: journalEntry.invoiceId,
                accountName: journalEntry.accountName,
                debitAmount: journalEntry.debitAmount,
                creditAmount: journalEntry.creditAmount
              })
            }
            
            entries.push(journalEntry)
          })
        })
      } else if (process.env.NODE_ENV === 'development') {
        console.log('⚠️ No journal data found for job:', result.jobId)
      }
    })
    
    if (process.env.NODE_ENV === 'development' && entries.length > 0) {
      console.log('🎯 Total journal entries extracted:', entries.length)
    }
    return entries
  }

  // Helper methods
  private extractFileNameFromPath(bucketPath: string): string {
    if (!bucketPath) return ''
    const parts = bucketPath.split('/')
    return parts[parts.length - 1] || ''
  }

  private mapBackendStatus(backendStatus: string): 'queued' | 'processing' | 'completed' | 'error' {
    switch (backendStatus) {
      case 'completed': return 'completed'
      case 'failed': return 'error'
      case 'processing': return 'processing'
      default: return 'queued'
    }
  }

  private stringToTimestamp(dateString: string): Timestamp {
    if (!dateString) return Timestamp.now()
    try {
      const date = new Date(dateString)
      return Timestamp.fromDate(date)
    } catch {
      return Timestamp.now()
    }
  }

  private calculateProgress(status: string): number {
    switch (status) {
      case 'queued': return 10
      case 'processing': return 50
      case 'completed': return 100
      case 'error': return 0
      default: return 0
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  private getCombinedResults(jobIds: string[]): InvoiceProcessingResult[] {
    return jobIds
      .map(jobId => this.resultsCache.get(jobId))
      .filter(Boolean) as InvoiceProcessingResult[]
  }

  /**
   * Mark results as displayed to prevent future notifications
   * This creates a communication channel back to the backend
   */
  async markAsDisplayed(jobIds: string[]): Promise<void> {
    const user = authService.getCurrentUser()
    if (!user?.email) {
      console.error('❌ No authenticated user for marking displayed status')
      return
    }

    console.log('📤 Marking as displayed:', jobIds)
    
    const batch = writeBatch(db)
    let updateCount = 0

    for (const jobId of jobIds) {
      try {
        // Query for the document with this job_id
        const resultsQuery = query(
          collection(db, 'invoice_results'),
          where('job_id', '==', jobId),
          where('user_email', '==', user.email),
          limit(1)
        )

        const querySnapshot = await getDocs(resultsQuery)
        
        if (!querySnapshot.empty) {
          const docRef = querySnapshot.docs[0].ref
          batch.update(docRef, {
            frontend_status: 'displayed',
            displayed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          updateCount++
          console.log('✅ Queued display update for:', jobId)
        } else {
          console.warn('⚠️ Document not found for job ID:', jobId)
        }
      } catch (error) {
        console.error('❌ Error queuing display update for', jobId, error)
      }
    }

    if (updateCount > 0) {
      try {
        await batch.commit()
        console.log('🎯 Successfully marked', updateCount, 'results as displayed')
      } catch (error) {
        console.error('❌ Failed to commit display updates:', error)
      }
    }
  }

  /**
   * Clean up all active listeners
   */
  cleanup(): void {
    this.unsubscribers.forEach(unsubscribe => {
      try {
        unsubscribe()
      } catch (error) {
        console.error('Error unsubscribing from real-time listener:', error)
      }
    })
    this.unsubscribers = []
    this.activeJobIds.clear()
    this.resultsCache.clear()
  }
}

export const realtimeFirestoreService = new RealtimeFirestoreService()