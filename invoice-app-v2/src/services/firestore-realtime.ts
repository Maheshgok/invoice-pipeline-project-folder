import { 
  collection, 
  doc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  Timestamp,
  DocumentData,
  QuerySnapshot,
  DocumentSnapshot,
  limit
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { authService } from './auth'

export interface InvoiceProcessingResult {
  id: string
  fileName: string
  fileSize: number
  status: 'queued' | 'processing' | 'completed' | 'error'
  progress: number
  processedAt?: string
  userEmail: string
  extractedData?: any
  error?: string
  jobId?: string
  gcsPath?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

class RealtimeFirestoreService {
  private unsubscribers: (() => void)[] = []
  private activeJobIds: Set<string> = new Set()
  private resultsCache: Map<string, InvoiceProcessingResult> = new Map()

  /**
   * Real-time listener for ALL new invoice results for current user
   * Automatically pushes updates when new documents are added/modified
   */
  listenToAllUserResults(
    onUpdate: (results: InvoiceProcessingResult[]) => void,
    onError: (error: Error) => void
  ) {
    const user = authService.getCurrentUser()
    if (!user) {
      onError(new Error('User not authenticated'))
      return
    }

    console.log('🔥 Setting up REAL-TIME listener for user:', user.email)

    // Listen to ALL invoice_results for current user, ordered by creation time
    const resultsQuery = query(
      collection(db, 'invoice_results'),
      where('user_email', '==', user.email),
      orderBy('created_at', 'desc'),
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
            
            if (isNewFormat) {
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
   * Track specific job IDs for targeted updates
   * This allows monitoring specific uploads while still getting all user data
   */
  trackJobIds(jobIds: string[]) {
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
  listenToSpecificJobs(
    jobIds: string[],
    onUpdate: (results: InvoiceProcessingResult[]) => void,
    onError: (error: Error) => void
  ) {
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
  extractJournalEntriesFromResults(results: InvoiceProcessingResult[]) {
    const entries: any[] = []
    
    results.forEach((result) => {
      if (result.extractedData && result.extractedData.double_entry_bookkeeping) {
        const journalSets = result.extractedData.double_entry_bookkeeping.journal_entry_set || []
        
        journalSets.forEach((journalSet: any, setIndex: number) => {
          const journalEntries = journalSet.entries || []
          
          journalEntries.forEach((entry: any, entryIndex: number) => {
            entries.push({
              id: `${result.jobId}_${setIndex}_${entryIndex}`,
              invoiceId: result.id,
              invoiceNumber: result.extractedData.invoice_number || '',
              vendor: result.extractedData.vendor_name || '',
              entryIndex: entryIndex,
              date: entry.date || journalSet.date || result.extractedData.invoice_date || '',
              accountName: entry.account_name || '',
              accountCode: entry.account_code || '',
              accountType: entry.account_type || '',
              debitAmount: entry.debit_amount || 0,
              creditAmount: entry.credit_amount || 0,
              narration: entry.narration || journalSet.entry_description || '',
              userId: result.userEmail,
              createdAt: result.createdAt
            })
          })
        })
      }
    })
    
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
   * Clean up all active listeners
   */
  cleanup() {
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