/**
 * Archive Manager API Service
 * Handles communication with the archive-manager Cloud Run service
 * Now supports user-isolated operations
 */

import { authService } from './auth'
import { userService } from './userService'
import { getApiUrl } from '../config/api'
import { secureDatastoreService } from './secureDatastoreService'
import { where } from 'firebase/firestore'

export interface ArchiveResponse {
  message: string
  archived_count: number
  user_email: string
  archive_timestamp: string
}

export interface ArchiveError {
  error: string
}

class ArchiveService {
  private async getAuthHeaders() {
    try {
      const token = await authService.getIdToken()
      const userUID = userService.getCurrentUserUID()
      
      console.log('🔍 Archive service - Getting token for user:', userUID, token ? 'Token received' : 'No token')
      
      if (!token || !userUID) {
        throw new Error('No authentication token or user UID available')
      }
      
      return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-User-UID': userUID  // Pass user UID for server-side validation
      }
    } catch (error) {
      console.error('❌ Archive service - Failed to get auth headers:', error)
      throw error
    }
  }

  /**
   * Archive all completed invoice results for the current user
   * This moves completed items from active collection to archive
   */
  async archiveCompletedResults(): Promise<ArchiveResponse> {
    try {
      console.log('📦 Archive service - Starting archive completed results...')
      const headers = await this.getAuthHeaders()
      
      const archiveUrl = getApiUrl.archiveCompleted()
      console.log('📦 Archive service - Making request to:', archiveUrl)
      console.log('📦 Archive service - Headers:', { 
        'Authorization': headers.Authorization ? 'Bearer [TOKEN_PRESENT]' : 'No auth header',
        'Content-Type': headers['Content-Type'] 
      })
      
      const response = await fetch(archiveUrl, {
        method: 'POST',
        headers
      })

      console.log('📦 Archive service - Response status:', response.status, response.statusText)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ Archive service - Error response:', errorText)
        
        let errorData: ArchiveError
        try {
          errorData = JSON.parse(errorText)
        } catch {
          errorData = { error: errorText || `HTTP ${response.status}` }
        }
        
        throw new Error(`Archive failed: ${response.status} ${errorData.error}`)
      }

      const result: ArchiveResponse = await response.json()
      console.log('✅ Completed results archived:', result)
      return result
    } catch (error) {
      console.error('❌ Archive completed results failed:', error)
      throw error
    }
  }

  /**
   * Archive all displayed invoice results for the current user
   * This moves displayed items from active collection to archive
   */
  async archiveDisplayedResults(): Promise<ArchiveResponse> {
    try {
      const headers = await this.getAuthHeaders()
      
      const response = await fetch(getApiUrl.archiveDisplayed(), {
        method: 'POST',
        headers
      })

      if (!response.ok) {
        const errorData: ArchiveError = await response.json()
        throw new Error(errorData.error || `Archive failed: ${response.status}`)
      }

      const result: ArchiveResponse = await response.json()
      console.log('✅ Displayed results archived:', result)
      return result
    } catch (error) {
      console.error('❌ Archive displayed results failed:', error)
      throw error
    }
  }

  /**
   * Archive all old results (older than specified days)
   */
  async archiveOldResults(daysOld: number = 7): Promise<ArchiveResponse> {
    try {
      const headers = await this.getAuthHeaders()
      
      const response = await fetch(getApiUrl.archiveAllOld(), {
        method: 'POST',
        headers,
        body: JSON.stringify({ days_old: daysOld })
      })

      if (!response.ok) {
        const errorData: ArchiveError = await response.json()
        throw new Error(errorData.error || `Archive failed: ${response.status}`)
      }

      const result: ArchiveResponse = await response.json()
      console.log('✅ Old results archived:', result)
      return result
    } catch (error) {
      console.error('❌ Archive old results failed:', error)
      throw error
    }
  }

  /**
   * Get archived results for the current user
   */
  async getArchivedResults(options: {
    limit?: number
    page?: number
    daysBack?: number
  } = {}): Promise<any> {
    try {
      const headers = await this.getAuthHeaders()
      const params = new URLSearchParams()
      
      if (options.limit) params.append('limit', options.limit.toString())
      if (options.page) params.append('page', options.page.toString())
      if (options.daysBack) params.append('days_back', options.daysBack.toString())

      const url = `${getApiUrl.getArchived()}${params.toString() ? '?' + params.toString() : ''}`
      
      const response = await fetch(url, {
        method: 'GET',
        headers
      })

      if (!response.ok) {
        const errorData: ArchiveError = await response.json()
        throw new Error(errorData.error || `Get archived results failed: ${response.status}`)
      }

      const result = await response.json()
      console.log('✅ Retrieved archived results:', result)
      return result
    } catch (error) {
      console.error('❌ Get archived results failed:', error)
      throw error
    }
  }

  /**
   * Health check for archive service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(getApiUrl.archiveHealth(), {
        method: 'GET'
      })

      if (response.ok) {
        const result = await response.json()
        console.log('✅ Archive service healthy:', result)
        return true
      } else {
        console.error('❌ Archive service unhealthy:', response.status)
        return false
      }
    } catch (error) {
      console.error('❌ Archive service health check failed:', error)
      return false
    }
  }

  /**
   * LOCAL ARCHIVE METHOD: Archive completed results using secure datastore
   * This creates archive collections dynamically and handles user isolation
   */
  async archiveCompletedResultsLocal(): Promise<{ archived_count: number; message: string }> {
    try {
      console.log('📦 Starting local archive of completed results...')
      
      // Query completed results from active collection
      const completedResults = await secureDatastoreService.query({
        collection: 'active',
        constraints: [
          where('status', 'in', ['completed', 'displayed'])
        ]
      })

      if (completedResults.length === 0) {
        console.log('📦 No completed results to archive')
        return {
          archived_count: 0,
          message: 'No completed results found to archive'
        }
      }

      console.log(`📦 Found ${completedResults.length} completed results to archive`)

      // Prepare documents for batch archiving
      const documentsToArchive = completedResults.map(result => ({
        id: result.id,
        data: {
          ...result,
          // Remove the id since it will be duplicated
          id: undefined
        }
      }))

      // Use batch archive for efficiency
      await secureDatastoreService.batchArchiveDocuments(documentsToArchive)

      console.log(`✅ Successfully archived ${completedResults.length} completed results`)
      
      return {
        archived_count: completedResults.length,
        message: `Successfully archived ${completedResults.length} completed results`
      }

    } catch (error) {
      console.error('❌ Local archive failed:', error)
      throw new Error(`Local archive failed: ${error}`)
    }
  }

  /**
   * LOCAL ARCHIVE METHOD: Archive displayed results using secure datastore
   */
  async archiveDisplayedResultsLocal(): Promise<{ archived_count: number; message: string }> {
    try {
      console.log('📦 Starting local archive of displayed results...')
      
      // Query displayed results from active collection
      const displayedResults = await secureDatastoreService.query({
        collection: 'active',
        constraints: [
          where('frontendStatus', '==', 'displayed')
        ]
      })

      if (displayedResults.length === 0) {
        console.log('📦 No displayed results to archive')
        return {
          archived_count: 0,
          message: 'No displayed results found to archive'
        }
      }

      console.log(`📦 Found ${displayedResults.length} displayed results to archive`)

      // Archive each document
      for (const result of displayedResults) {
        await secureDatastoreService.archiveDocument(result.id, {
          ...result,
          id: undefined // Remove duplicate id
        })
      }

      console.log(`✅ Successfully archived ${displayedResults.length} displayed results`)
      
      return {
        archived_count: displayedResults.length,
        message: `Successfully archived ${displayedResults.length} displayed results`
      }

    } catch (error) {
      console.error('❌ Local archive of displayed results failed:', error)
      throw new Error(`Local archive of displayed results failed: ${error}`)
    }
  }

  /**
   * HYBRID ARCHIVE METHOD: Try cloud service first, fallback to local
   * This ensures archiving always works even if cloud service is down
   */
  async archiveCompletedResultsHybrid(): Promise<ArchiveResponse> {
    try {
      // Try cloud service first
      console.log('📦 Attempting cloud-based archive...')
      return await this.archiveCompletedResults()
    } catch (cloudError) {
      console.warn('⚠️ Cloud archive failed, falling back to local archive:', cloudError)
      
      try {
        // Fallback to local archive
        const localResult = await this.archiveCompletedResultsLocal()
        
        // Convert to expected ArchiveResponse format
        return {
          message: localResult.message,
          archived_count: localResult.archived_count,
          user_email: authService.getCurrentUser()?.email || 'unknown',
          archive_timestamp: new Date().toISOString()
        }
      } catch (localError) {
        console.error('❌ Both cloud and local archive failed:', localError)
        throw new Error(`Archive failed - Cloud: ${cloudError}, Local: ${localError}`)
      }
    }
  }
}

export const archiveService = new ArchiveService()

export default archiveService