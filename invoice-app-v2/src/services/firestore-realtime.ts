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
  extractedData?: {
    document_type?: string
    visibility_confidence?: string
    vendor_details?: {
      name?: string
      gstin?: string
      pan?: string
      contact_number?: string
      email?: string
      address?: string
    }
    buyer_details?: {
      name?: string
      gstin?: string
      address?: string
      place_of_supply?: string
    }
    invoice_details?: {
      invoice_number?: string
      invoice_date?: string
      due_date?: string
      po_number?: string
      challan_number?: string
      reverse_charge?: string
      transport_details?: string
      terms_and_conditions?: string
    }
    currency?: string
    items?: Array<{
      serial_no?: string
      description?: string
      detailed_narration?: string
      hsn_code?: string
      quantity?: number
      unit?: string
      unit_price?: number
      discount?: number
      taxable_value?: number
      gst_rate?: number
      cgst_amount?: number
      sgst_amount?: number
      igst_amount?: number
      line_total?: number
    }>
    tax_summary?: {
      taxable_value?: number
      cgst_total?: number
      sgst_total?: number
      igst_total?: number
      total_gst?: number
      round_off?: number
      grand_total?: number
    }
    bank_details?: {
      account_number?: string
      ifsc?: string
      bank_name?: string
      upi_id?: string
    }
    compliance_flags?: {
      gst_invoice_compliant?: string
      mandatory_fields_missing?: string[]
      gst_applicable?: string
      tds_applicable?: string
    }
    extracted_table?: any[][]
    raw_text_reference?: string
    // Legacy fields for backward compatibility
    vendor_name?: string
    invoice_number?: string
    invoice_date?: string
    total_amount?: number
    double_entry_bookkeeping?: any
    extracted_data?: any
  }
  // User modification tracking
  user_modifications?: {
    total_changes: number
    last_modified: string
    last_modified_by: string
    changes: Array<{
      field_path: string
      field_name: string
      original_value: any
      new_value: any
      change_timestamp: string
      user_email: string
      change_type: 'edit' | 'add' | 'delete'
      table_context?: {
        row_id: string
        column_name: string
        table_type: 'journal_entries' | 'items' | 'extracted_data'
      }
    }>
  }
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

      // Create journal entries from the new GST-structured data
      if (result.extractedData) {
        const data = result.extractedData
        // Handle nested extracted_data structure from OpenAI response
        const extractedData = data.extracted_data || data
        const vendorName = extractedData.vendor_details?.name || data.vendor_name || 'Unknown'
        const invoiceNumber = extractedData.invoice_details?.invoice_number || data.invoice_number || 'N/A'
        const invoiceDate = extractedData.invoice_details?.invoice_date || data.invoice_date || ''
        const taxSummary = extractedData.tax_summary || data.tax_summary
        const items = extractedData.items || data.items || []
        const firstItem = items.length > 0 ? items[0] : null

        // Create journal entries based on the new structure
        let entryIndex = 0
        
        // Entry 1: Debit expenses for taxable amounts
        if (items.length > 0) {
          items.forEach((item, itemIndex) => {
            if (item.taxable_value && item.taxable_value > 0) {
              const journalEntry = {
                id: `${result.jobId}_exp_${itemIndex}`,
                invoiceId: result.id,
                invoiceNumber: invoiceNumber,
                vendor: vendorName,
                entryIndex: entryIndex++,
                date: invoiceDate,
                accountName: 'Expense - ' + (item.description || 'General'),
                accountCode: item.hsn_code || '',
                accountType: 'Expense',
                debitAmount: parseFloat(item.taxable_value.toString()) || 0,
                creditAmount: 0,
                description: item.detailed_narration || item.description || 'Purchase expense',
                narration: item.detailed_narration || item.description || 'Purchase expense',
                reference: invoiceNumber,
                hsnCode: item.hsn_code || '',
                itemDescription: item.description || '',
                quantity: parseFloat(item.quantity) || 0,
                unitPrice: parseFloat(item.unit_price) || 0,
                gstAmount: parseFloat(item.cgst_amount || 0) + parseFloat(item.sgst_amount || 0) + parseFloat(item.igst_amount || 0),
                cgstAmount: parseFloat(item.cgst_amount) || 0,
                sgstAmount: parseFloat(item.sgst_amount) || 0,
                igstAmount: parseFloat(item.igst_amount) || 0,
                taxableAmount: parseFloat(item.taxable_value) || 0,
                lineTotal: parseFloat(item.line_total) || parseFloat(item.taxable_value) || 0,
                isGstApplicable: parseFloat(item.gst_rate || 0) > 0,
                placeOfSupply: '',
                isBalanced: true,
                userId: result.userEmail,
                createdAt: result.createdAt
              }
              entries.push(journalEntry)
            }
          })
        }

        // Entry 2: Debit Input GST accounts
        if (taxSummary) {
          if (taxSummary.cgst_total && taxSummary.cgst_total > 0) {
            const cgstEntry = {
              id: `${result.jobId}_cgst`,
              invoiceId: result.id,
              invoiceNumber: invoiceNumber,
              vendor: vendorName,
              entryIndex: entryIndex++,
              date: invoiceDate,
              accountName: 'CGST Input Tax Credit',
              accountCode: '1801',
              accountType: 'Current Asset',
              debitAmount: parseFloat(taxSummary.cgst_total.toString()) || 0,
              creditAmount: 0,
              description: 'CGST Input Tax Credit',
              narration: 'CGST Input Tax Credit',
              reference: invoiceNumber,
              hsnCode: firstItem?.hsn_code || '',
              itemDescription: 'GST Input Credit',
              quantity: 0,
              unitPrice: 0,
              gstAmount: parseFloat(taxSummary.cgst_total.toString()) || 0,
              cgstAmount: parseFloat(taxSummary.cgst_total.toString()) || 0,
              sgstAmount: 0,
              igstAmount: 0,
              taxableAmount: 0,
              lineTotal: parseFloat(taxSummary.cgst_total.toString()) || 0,
              isGstApplicable: true,
              placeOfSupply: '',
              isBalanced: true,
              userId: result.userEmail,
              createdAt: result.createdAt
            }
            entries.push(cgstEntry)
          }

          if (taxSummary.sgst_total && taxSummary.sgst_total > 0) {
            const sgstEntry = {
              id: `${result.jobId}_sgst`,
              invoiceId: result.id,
              invoiceNumber: invoiceNumber,
              vendor: vendorName,
              entryIndex: entryIndex++,
              date: invoiceDate,
              accountName: 'SGST Input Tax Credit',
              accountCode: '1802',
              accountType: 'Current Asset',
              debitAmount: parseFloat(taxSummary.sgst_total.toString()) || 0,
              creditAmount: 0,
              description: 'SGST Input Tax Credit',
              narration: 'SGST Input Tax Credit',
              reference: invoiceNumber,
              hsnCode: firstItem?.hsn_code || '',
              itemDescription: 'GST Input Credit',
              quantity: 0,
              unitPrice: 0,
              gstAmount: parseFloat(taxSummary.sgst_total.toString()) || 0,
              cgstAmount: 0,
              sgstAmount: parseFloat(taxSummary.sgst_total.toString()) || 0,
              igstAmount: 0,
              taxableAmount: 0,
              lineTotal: parseFloat(taxSummary.sgst_total.toString()) || 0,
              isGstApplicable: true,
              placeOfSupply: '',
              isBalanced: true,
              userId: result.userEmail,
              createdAt: result.createdAt
            }
            entries.push(sgstEntry)
          }

          if (taxSummary.igst_total && taxSummary.igst_total > 0) {
            const igstEntry = {
              id: `${result.jobId}_igst`,
              invoiceId: result.id,
              invoiceNumber: invoiceNumber,
              vendor: vendorName,
              entryIndex: entryIndex++,
              date: invoiceDate,
              accountName: 'IGST Input Tax Credit',
              accountCode: '1803',
              accountType: 'Current Asset',
              debitAmount: parseFloat(taxSummary.igst_total.toString()) || 0,
              creditAmount: 0,
              description: 'IGST Input Tax Credit',
              narration: 'IGST Input Tax Credit',
              reference: invoiceNumber,
              hsnCode: firstItem?.hsn_code || '',
              itemDescription: 'GST Input Credit',
              quantity: 0,
              unitPrice: 0,
              gstAmount: parseFloat(taxSummary.igst_total.toString()) || 0,
              cgstAmount: 0,
              sgstAmount: 0,
              igstAmount: parseFloat(taxSummary.igst_total.toString()) || 0,
              taxableAmount: 0,
              lineTotal: parseFloat(taxSummary.igst_total.toString()) || 0,
              isGstApplicable: true,
              placeOfSupply: '',
              isBalanced: true,
              userId: result.userEmail,
              createdAt: result.createdAt
            }
            entries.push(igstEntry)
          }

          // Entry 3: Credit Accounts Payable
          if (taxSummary.grand_total && taxSummary.grand_total > 0) {
            const payableEntry = {
              id: `${result.jobId}_payable`,
              invoiceId: result.id,
              invoiceNumber: invoiceNumber,
              vendor: vendorName,
              entryIndex: entryIndex++,
              date: invoiceDate,
              accountName: `Accounts Payable - ${vendorName}`,
              accountCode: '2000',
              accountType: 'Current Liability',
              debitAmount: 0,
              creditAmount: parseFloat(taxSummary.grand_total.toString()) || 0,
              description: `Purchase from ${vendorName} - Invoice ${invoiceNumber}`,
              narration: `Purchase from ${vendorName} - Invoice ${invoiceNumber}`,
              reference: invoiceNumber,
              hsnCode: firstItem?.hsn_code || '',
              itemDescription: `Invoice from ${vendorName}`,
              quantity: 0,
              unitPrice: 0,
              gstAmount: 0,
              cgstAmount: 0,
              sgstAmount: 0,
              igstAmount: 0,
              taxableAmount: parseFloat(taxSummary.taxable_value.toString()) || 0,
              lineTotal: parseFloat(taxSummary.grand_total.toString()) || 0,
              isGstApplicable: false,
              placeOfSupply: '',
              isBalanced: true,
              userId: result.userEmail,
              createdAt: result.createdAt
            }
            entries.push(payableEntry)
          }
        }
      }

      // Fallback to legacy structure if new structure is not available
      if (entries.length === 0) {
        // Check both possible legacy data structures
        let journalData = null
        
        // Structure 0: extractedData.extracted_data.journal_entries (new simplified structure)
        if (result.extractedData?.extracted_data?.journal_entries && Array.isArray(result.extractedData.extracted_data.journal_entries)) {
          // Debug: Log what OpenAI actually returned in journal_entries
          if (process.env.NODE_ENV === 'development') {
            console.log('🔍 DEBUG: OpenAI journal_entries:', JSON.stringify(result.extractedData.extracted_data.journal_entries, null, 2))
            // Specific HSN code debugging
            result.extractedData.extracted_data.journal_entries.forEach((entry: any, idx: number) => {
              console.log(`🔍 Entry ${idx} HSN Debug:`, {
                entryId: idx,
                hsn_code: entry.hsn_code,
                account_name: entry.account_name,
                item_description: entry.item_description
              })
            })
          }
          
          // Journal entries now come enriched with all data from OpenAI
          journalData = {
            journal_entry_set: [{
              entry_number: 1,
              date: result.extractedData.extracted_data.invoice_details?.invoice_date || '',
              entries: result.extractedData.extracted_data.journal_entries, // Use entries as-is from OpenAI
              total_debit: result.extractedData.extracted_data.journal_entries.reduce((sum: number, entry: any) => sum + (entry.debit_amount || 0), 0),
              total_credit: result.extractedData.extracted_data.journal_entries.reduce((sum: number, entry: any) => sum + (entry.credit_amount || 0), 0),
              is_balanced: true,
              entry_description: 'Purchase Invoice Journal Entry'
            }]
          }
          if (process.env.NODE_ENV === 'development') {
            console.log('📊 Found new simplified journal_entries structure with', result.extractedData.extracted_data.journal_entries.length, 'entries')
          }
        }
        // Structure 0.5: Check if data is at extractedData.journal_entries (direct path)
        else if (result.extractedData?.journal_entries && Array.isArray(result.extractedData.journal_entries)) {
          // Debug: This might be the correct path for current data
          console.log('🔍 DEBUG: Direct journal_entries:', JSON.stringify(result.extractedData.journal_entries, null, 2))
          result.extractedData.journal_entries.forEach((entry: any, idx: number) => {
            console.log(`🔍 Direct Entry ${idx} HSN Debug:`, {
              entryId: idx,
              hsn_code: entry.hsn_code,
              account_name: entry.account_name,
              item_description: entry.item_description
            })
          })
          
          journalData = {
            journal_entry_set: [{
              entry_number: 1,
              date: result.extractedData.invoice_details?.invoice_date || '',
              entries: result.extractedData.journal_entries,
              total_debit: result.extractedData.journal_entries.reduce((sum: number, entry: any) => sum + (entry.debit_amount || 0), 0),
              total_credit: result.extractedData.journal_entries.reduce((sum: number, entry: any) => sum + (entry.credit_amount || 0), 0),
              is_balanced: true,
              entry_description: 'Purchase Invoice Journal Entry'
            }]
          }
          if (process.env.NODE_ENV === 'development') {
            console.log('📊 Found direct journal_entries structure with', result.extractedData.journal_entries.length, 'entries')
          }
        }
        // Structure 1: extractedData.journal_entries (direct structure - fallback)
        else if (result.extractedData?.journal_entries && Array.isArray(result.extractedData.journal_entries)) {
          journalData = {
            journal_entry_set: [{
              entry_number: 1,
              date: result.extractedData.invoice_details?.invoice_date || '',
              entries: result.extractedData.journal_entries, // Use entries as-is from OpenAI
              total_debit: result.extractedData.journal_entries.reduce((sum: number, entry: any) => sum + (entry.debit_amount || 0), 0),
              total_credit: result.extractedData.journal_entries.reduce((sum: number, entry: any) => sum + (entry.credit_amount || 0), 0),
              is_balanced: true,
              entry_description: 'Purchase Invoice Journal Entry'
            }]
          }
          if (process.env.NODE_ENV === 'development') {
            console.log('📊 Found direct journal_entries structure')
          }
        }
        // Structure 2: extractedData.double_entry_bookkeeping (original structure)
        else if (result.extractedData?.double_entry_bookkeeping) {
          journalData = result.extractedData.double_entry_bookkeeping
          if (process.env.NODE_ENV === 'development') {
            console.log('📊 Found legacy journal data in extractedData.double_entry_bookkeeping')
          }
        }
        // Structure 3: extractedData.extracted_data.double_entry_bookkeeping (legacy structure)
        else if (result.extractedData?.extracted_data?.double_entry_bookkeeping) {
          journalData = result.extractedData.extracted_data.double_entry_bookkeeping
          if (process.env.NODE_ENV === 'development') {
            console.log('📊 Found legacy journal data in extractedData.extracted_data.double_entry_bookkeeping')
          }
        }
        
        if (journalData) {
          const journalSets = journalData.journal_entry_set || []
          if (process.env.NODE_ENV === 'development') {
            console.log('📝 Found', journalSets.length, 'legacy journal entry sets')
          }
          
          journalSets.forEach((journalSet: any, setIndex: number) => {
            const journalEntries = journalSet.entries || []
            if (process.env.NODE_ENV === 'development') {
              console.log(`🔢 Legacy set ${setIndex + 1} has`, journalEntries.length, 'entries')
            }
            
            journalEntries.forEach((entry: any, entryIndex: number) => {
              // Debug: Log the actual journal entry structure
              console.log('🔍 DEBUG: Journal entry structure:', JSON.stringify(entry, null, 2))
              
              const invoiceNumber = result.extractedData?.extracted_data?.invoice_details?.invoice_number || 
                                   result.extractedData?.extracted_data?.invoice_number || 
                                   result.extractedData?.invoice_details?.invoice_number || 
                                   result.extractedData?.invoice_number || 
                                   'N/A'
              const vendorName = result.extractedData?.extracted_data?.vendor_details?.name || 
                                 result.extractedData?.extracted_data?.vendor_name || 
                                 result.extractedData?.vendor_details?.name ||
                                 result.extractedData?.vendor_name || 
                                 'Unknown'
              const invoiceDate = result.extractedData?.extracted_data?.invoice_details?.invoice_date || 
                                  result.extractedData?.extracted_data?.invoice_date || 
                                  result.extractedData?.invoice_details?.invoice_date ||
                                  result.extractedData?.invoice_date || 
                                  entry.date || 
                                  journalSet.date || 
                                  ''

              // Get fallback data from items array if journal entries don't have enriched data
              const extractedData = result.extractedData.extracted_data || result.extractedData
              const items = extractedData.items || []
              const firstItem = items[0] // Use first item for enrichment fallback
              
              const journalEntry = {
                id: `${result.jobId}_${setIndex}_${entryIndex}`,
                invoiceId: result.id,
                invoiceNumber: invoiceNumber,
                vendor: entry.vendor_name || vendorName, // Use OpenAI provided vendor_name first
                entryIndex: entryIndex,
                date: invoiceDate,
                accountName: entry.account_name || '',
                accountCode: entry.account_code || '', // Direct mapping from OpenAI schema
                accountType: entry.account_type || '',
                debitAmount: parseFloat(entry.debit_amount) || 0,
                creditAmount: parseFloat(entry.credit_amount) || 0,
                description: entry.narration || journalSet.entry_description || '', // Map narration to description for CSV compatibility
                narration: entry.narration || journalSet.entry_description || '', // Keep narration for legacy compatibility
                reference: entry.reference_number || invoiceNumber, // Direct mapping - no variations
                // Enhanced fields - use exact field names from OpenAI schema
                hsnCode: entry.hsn_code || firstItem?.hsn_code || '', // Exact field name mapping
                
                // Debug HSN code mapping
                ...(process.env.NODE_ENV === 'development' && {
                  _debug_hsnMapping: {
                    entry_hsn_code: entry.hsn_code,
                    firstItem_hsn_code: firstItem?.hsn_code,
                    final_hsnCode: entry.hsn_code || firstItem?.hsn_code || '',
                    has_firstItem: !!firstItem
                  }
                }),
                itemDescription: entry.item_description || firstItem?.description || entry.account_name || '', // Exact field name mapping
                quantity: parseFloat(entry.quantity) || parseFloat(firstItem?.quantity) || 0, // Exact field name mapping
                unitPrice: parseFloat(entry.unit_price) || parseFloat(firstItem?.unit_price) || 0, // Exact field name mapping
                // Additional enhanced fields from strict schema
                gstAmount: parseFloat(entry.gst_amount) || 0,
                cgstAmount: parseFloat(entry.cgst_amount) || 0,
                sgstAmount: parseFloat(entry.sgst_amount) || 0,
                igstAmount: parseFloat(entry.igst_amount) || 0,
                taxableAmount: parseFloat(entry.taxable_amount) || 0,
                lineTotal: parseFloat(entry.line_total) || 0,
                isGstApplicable: entry.is_gst_applicable || false,
                placeOfSupply: entry.place_of_supply || '',
                isBalanced: entry.entry_balanced !== undefined ? entry.entry_balanced : true, // Exact field name mapping
                userId: result.userEmail,
                createdAt: result.createdAt
              }
              
              entries.push(journalEntry)
            })
          })
        } else if (process.env.NODE_ENV === 'development') {
          console.log('⚠️ No journal data found for job:', result.jobId)
        }
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