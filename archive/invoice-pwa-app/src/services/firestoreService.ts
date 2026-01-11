import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from '../config/firebase'
import { authService } from './auth'

export interface InvoiceResult {
  id: string
  jobId: string
  userUID: string
  fileName: string
  status: 'processing' | 'completed' | 'error'
  createdAt: Date
  completedAt?: Date
  results?: {
    companyName?: string
    totalAmount?: number
    invoiceNumber?: string
    date?: string
    items?: Array<{
      description: string
      quantity: number
      rate: number
      amount: number
    }>
    journalEntries?: Array<{
      account: string
      debit: number
      credit: number
    }>
  }
  error?: string
}

class FirestoreService {
  private activeListeners: Unsubscribe[] = []

  getUserDataPath(collection: string): string {
    const uid = authService.getCurrentUserUID()
    if (!uid) {
      throw new Error('User not authenticated')
    }
    return `users/${uid}/${collection}`
  }

  // Listen to active invoice results
  listenToActiveResults(callback: (results: InvoiceResult[]) => void): Unsubscribe {
    const uid = authService.getCurrentUserUID()
    if (!uid) {
      throw new Error('User not authenticated')
    }

    const resultsQuery = query(
      collection(db, this.getUserDataPath('invoice_results')),
      where('userUID', '==', uid),
      where('status', 'in', ['processing', 'completed']),
      orderBy('createdAt', 'desc')
    )

    const unsubscribe = onSnapshot(
      resultsQuery,
      (snapshot) => {
        const results: InvoiceResult[] = []
        
        snapshot.forEach((doc) => {
          const data = doc.data()
          results.push({
            id: doc.id,
            jobId: data.jobId,
            userUID: data.userUID,
            fileName: data.fileName,
            status: data.status,
            createdAt: data.createdAt?.toDate() || new Date(),
            completedAt: data.completedAt?.toDate(),
            results: data.results,
            error: data.error
          })
        })
        
        callback(results)
      },
      (error) => {
        console.error('Firestore listener error:', error)
      }
    )

    this.activeListeners.push(unsubscribe)
    return unsubscribe
  }

  // Get a specific result by job ID
  async getResultByJobId(jobId: string): Promise<InvoiceResult | null> {
    const uid = authService.getCurrentUserUID()
    if (!uid) return null

    try {
      const resultQuery = query(
        collection(db, this.getUserDataPath('invoice_results')),
        where('jobId', '==', jobId),
        where('userUID', '==', uid)
      )

      // Since we can't use getDocs in this simple implementation,
      // we'll use a listener that auto-unsubscribes
      return new Promise((resolve) => {
        const unsubscribe = onSnapshot(resultQuery, (snapshot) => {
          unsubscribe() // Immediately unsubscribe
          
          if (snapshot.empty) {
            resolve(null)
            return
          }

          const doc = snapshot.docs[0]
          const data = doc.data()
          
          resolve({
            id: doc.id,
            jobId: data.jobId,
            userUID: data.userUID,
            fileName: data.fileName,
            status: data.status,
            createdAt: data.createdAt?.toDate() || new Date(),
            completedAt: data.completedAt?.toDate(),
            results: data.results,
            error: data.error
          })
        })
      })
    } catch (error) {
      console.error('Error getting result by job ID:', error)
      return null
    }
  }

  // Clean up all listeners
  cleanup(): void {
    this.activeListeners.forEach(unsubscribe => {
      try {
        unsubscribe()
      } catch (error) {
        console.warn('Error unsubscribing from listener:', error)
      }
    })
    this.activeListeners = []
  }
}

export const firestoreService = new FirestoreService()
export default firestoreService