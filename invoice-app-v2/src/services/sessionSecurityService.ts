import { Timestamp, serverTimestamp, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import { db } from '../config/firebase'
import { authService } from './auth'
import toast from 'react-hot-toast'

// Local UserSession interface for session tracking
interface UserSession {
  sessionId: string
  userUid: string
  deviceFingerprint: string
  browserInfo: string
  ipAddress: string
  location?: string
  createdAt: Timestamp
  lastActivity: Timestamp
  isActive: boolean
  tabId?: string
}

/**
 * Service for managing single-device sessions and single-tab restrictions
 */
class SessionSecurityService {
  private currentSessionId: string | null = null
  private deviceFingerprint: string
  private tabId: string
  private broadcastChannel: BroadcastChannel | null = null
  private isActiveTab: boolean = true
  private activityInterval: number | null = null
  private sessionCheckInterval: number | null = null

  constructor() {
    this.deviceFingerprint = this.generateDeviceFingerprint()
    this.tabId = this.generateTabId()
    this.initializeBroadcastChannel()
    this.setupActivityTracking()
    this.setupBeforeUnloadHandler()
  }

  /**
   * Generate device fingerprint for session tracking
   */
  private generateDeviceFingerprint(): string {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.textBaseline = 'top'
      ctx.font = '14px Arial'
      ctx.fillText('Device fingerprint', 2, 2)
    }
    
    const fingerprint = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screenResolution: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      canvasFingerprint: canvas.toDataURL(),
      cookiesEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: (navigator as any).deviceMemory
    }

    return btoa(JSON.stringify(fingerprint)).slice(0, 32)
  }

  /**
   * Generate unique tab ID
   */
  private generateTabId(): string {
    return `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Initialize broadcast channel for tab communication
   */
  private initializeBroadcastChannel(): void {
    try {
      this.broadcastChannel = new BroadcastChannel('session_security')
      this.broadcastChannel.onmessage = (event) => {
        const { type, data } = event.data
        
        switch (type) {
          case 'NEW_TAB_OPENED':
            if (data.tabId !== this.tabId && this.isActiveTab) {
              this.handleDuplicateTab()
            }
            break
          case 'TAB_CLAIMING_ACTIVE':
            if (data.tabId !== this.tabId) {
              this.isActiveTab = false
              this.showTabDeactivatedMessage()
            }
            break
          case 'TAB_CLOSED':
            if (!this.isActiveTab && data.tabId !== this.tabId) {
              this.attemptToRecoverActiveStatus()
            }
            break
        }
      }
    } catch (error) {
      console.warn('BroadcastChannel not supported, tab management disabled')
    }
  }

  /**
   * Start a new session with security checks
   */
  async startSession(userUid: string): Promise<boolean> {
    try {
      // FIRST: Check if any other user is currently active in the system
      const globalActiveSessions = await this.getAnyActiveGlobalSessions()
      const otherUserActiveSessions = globalActiveSessions.filter(session => session.userUid !== userUid)
      
      if (otherUserActiveSessions.length > 0) {
        const activeUser = otherUserActiveSessions[0]
        console.log('🚫 Blocking login - Another user is currently active:', activeUser.userUid)
        
        toast.error('System is currently in use by another user. Please try again later.', {
          duration: 5000,
          position: 'top-center'
        })
        
        return false
      }
      
      // Check for existing sessions of the same user
      const existingSessions = await this.getActiveUserSessions(userUid)
      
      // Terminate other sessions
      if (existingSessions.length > 0) {
        console.log('🔒 Terminating existing sessions for single-device policy')
        await this.terminateOtherSessions(existingSessions)
      }

      // Create new session
      this.currentSessionId = this.generateSessionId()
      const session: UserSession = {
        sessionId: this.currentSessionId,
        userUid: userUid,
        deviceFingerprint: this.deviceFingerprint,
        browserInfo: navigator.userAgent,
        ipAddress: await this.getClientIP(),
        createdAt: serverTimestamp() as Timestamp,
        lastActivity: serverTimestamp() as Timestamp,
        isActive: true,
        tabId: this.tabId
      }

      await this.createUserSessionDoc(session)
      
      // Start activity tracking
      this.startActivityTracking()
      this.startSessionMonitoring()
      
      // Announce new tab
      this.broadcastTabMessage('NEW_TAB_OPENED', { tabId: this.tabId })
      this.claimActiveTab()

      console.log('🔒 Session started successfully:', this.currentSessionId)
      return true

    } catch (error) {
      console.error('❌ Error starting session:', error)
      return false
    }
  }

  /**
   * Check if system is currently in use by any user (public method)
   */
  async isSystemCurrentlyInUse(): Promise<{ inUse: boolean; activeUserUid?: string }> {
    try {
      const globalActiveSessions = await this.getAnyActiveGlobalSessions()
      
      if (globalActiveSessions.length > 0) {
        return {
          inUse: true,
          activeUserUid: globalActiveSessions[0].userUid
        }
      }
      
      return { inUse: false }
    } catch (error) {
      console.error('❌ Error checking system usage:', error)
      return { inUse: false }
    }
  }

  /**
   * End current session
   */
  async endSession(): Promise<void> {
    try {
      if (this.currentSessionId) {
        await this.deactivateSessionDoc(this.currentSessionId)
        this.currentSessionId = null
      }

      this.cleanup()
      this.broadcastTabMessage('TAB_CLOSED', { tabId: this.tabId })

    } catch (error) {
      console.error('❌ Error ending session:', error)
    }
  }

  /**
   * Check if current tab is allowed to perform upload/analysis
   */
  canPerformSecureOperations(): boolean {
    if (!this.isActiveTab) {
      toast.error('Only one tab can perform analysis at a time. Please close other tabs.')
      return false
    }

    if (!this.currentSessionId) {
      toast.error('No active session. Please login again.')
      return false
    }

    return true
  }

  /**
   * Validate session and check for concurrent logins
   */
  async validateSession(): Promise<boolean> {
    try {
      if (!this.currentSessionId) return false

      // Only validate if tab is visible to reduce false positives
      if (document.visibilityState !== 'visible') {
        return true // Assume valid if tab is hidden
      }

      const sessionValid = await this.validateSessionDoc(this.currentSessionId)
      if (!sessionValid) {
        this.handleInvalidSession()
        return false
      }

      return true
    } catch (error) {
      console.error('❌ Error validating session:', error)
      // Don't invalidate on network errors
      return true
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`
  }

  /**
   * Get client IP address (simplified for CSP compliance)
   */
  private async getClientIP(): Promise<string> {
    // Return a placeholder since external IP fetching violates CSP
    return 'client-ip-masked'
  }

  /**
   * Terminate other active sessions
   */
  private async terminateOtherSessions(sessions: UserSession[]): Promise<void> {
    for (const session of sessions) {
      if (session.deviceFingerprint !== this.deviceFingerprint) {
        await this.deactivateSessionDoc(session.sessionId)
        console.log('🔒 Terminated session from other device:', session.sessionId)
      }
    }
  }

  /**
   * Start activity tracking
   */
  private startActivityTracking(): void {
    this.activityInterval = window.setInterval(async () => {
      if (this.currentSessionId) {
        await this.updateSessionActivityDoc(this.currentSessionId)
      }
    }, 30000) // Update every 30 seconds
  }

  /**
   * Start session monitoring
   */
  private startSessionMonitoring(): void {
    this.sessionCheckInterval = window.setInterval(async () => {
      // Only check if tab is active and visible
      if (document.visibilityState === 'visible' && this.isActiveTab) {
        const isValid = await this.validateSession()
        if (!isValid) {
          this.handleInvalidSession()
        }
      }
    }, 120000) // Check every 2 minutes (reduced frequency)
  }

  /**
   * Handle duplicate tab detection
   */
  private handleDuplicateTab(): void {
    toast.error('Analysis functionality is already open in another tab. This tab will be restricted.')
    this.isActiveTab = false
    this.showTabDeactivatedMessage()
  }

  /**
   * Claim active tab status
   */
  private claimActiveTab(): void {
    this.isActiveTab = true
    this.broadcastTabMessage('TAB_CLAIMING_ACTIVE', { tabId: this.tabId })
  }

  /**
   * Attempt to recover active status when other tabs close
   */
  private attemptToRecoverActiveStatus(): void {
    setTimeout(() => {
      if (!this.isActiveTab) {
        this.claimActiveTab()
        toast.success('This tab is now active for analysis operations')
      }
    }, 1000)
  }

  /**
   * Show tab deactivated message
   */
  private showTabDeactivatedMessage(): void {
    // Create overlay to block interaction
    const overlay = document.createElement('div')
    overlay.id = 'tab-restriction-overlay'
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-family: Arial, sans-serif;
    `
    
    overlay.innerHTML = `
      <div style="text-align: center; padding: 2rem; background: rgba(255, 255, 255, 0.1); border-radius: 8px;">
        <h2>Tab Restricted</h2>
        <p>Analysis functionality is active in another tab.</p>
        <p>Please close the other tab or use this tab for analysis.</p>
        <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Refresh Page
        </button>
      </div>
    `
    
    document.body.appendChild(overlay)
  }

  /**
   * Handle invalid session
   */
  private handleInvalidSession(): void {
    // Only show error if we haven't already invalidated
    if (this.currentSessionId) {
      console.warn('🔒 Session invalidated:', this.currentSessionId)
      
      // Clear current session
      this.currentSessionId = null
      
      // Only show toast if user is actively using the app
      if (document.visibilityState === 'visible') {
        toast.error('Session expired. Please refresh to continue.', {
          duration: 4000,
          position: 'top-center'
        })
      }
    }
  }

  /**
   * Broadcast message to other tabs
   */
  private broadcastTabMessage(type: string, data: any): void {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({ type, data })
    }
  }

  /**
   * Setup activity tracking listeners
   */
  private setupActivityTracking(): void {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart']
    
    events.forEach(event => {
      document.addEventListener(event, () => {
        if (this.currentSessionId) {
          this.updateLastActivity()
        }
      }, true)
    })
  }

  /**
   * Update last activity timestamp
   */
  private updateLastActivity(): void {
    // Throttled update to avoid excessive calls
    if (!this.activityInterval) {
      this.activityInterval = window.setTimeout(() => {
        if (this.currentSessionId) {
          this.updateSessionActivityDoc(this.currentSessionId)
        }
        this.activityInterval = null
      }, 10000) // Update at most every 10 seconds
    }
  }

  /**
   * Setup beforeunload handler for cleanup
   */
  private setupBeforeUnloadHandler(): void {
    window.addEventListener('beforeunload', () => {
      this.broadcastTabMessage('TAB_CLOSED', { tabId: this.tabId })
      if (this.currentSessionId) {
        // Cleanup session locally (beacon endpoint not available)
        this.deactivateSessionDoc(this.currentSessionId).catch(err => {
          console.warn('⚠️ Failed to cleanup session on unload:', err)
        })
      }
    })
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.activityInterval) {
      window.clearTimeout(this.activityInterval)
      this.activityInterval = null
    }

    if (this.sessionCheckInterval) {
      window.clearInterval(this.sessionCheckInterval)
      this.sessionCheckInterval = null
    }

    if (this.broadcastChannel) {
      this.broadcastChannel.close()
      this.broadcastChannel = null
    }

    // Remove overlay if exists
    const overlay = document.getElementById('tab-restriction-overlay')
    if (overlay) {
      overlay.remove()
    }
  }

  /**
   * Get current session info
   */
  getCurrentSession(): { sessionId: string | null; tabId: string; isActiveTab: boolean } {
    return {
      sessionId: this.currentSessionId,
      tabId: this.tabId,
      isActiveTab: this.isActiveTab
    }
  }

  // Direct Firestore operations for session management
  
  /**
   * Check for any active sessions across all users (system-wide)
   */
  private async getAnyActiveGlobalSessions(): Promise<UserSession[]> {
    try {
      // Query all user collections for active sessions
      const usersRef = collection(db, 'users')
      const usersSnapshot = await getDocs(usersRef)
      
      const allActiveSessions: UserSession[] = []
      const now = new Date()
      
      for (const userDoc of usersSnapshot.docs) {
        try {
          const sessionsRef = collection(db, `users/${userDoc.id}/sessions`)
          const activeSessionsQuery = query(
            sessionsRef,
            where('isActive', '==', true)
          )
          
          const sessionsSnapshot = await getDocs(activeSessionsQuery)
          
          for (const sessionDoc of sessionsSnapshot.docs) {
            const session = sessionDoc.data() as UserSession
            
            // Only consider sessions active within last 10 minutes for blocking new logins
            const lastActivity = session.lastActivity.toDate ? 
              session.lastActivity.toDate() : 
              new Date(session.lastActivity)
            
            const minutesSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60)
            
            if (minutesSinceActivity <= 10) { // Active within last 10 minutes
              allActiveSessions.push({ ...session, sessionId: sessionDoc.id })
            }
          }
        } catch (error) {
          console.warn(`⚠️ Error checking sessions for user ${userDoc.id}:`, error)
        }
      }
      
      return allActiveSessions
    } catch (error) {
      console.error('❌ Error getting global active sessions:', error)
      return []
    }
  }

  /**
   * Get user's active sessions from Firestore
   */
  private async getActiveUserSessions(userUid: string): Promise<UserSession[]> {
    try {
      const sessionsRef = collection(db, `users/${userUid}/sessions`)
      
      // Try with compound query first, fallback to simple query if index missing
      try {
        const activeSessionsQuery = query(
          sessionsRef,
          where('isActive', '==', true),
          orderBy('lastActivity', 'desc')
        )
        const snapshot = await getDocs(activeSessionsQuery)
        return snapshot.docs.map(doc => ({ ...doc.data(), sessionId: doc.id } as UserSession))
      } catch (indexError) {
        console.warn('⚠️ Firestore index missing, using simple query:', indexError)
        // Fallback to simple query without ordering
        const simpleQuery = query(
          sessionsRef,
          where('isActive', '==', true)
        )
        const snapshot = await getDocs(simpleQuery)
        return snapshot.docs.map(doc => ({ ...doc.data(), sessionId: doc.id } as UserSession))
      }
    } catch (error) {
      console.error('❌ Error getting active sessions:', error)
      return []
    }
  }

  /**
   * Create user session document in Firestore
   */
  private async createUserSessionDoc(session: UserSession): Promise<void> {
    try {
      const sessionRef = doc(db, `users/${session.userUid}/sessions`, session.sessionId)
      await setDoc(sessionRef, {
        ...session,
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp()
      })
      console.log('✅ User session created:', session.sessionId)
    } catch (error) {
      console.error('❌ Error creating user session:', error)
      throw error
    }
  }

  /**
   * Validate user session document
   */
  private async validateSessionDoc(sessionId: string): Promise<boolean> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) return false

      const sessionRef = doc(db, `users/${currentUser.uid}/sessions`, sessionId)
      const sessionDoc = await getDoc(sessionRef)
      
      if (!sessionDoc.exists()) return false
      
      const session = sessionDoc.data() as UserSession
      
      // Check if session is active and not too old
      const now = new Date()
      
      // Handle both Firestore Timestamp and null/undefined cases
      if (!session.lastActivity) {
        console.warn('⚠️ Session missing lastActivity, invalidating')
        await this.deactivateSessionDoc(sessionId)
        return false
      }
      
      const lastActivity = session.lastActivity.toDate ? 
        session.lastActivity.toDate() : 
        new Date(session.lastActivity)
        
      const hoursSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60)
      
      if (!session.isActive || hoursSinceActivity > 24) {
        await this.deactivateSessionDoc(sessionId)
        return false
      }
      
      return true
    } catch (error) {
      console.error('❌ Error validating session:', error)
      return false
    }
  }

  /**
   * Update session activity timestamp
   */
  private async updateSessionActivityDoc(sessionId: string): Promise<void> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) return

      const sessionRef = doc(db, `users/${currentUser.uid}/sessions`, sessionId)
      await updateDoc(sessionRef, {
        lastActivity: serverTimestamp()
      })
    } catch (error) {
      console.error('❌ Error updating session activity:', error)
    }
  }

  /**
   * Deactivate user session document
   */
  private async deactivateSessionDoc(sessionId: string): Promise<void> {
    try {
      const currentUser = authService.getCurrentUser()
      if (!currentUser) return

      const sessionRef = doc(db, `users/${currentUser.uid}/sessions`, sessionId)
      await updateDoc(sessionRef, {
        isActive: false,
        deactivatedAt: serverTimestamp()
      })
      console.log('✅ Session deactivated:', sessionId)
    } catch (error) {
      console.error('❌ Error deactivating session:', error)
    }
  }
}

// Create and export singleton instance
export const sessionSecurityService = new SessionSecurityService()
export default sessionSecurityService