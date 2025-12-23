import { archiveService } from './archive'
import { authService } from './auth'

class WindowCloseHandler {
  private cleanupInProgress = false
  private hasResults = false
  private user: any = null
  private cleanupPromise: Promise<void> | null = null

  /**
   * Initialize the window close handler with event listeners
   */
  initialize(user: any) {
    this.user = user
    this.setupEventListeners()
  }

  /**
   * Update the status of whether there are results to archive
   */
  setHasResults(hasResults: boolean) {
    this.hasResults = hasResults
    console.log('🗂️ WindowCloseHandler: Updated results status:', hasResults)
  }

  /**
   * Set up all the window/tab close event listeners
   */
  private setupEventListeners() {
    // Handle beforeunload - shows warning if there are unsaved results
    window.addEventListener('beforeunload', this.handleBeforeUnload)
    
    // Handle unload - send beacon for server-side cleanup
    window.addEventListener('unload', this.handleUnload)
    
    // Handle pagehide - more reliable than unload on mobile
    window.addEventListener('pagehide', this.handlePageHide)
    
    // Handle visibility change - cleanup when tab is hidden for extended time
    document.addEventListener('visibilitychange', this.handleVisibilityChange)

    // Listen for manual logout to cleanup
    window.addEventListener('user-logout', this.handleManualLogout)
  }

  /**
   * Remove all event listeners
   */
  cleanup() {
    window.removeEventListener('beforeunload', this.handleBeforeUnload)
    window.removeEventListener('unload', this.handleUnload)
    window.removeEventListener('pagehide', this.handlePageHide)
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    window.removeEventListener('user-logout', this.handleManualLogout)
  }

  /**
   * Handle beforeunload event - show warning if user has unsaved data
   */
  private handleBeforeUnload = (event: BeforeUnloadEvent) => {
    if (this.hasResults && this.user && !this.cleanupInProgress) {
      const message = 'You have unprocessed invoice results. Are you sure you want to leave?'
      event.preventDefault()
      event.returnValue = message
      return message
    }
  }

  /**
   * Handle unload event - send beacon for server-side cleanup
   */
  private handleUnload = () => {
    if (this.user && this.hasResults) {
      try {
        const logoutData = JSON.stringify({
          uid: this.user.id || this.user.uid,
          email: this.user.email,
          hasResults: this.hasResults,
          timestamp: new Date().toISOString(),
          action: 'window_close'
        })
        
        // Use sendBeacon for reliable data transmission during unload
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/user-close', logoutData)
        }
        
        console.log('📡 Sent window close beacon for user:', this.user.email)
      } catch (error) {
        console.error('❌ Error sending close beacon:', error)
      }
    }
  }

  /**
   * Handle pagehide event - perform cleanup and logout
   */
  private handlePageHide = async (event: PageTransitionEvent) => {
    if (this.user && !this.cleanupInProgress) {
      console.log('🚪 Page hiding - triggering cleanup for user:', this.user.email)
      
      // Don't await this to avoid blocking the page close
      this.performAsyncCleanup()
    }
  }

  /**
   * Handle visibility change - cleanup if hidden for extended time
   */
  private handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden' && this.user && this.hasResults) {
      console.log('👁️ Page hidden with results - scheduling cleanup check')
      
      // Delay cleanup to see if user returns quickly
      setTimeout(() => {
        if (document.visibilityState === 'hidden' && this.user && this.hasResults) {
          console.log('⏰ Page still hidden after delay - triggering cleanup')
          this.performAsyncCleanup()
        }
      }, 45000) // 45 seconds delay
    }
  }

  /**
   * Handle manual logout
   */
  private handleManualLogout = () => {
    console.log('👤 Manual logout triggered')
    this.performAsyncCleanup()
  }

  /**
   * Perform async cleanup operations
   */
  private performAsyncCleanup() {
    if (this.cleanupInProgress || !this.user) {
      return this.cleanupPromise || Promise.resolve()
    }

    this.cleanupInProgress = true
    
    this.cleanupPromise = this.executeCleanup()
      .then(() => {
        console.log('✅ Async cleanup completed successfully')
      })
      .catch((error) => {
        console.error('❌ Error during async cleanup:', error)
      })
      .finally(() => {
        this.cleanupInProgress = false
        this.cleanupPromise = null
      })

    return this.cleanupPromise
  }

  /**
   * Execute the actual cleanup operations
   */
  private async executeCleanup() {
    if (!this.user) return

    console.log('🧹 Starting cleanup for user:', this.user.email)

    try {
      // Archive results if any exist
      if (this.hasResults) {
        console.log('📦 Archiving results before cleanup...')
        await Promise.race([
          archiveService.archiveCompletedResults(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Archive timeout')), 10000))
        ])
        console.log('✅ Results archived successfully')
      }

      // Clear results tracking
      this.hasResults = false

      console.log('✅ Cleanup completed for user:', this.user.email)
    } catch (error) {
      console.error('❌ Cleanup error:', error)
      throw error
    }
  }

  /**
   * Trigger manual cleanup (for logout button, etc.)
   */
  async triggerCleanup() {
    return this.performAsyncCleanup()
  }
}

// Export singleton instance
export const windowCloseHandler = new WindowCloseHandler()