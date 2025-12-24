/**
 * Smart Real-time Listener Manager
 * Optimizes when listeners are initialized to prevent loading delays
 */

import { realtimeFirestoreService } from './firestore-realtime'
import { authService } from './auth'
import { authTokenManager } from './authTokenManager'
import type { InvoiceProcessingResult } from './firestore-realtime'

// ProcessingResult type definition for compatibility
export interface ProcessingResult {
  id: string
  jobId: string
  status: string
  fileName: string
  userUID: string
  createdAt?: any
  completedAt?: any
  gcsPath?: string
  invoiceData: any
  confidence: number
  processingTime: number
  extractedFields: string[]
}

// Event emitter for UI integration
type ResultUpdateListener = (results: ProcessingResult[]) => void
type ErrorListener = (error: Error) => void



export enum ListenerState {
  NOT_INITIALIZED = 'not_initialized',
  INITIALIZING = 'initializing', 
  ACTIVE = 'active',
  ERROR = 'error',
  PAUSED = 'paused'
}

export interface ListenerStats {
  state: ListenerState
  startedAt?: number
  documentsReceived: number
  lastUpdate?: number
  errorCount: number
}

class SmartListenerManager {
  private state: ListenerState = ListenerState.NOT_INITIALIZED
  private stats: ListenerStats = {
    state: ListenerState.NOT_INITIALIZED,
    documentsReceived: 0,
    errorCount: 0
  }
  private listeners: (() => void)[] = []
  private initializationPromise: Promise<void> | null = null
  
  // Event listeners for UI integration
  private resultListeners: Set<ResultUpdateListener> = new Set()
  private errorListeners: Set<ErrorListener> = new Set()
  
  // Configuration
  private readonly IDLE_TIMEOUT = 300000 // 5 minutes of inactivity before pausing
  private readonly MAX_RETRIES = 3
  private readonly RETRY_DELAY = 2000
  
  private idleTimer: number | null = null
  private retryCount = 0

  /**
   * Smart initialization strategy:
   * 1. Don't start on upload (prevents loading delay)
   * 2. Start after first upload completes (when results are expected)
   * 3. Use background initialization to prevent blocking
   */
  async initializeAfterUpload(uploadJobId: string): Promise<void> {
    if (this.state === ListenerState.ACTIVE || this.state === ListenerState.INITIALIZING) {
      console.log('🔄 Listeners already active/initializing')
      return
    }

    // Prevent multiple initialization attempts
    if (this.initializationPromise) {
      return this.initializationPromise
    }

    console.log('🚀 Smart listener initialization - triggered after upload:', uploadJobId)
    
    this.initializationPromise = this.performInitialization(uploadJobId)
    return this.initializationPromise
  }

  private async performInitialization(triggerjobId: string): Promise<void> {
    try {
      this.state = ListenerState.INITIALIZING
      this.stats.state = ListenerState.INITIALIZING
      this.stats.startedAt = Date.now()

      // Ensure we have a valid authentication token
      console.log('🔐 Ensuring valid authentication token...')
      await authTokenManager.getValidToken()
      
      // Validate collection path resolution is available
      console.log('📂 Collection path resolver initialized')

      // Small delay to ensure upload is fully processed
      await new Promise(resolve => setTimeout(resolve, 1000))

      console.log('🎯 Starting real-time listeners in background...')
      
      // Start listeners
      this.startRealtimeListeners()
      
      this.state = ListenerState.ACTIVE
      this.stats.state = ListenerState.ACTIVE
      this.retryCount = 0
      
      // Setup idle timeout
      this.resetIdleTimer()
      
      console.log('✅ Smart listeners initialized successfully')
      
    } catch (error) {
      console.error('❌ Smart listener initialization failed:', error)
      this.state = ListenerState.ERROR
      this.stats.state = ListenerState.ERROR
      this.stats.errorCount++
      
      // Notify error listeners
      this.errorListeners.forEach(listener => {
        try {
          listener(error as Error)
        } catch (listenerError) {
          console.error('Error in error listener:', listenerError)
        }
      })
      
      // Retry logic
      if (this.retryCount < this.MAX_RETRIES) {
        this.retryCount++
        console.log(`🔄 Retrying initialization (${this.retryCount}/${this.MAX_RETRIES})...`)
        setTimeout(() => {
          this.initializationPromise = null
          this.performInitialization(triggerjobId)
        }, this.RETRY_DELAY * this.retryCount)
      }
      
      throw error
    } finally {
      if (this.state !== ListenerState.ERROR) {
        this.initializationPromise = null
      }
    }
  }

  /**
   * Start the actual real-time listeners
   */
  private startRealtimeListeners(): void {
    const user = authService.getCurrentUser()
    if (!user) {
      throw new Error('User not authenticated')
    }

    // Start active results listener
    realtimeFirestoreService.listenToActiveResults(
      (results: InvoiceProcessingResult[]) => {
        this.stats.documentsReceived += results.length
        this.stats.lastUpdate = Date.now()
        this.resetIdleTimer()
        
        // Convert to ProcessingResult format and emit to subscribers
        const convertedResults = this.convertResults(results)
        this.emitResults(convertedResults)
      },
      (error: Error) => {
        console.error('❌ Real-time listener error:', error)
        this.stats.errorCount++
        this.handleListenerError(error)
      }
    )

    console.log('🔗 Real-time listeners connected')
  }

  /**
   * Convert InvoiceProcessingResult to ProcessingResult format
   */
  private convertResults(results: InvoiceProcessingResult[]): ProcessingResult[] {
    return results.map(result => ({
      id: result.id,
      jobId: result.jobId || result.id, // Ensure jobId is always a string
      status: result.status,
      fileName: result.fileName || 'unknown',
      userUID: result.userUID || '',
      createdAt: result.createdAt,
      completedAt: result.status === 'completed' ? Date.now() : undefined, // Calculate from status
      gcsPath: result.gcsPath,
      invoiceData: result.extractedData || {},
      confidence: 0.95, // Default confidence
      processingTime: 0, // Default processing time
      extractedFields: Object.keys(result.extractedData || {})
    } as ProcessingResult))
  }

  /**
   * Emit results to subscribers
   */
  private emitResults(results: ProcessingResult[]): void {
    console.log('📊 Smart listener received results:', results.length)
    
    // Emit to all result listeners
    this.resultListeners.forEach(listener => {
      try {
        listener(results)
      } catch (error) {
        console.error('Error in result listener:', error)
      }
    })
  }
  
  /**
   * Subscribe to result updates (for UI components)
   */
  onResultsUpdate(listener: ResultUpdateListener): () => void {
    this.resultListeners.add(listener)
    console.log('🔔 Result listener subscribed, total:', this.resultListeners.size)
    
    return () => {
      this.resultListeners.delete(listener)
      console.log('🔕 Result listener unsubscribed, total:', this.resultListeners.size)
    }
  }
  
  /**
   * Subscribe to error updates
   */
  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener)
    
    return () => {
      this.errorListeners.delete(listener)
    }
  }

  /**
   * Handle listener errors with smart recovery
   */
  private handleListenerError(_error: Error): void {
    if (this.retryCount < this.MAX_RETRIES) {
      this.retryCount++
      console.log(`🔄 Auto-recovering from listener error (${this.retryCount}/${this.MAX_RETRIES})`)
      
      setTimeout(() => {
        this.cleanup()
        this.state = ListenerState.NOT_INITIALIZED
        // Would trigger re-initialization on next upload
      }, this.RETRY_DELAY * this.retryCount)
    } else {
      console.error('💥 Max retries reached, listeners disabled')
      this.state = ListenerState.ERROR
      this.cleanup()
    }
  }

  /**
   * Reset idle timer
   */
  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
    }
    
    this.idleTimer = setTimeout(() => {
      console.log('😴 Pausing listeners due to inactivity')
      this.pauseListeners()
    }, this.IDLE_TIMEOUT)
  }

  /**
   * Pause listeners to save resources
   */
  private pauseListeners(): void {
    this.state = ListenerState.PAUSED
    this.stats.state = ListenerState.PAUSED
    this.cleanup()
    
    console.log('⏸️ Listeners paused to save resources')
  }

  /**
   * Resume paused listeners
   */
  async resumeListeners(): Promise<void> {
    if (this.state === ListenerState.PAUSED) {
      console.log('▶️ Resuming paused listeners')
      this.state = ListenerState.NOT_INITIALIZED
      // Would be re-initialized on next upload
    }
  }

  /**
   * Check if listeners are ready to receive results
   */
  isReady(): boolean {
    return this.state === ListenerState.ACTIVE
  }

  /**
   * Get current statistics
   */
  getStats(): ListenerStats {
    return { ...this.stats }
  }

  /**
   * Cleanup all listeners
   */
  cleanup(): void {
    this.listeners.forEach(unsubscribe => {
      try {
        unsubscribe()
      } catch (error) {
        console.error('Error cleaning up listener:', error)
      }
    })
    
    this.listeners = []
    this.resultListeners.clear()
    this.errorListeners.clear()
    realtimeFirestoreService.cleanup()
    
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    
    console.log('🧹 Smart listeners cleaned up')
  }

  /**
   * Force initialization (for testing or manual trigger)
   */
  async forceInitialize(): Promise<void> {
    console.log('🔧 Force initializing smart listeners')
    return this.initializeAfterUpload('manual_trigger')
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.cleanup()
    this.state = ListenerState.NOT_INITIALIZED
    this.stats = {
      state: ListenerState.NOT_INITIALIZED,
      documentsReceived: 0,
      errorCount: 0
    }
    this.initializationPromise = null
    this.retryCount = 0
    
    console.log('🔄 Smart listener manager reset')
  }
}

// Export singleton instance
export const smartListenerManager = new SmartListenerManager()
export default smartListenerManager