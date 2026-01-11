import { authService } from './auth'
import { toast } from 'react-hot-toast'

export interface SharedResult {
  id: string
  shareToken: string
  fileName: string
  status: 'processing' | 'completed' | 'error'
  createdAt: Date
  expiresAt: Date
  userEmail?: string
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
  downloadUrl?: string
  error?: string
}

class SharedResultsService {
  private readonly API_URL = import.meta.env.VITE_ARCHIVE_MANAGER_URL
  
  // Generate a shareable download link
  async createShareableResult(jobId: string, fileName: string): Promise<string> {
    try {
      const idToken = await authService.getIdToken()
      if (!idToken) {
        throw new Error('Authentication required')
      }

      const response = await fetch(`${this.API_URL}/create-shared-result`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jobId,
          fileName,
          expiryHours: 168 // 7 days default
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create shareable result')
      }

      const data = await response.json()
      return data.shareToken
    } catch (error) {
      console.error('Error creating shareable result:', error)
      throw error
    }
  }

  // Access shared result without authentication
  async getSharedResult(shareToken: string): Promise<SharedResult | null> {
    try {
      const response = await fetch(`${this.API_URL}/shared-result/${shareToken}`, {
        method: 'GET'
      })

      if (!response.ok) {
        if (response.status === 404) {
          return null
        }
        throw new Error('Failed to fetch shared result')
      }

      const data = await response.json()
      return {
        ...data,
        createdAt: new Date(data.createdAt),
        expiresAt: new Date(data.expiresAt)
      }
    } catch (error) {
      console.error('Error fetching shared result:', error)
      throw error
    }
  }

  // Download result data as CSV
  async downloadSharedResult(shareToken: string): Promise<void> {
    try {
      const response = await fetch(`${this.API_URL}/download-shared-result/${shareToken}`, {
        method: 'GET'
      })

      if (!response.ok) {
        throw new Error('Failed to download result')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `invoice_result_${shareToken.substring(0, 8)}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      toast.success('Result downloaded successfully')
    } catch (error) {
      console.error('Error downloading shared result:', error)
      toast.error('Failed to download result')
      throw error
    }
  }

  // Generate shareable URL
  generateShareableUrl(shareToken: string): string {
    const baseUrl = window.location.origin
    return `${baseUrl}/shared/${shareToken}`
  }

  // Check if result is still valid
  isResultValid(result: SharedResult): boolean {
    return new Date() < result.expiresAt
  }

  // Get time remaining before expiry
  getTimeUntilExpiry(result: SharedResult): string {
    const now = new Date()
    const diff = result.expiresAt.getTime() - now.getTime()
    
    if (diff <= 0) return 'Expired'
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    
    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''} remaining`
    } else {
      return `${hours} hour${hours > 1 ? 's' : ''} remaining`
    }
  }

  // List user's shared results (authenticated)
  async getUserSharedResults(): Promise<SharedResult[]> {
    try {
      const idToken = await authService.getIdToken()
      if (!idToken) {
        throw new Error('Authentication required')
      }

      const response = await fetch(`${this.API_URL}/user-shared-results`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch shared results')
      }

      const data = await response.json()
      return data.map((item: any) => ({
        ...item,
        createdAt: new Date(item.createdAt),
        expiresAt: new Date(item.expiresAt)
      }))
    } catch (error) {
      console.error('Error fetching user shared results:', error)
      throw error
    }
  }

  // Delete/revoke a shared result
  async revokeSharedResult(shareToken: string): Promise<void> {
    try {
      const idToken = await authService.getIdToken()
      if (!idToken) {
        throw new Error('Authentication required')
      }

      const response = await fetch(`${this.API_URL}/revoke-shared-result/${shareToken}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to revoke shared result')
      }

      toast.success('Shared result revoked successfully')
    } catch (error) {
      console.error('Error revoking shared result:', error)
      toast.error('Failed to revoke shared result')
      throw error
    }
  }
}

export const sharedResultsService = new SharedResultsService()
export default sharedResultsService