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

    // Listen to invoices collection for the current user
    const invoicesQuery = query(
      collection(db, 'invoices'),
      where('userId', '==', user.uid),
      where('jobId', 'in', jobIds),
      orderBy('createdAt', 'desc')
    )

    const unsubscribe = onSnapshot(
      invoicesQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const results: InvoiceProcessingResult[] = []
        
        snapshot.forEach((doc: DocumentSnapshot<DocumentData>) => {
          const data = doc.data()
          if (data) {
            results.push({
              id: doc.id,
              fileName: data.fileName || '',
              fileSize: data.fileSize || 0,
              status: data.status || 'queued',
              progress: this.calculateProgress(data.status),
              processedAt: data.processedAt,
              userEmail: data.userEmail || '',
              extractedData: data.extractedData,
              error: data.error,
              jobId: data.jobId,
              gcsPath: data.gcsPath,
              createdAt: data.createdAt,
              updatedAt: data.updatedAt || data.createdAt
            })
          }
        })

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
   * Listen to journal entries in real-time
   */
  listenToJournalEntries(
    invoiceIds: string[],
    onUpdate: (entries: JournalEntryData[]) => void,
    onError: (error: Error) => void
  ) {
    const user = authService.getCurrentUser()
    if (!user) {
      onError(new Error('User not authenticated'))
      return
    }

    if (invoiceIds.length === 0) {
      onUpdate([])
      return
    }

    // Listen to journal_entries collection
    const journalQuery = query(
      collection(db, 'journal_entries'),
      where('userId', '==', user.uid),
      where('invoiceId', 'in', invoiceIds),
      orderBy('invoiceId'),
      orderBy('entryIndex')
    )

    const unsubscribe = onSnapshot(
      journalQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const entries: JournalEntryData[] = []
        
        snapshot.forEach((doc: DocumentSnapshot<DocumentData>) => {
          const data = doc.data()
          if (data) {
            entries.push({
              id: doc.id,
              invoiceId: data.invoiceId,
              invoiceNumber: data.invoiceNumber,
              vendor: data.vendor,
              entryIndex: data.entryIndex,
              date: data.date,
              accountName: data.accountName,
              accountCode: data.accountCode,
              accountType: data.accountType,
              debitAmount: data.debitAmount || 0,
              creditAmount: data.creditAmount || 0,
              narration: data.narration,
              userId: data.userId,
              createdAt: data.createdAt
            })
          }
        })

        onUpdate(entries)
      },
      (error) => {
        console.error('Journal entries listener error:', error)
        onError(error)
      }
    )

    this.unsubscribers.push(unsubscribe)
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