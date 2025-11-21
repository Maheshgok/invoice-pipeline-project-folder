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
  DocumentSnapshot
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

export interface JournalEntryData {
  id: string
  invoiceId: string
  invoiceNumber: string
  vendor: string
  entryIndex: number
  date: string
  accountName: string
  accountCode: string
  accountType: string
  debitAmount: number
  creditAmount: number
  narration: string
  userId: string
  createdAt: Timestamp
}

class FirestoreService {
  private unsubscribers: (() => void)[] = []

  /**
   * Listen to invoice processing results in real-time
   */
  listenToInvoiceResults(
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

    console.log('🔍 Setting up Firestore listener for:', {
      userEmail: user.email,
      jobIds: jobIds,
      collection: 'invoice_results'
    })

    // Simple query by user_email only - no orderBy to avoid index requirements
    // Filter by job_id in memory to avoid compound query complexity
    const resultsQuery = query(
      collection(db, 'invoice_results'),
      where('user_email', '==', user.email)
    )

    const unsubscribe = onSnapshot(
      resultsQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        console.log('📄 Firestore snapshot received:', {
          docCount: snapshot.docs.length,
          empty: snapshot.empty,
          metadata: snapshot.metadata
        })
        
        const results: InvoiceProcessingResult[] = []
        
        snapshot.forEach((doc: DocumentSnapshot<DocumentData>) => {
          const data = doc.data()
          console.log('📋 Processing document:', {
            docId: doc.id,
            data: data
          })
          
          if (data) {
            // Filter by job_id in memory since compound queries can be tricky
            const docJobId = data.job_id
            console.log('🔍 Job ID comparison:', {
              docJobId: docJobId,
              expectedJobIds: jobIds,
              match: jobIds.includes(docJobId)
            })
            
            if (jobIds.includes(docJobId)) {
              console.log('✅ Document matches job ID:', docJobId)
              results.push({
                id: doc.id,
                fileName: this.extractFileNameFromPath(data.bucket_path) || '',
                fileSize: 0, // Not stored in backend
                status: this.mapBackendStatus(data.status),
                progress: this.calculateProgress(data.status),
                processedAt: data.completed_at || data.updated_at,
                userEmail: data.user_email || '',
                extractedData: data.result, // Complete OpenAI response with journal entries
                error: data.error,
                jobId: data.job_id,
                gcsPath: data.bucket_path,
                createdAt: this.stringToTimestamp(data.created_at),
                updatedAt: this.stringToTimestamp(data.updated_at || data.created_at)
              })
            } else {
              console.log('❌ Document job ID does not match:', { docJobId, expectedJobIds: jobIds })
            }
          }
        })

        console.log('✅ Final processed results:', results)
        onUpdate(results)
      },
      (error) => {
        console.error('Firestore listener error:', error)
        onError(error)
      }
    )

    this.unsubscribers.push(unsubscribe)
  }

  /**
   * Extract journal entries from invoice results
   * Since all data is in invoice_results, we extract journal entries from there
   */
  extractJournalEntriesFromResults(
    results: InvoiceProcessingResult[]
  ): JournalEntryData[] {
    const entries: JournalEntryData[] = []
    
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

  /**
   * Helper method to extract filename from bucket path
   */
  private extractFileNameFromPath(bucketPath: string): string {
    if (!bucketPath) return ''
    const parts = bucketPath.split('/')
    return parts[parts.length - 1] || ''
  }

  /**
   * Map backend status to frontend status
   */
  private mapBackendStatus(backendStatus: string): 'queued' | 'processing' | 'completed' | 'error' {
    switch (backendStatus) {
      case 'completed':
        return 'completed'
      case 'failed':
        return 'error'
      case 'processing':
        return 'processing'
      default:
        return 'queued'
    }
  }

  /**
   * Convert string timestamp to Firestore Timestamp
   */
  private stringToTimestamp(dateString: string): Timestamp {
    if (!dateString) return Timestamp.now()
    try {
      const date = new Date(dateString)
      return Timestamp.fromDate(date)
    } catch {
      return Timestamp.now()
    }
  }

  /**
   * Calculate progress based on status
   */
  private calculateProgress(status: string): number {
    switch (status) {
      case 'queued': return 10
      case 'processing': return 50
      case 'completed': return 100
      case 'error': return 0
      default: return 0
    }
  }

  /**
   * Clean up all active listeners
   */
  cleanup() {
    this.unsubscribers.forEach(unsubscribe => {
      try {
        unsubscribe()
      } catch (error) {
        console.error('Error unsubscribing from Firestore listener:', error)
      }
    })
    this.unsubscribers = []
  }
}

export const firestoreService = new FirestoreService()