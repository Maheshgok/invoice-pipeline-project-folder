/**
 * Secure Datastore Service
 * All-in-one service for secure, consistent datastore operations
 * Replaces direct Firestore calls with permission-validated operations
 */

import { 
  collection, 
  doc,
  query,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  Unsubscribe,
  QueryConstraint
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { datastoreConfigManager, DatastoreOperation } from './datastoreConfigManager'
import { InvoiceProcessingResult } from './firestore-realtime'

export interface SecureQueryOptions {
  collection: 'active' | 'archive' | 'backup'
  constraints?: QueryConstraint[]
  realtime?: boolean
}

export interface SecureDocumentOperation {
  collection: 'active' | 'archive' | 'backup'
  documentId?: string
  data?: any
}

class SecureDatastoreService {
  private static instance: SecureDatastoreService
  private activeListeners: Map<string, Unsubscribe> = new Map()

  private constructor() {}

  static getInstance(): SecureDatastoreService {
    if (!SecureDatastoreService.instance) {
      SecureDatastoreService.instance = new SecureDatastoreService()
    }
    return SecureDatastoreService.instance
  }

  /**
   * Initialize service with user configuration
   */
  async initialize(): Promise<void> {
    try {
      await datastoreConfigManager.initializeConfig()
      console.log('🔐 Secure datastore service initialized')
    } catch (error) {
      console.error('❌ Failed to initialize secure datastore:', error)
      throw error
    }
  }

  /**
   * Secure query with automatic permission validation
   */
  async query(options: SecureQueryOptions): Promise<InvoiceProcessingResult[]> {
    const operation: DatastoreOperation = {
      operation: 'read',
      collection: options.collection
    }

    return await datastoreConfigManager.executeSecureOperation(operation, async (collectionPath) => {
      const collectionRef = collection(db, collectionPath)
      let queryRef = query(collectionRef)

      // Apply constraints if provided
      if (options.constraints && options.constraints.length > 0) {
        queryRef = query(collectionRef, ...options.constraints)
      }

      const snapshot = await getDocs(queryRef)
      const results: InvoiceProcessingResult[] = []

      snapshot.forEach((doc) => {
        const data = doc.data()
        results.push({
          id: doc.id,
          ...data
        } as InvoiceProcessingResult)
      })

      console.log(`📊 Query returned ${results.length} results from ${collectionPath}`)
      return results
    })
  }

  /**
   * Secure real-time listener with automatic cleanup
   */
  async setupRealtimeListener(
    options: SecureQueryOptions,
    onUpdate: (results: InvoiceProcessingResult[]) => void,
    onError?: (error: Error) => void
  ): Promise<string> {
    const operation: DatastoreOperation = {
      operation: 'read',
      collection: options.collection
    }

    const collectionPath = await datastoreConfigManager.getCollectionPath(operation)
    const listenerId = `${options.collection}_${Date.now()}`

    try {
      const collectionRef = collection(db, collectionPath)
      let queryRef = query(collectionRef)

      // Apply constraints if provided
      if (options.constraints && options.constraints.length > 0) {
        queryRef = query(collectionRef, ...options.constraints)
      }

      const unsubscribe = onSnapshot(
        queryRef,
        (snapshot) => {
          const results: InvoiceProcessingResult[] = []
          snapshot.forEach((doc) => {
            const data = doc.data()
            results.push({
              id: doc.id,
              ...data
            } as InvoiceProcessingResult)
          })

          console.log(`🔄 Real-time update: ${results.length} results`)
          onUpdate(results)
        },
        (error) => {
          console.error('❌ Real-time listener error:', error)
          if (onError) {
            onError(error)
          }
        }
      )

      // Store listener for cleanup
      this.activeListeners.set(listenerId, unsubscribe)
      console.log(`👂 Real-time listener setup for ${collectionPath}`)

      return listenerId

    } catch (error) {
      console.error('❌ Failed to setup real-time listener:', error)
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)))
      }
      throw error
    }
  }

  /**
   * Secure document creation
   */
  async createDocument(options: SecureDocumentOperation): Promise<string> {
    const operation: DatastoreOperation = {
      operation: 'write',
      collection: options.collection,
      data: options.data
    }

    return await datastoreConfigManager.executeSecureOperation(operation, async (collectionPath) => {
      if (!options.data) {
        throw new Error('Data is required for document creation')
      }

      const collectionRef = collection(db, collectionPath)
      const docRef = await addDoc(collectionRef, {
        ...options.data,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      console.log(`📄 Document created: ${docRef.id}`)
      return docRef.id
    })
  }

  /**
   * Secure document update
   */
  async updateDocument(options: SecureDocumentOperation): Promise<void> {
    const operation: DatastoreOperation = {
      operation: 'write',
      collection: options.collection,
      documentId: options.documentId,
      data: options.data
    }

    return await datastoreConfigManager.executeSecureOperation(operation, async (collectionPath) => {
      if (!options.documentId || !options.data) {
        throw new Error('Document ID and data are required for update')
      }

      const docRef = doc(db, collectionPath, options.documentId)
      await updateDoc(docRef, {
        ...options.data,
        updatedAt: new Date()
      })

      console.log(`📝 Document updated: ${options.documentId}`)
    })
  }

  /**
   * Secure document archival (move from active to archive)
   */
  async archiveDocument(documentId: string, data: any): Promise<void> {
    try {
      // Start batch operation
      const batch = writeBatch(db)

      // Get paths for both collections
      const activePath = await datastoreConfigManager.getCollectionPath({
        operation: 'read',
        collection: 'active'
      })

      const archivePath = await datastoreConfigManager.getCollectionPath({
        operation: 'write',
        collection: 'archive'
      })

      // Add to archive
      const archiveRef = doc(collection(db, archivePath))
      batch.set(archiveRef, {
        ...data,
        originalId: documentId,
        archivedAt: new Date(),
        updatedAt: new Date()
      })

      // Remove from active
      const activeRef = doc(db, activePath, documentId)
      batch.delete(activeRef)

      // Execute batch
      await batch.commit()

      console.log(`📦 Document archived: ${documentId} → ${archiveRef.id}`)

    } catch (error) {
      console.error('❌ Archive operation failed:', error)
      throw error
    }
  }

  /**
   * Secure document deletion
   */
  async deleteDocument(options: SecureDocumentOperation): Promise<void> {
    const operation: DatastoreOperation = {
      operation: 'delete',
      collection: options.collection,
      documentId: options.documentId
    }

    return await datastoreConfigManager.executeSecureOperation(operation, async (collectionPath) => {
      if (!options.documentId) {
        throw new Error('Document ID is required for deletion')
      }

      const docRef = doc(db, collectionPath, options.documentId)
      await deleteDoc(docRef)

      console.log(`🗑️ Document deleted: ${options.documentId}`)
    })
  }

  /**
   * Get single document securely
   */
  async getDocument(options: SecureDocumentOperation): Promise<InvoiceProcessingResult | null> {
    const operation: DatastoreOperation = {
      operation: 'read',
      collection: options.collection,
      documentId: options.documentId
    }

    return await datastoreConfigManager.executeSecureOperation(operation, async (collectionPath) => {
      if (!options.documentId) {
        throw new Error('Document ID is required')
      }

      const docRef = doc(db, collectionPath, options.documentId)
      const docSnap = await getDoc(docRef)

      if (!docSnap.exists()) {
        return null
      }

      return {
        id: docSnap.id,
        ...docSnap.data()
      } as InvoiceProcessingResult
    })
  }

  /**
   * Remove specific real-time listener
   */
  removeListener(listenerId: string): void {
    const unsubscribe = this.activeListeners.get(listenerId)
    if (unsubscribe) {
      unsubscribe()
      this.activeListeners.delete(listenerId)
      console.log(`👋 Removed listener: ${listenerId}`)
    }
  }

  /**
   * Remove all real-time listeners (cleanup)
   */
  removeAllListeners(): void {
    this.activeListeners.forEach((unsubscribe, listenerId) => {
      unsubscribe()
      console.log(`👋 Removed listener: ${listenerId}`)
    })
    this.activeListeners.clear()
    console.log('🧹 All listeners removed')
  }

  /**
   * Get service statistics
   */
  getServiceStats(): {
    activeListeners: number
    configStats: any
  } {
    return {
      activeListeners: this.activeListeners.size,
      configStats: datastoreConfigManager.getConfigStats()
    }
  }

  /**
   * Refresh configuration and reinitialize
   */
  async refreshConfiguration(): Promise<void> {
    // Clean up existing listeners
    this.removeAllListeners()
    
    // Refresh datastore configuration
    await datastoreConfigManager.refreshConfig()
    
    console.log('🔄 Service configuration refreshed')
  }

  /**
   * Cleanup on logout
   */
  cleanup(): void {
    this.removeAllListeners()
    datastoreConfigManager.clearConfig()
    console.log('🧹 Secure datastore service cleaned up')
  }
}

// Export singleton instance
export const secureDatastoreService = SecureDatastoreService.getInstance()
export default secureDatastoreService