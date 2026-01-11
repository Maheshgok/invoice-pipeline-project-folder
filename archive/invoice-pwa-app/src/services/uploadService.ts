import { authService } from './auth'
import { toast } from 'react-hot-toast'

export interface UploadFile {
  id: string
  file: File
  fileName: string
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error'
  progress: number
  jobId?: string
  error?: string
  localPreviewUrl?: string
}

class UploadService {
  private readonly API_URL = import.meta.env.VITE_INITIAL_API_URL

  async uploadFile(file: File): Promise<{ jobId: string }> {
    if (!this.API_URL) {
      throw new Error('Initial API URL not configured')
    }

    const idToken = await authService.getIdToken()
    if (!idToken) {
      throw new Error('Authentication required')
    }

    // Create form data
    const formData = new FormData()
    formData.append('file', file)

    // Upload to initial-api service
    const response = await fetch(`${this.API_URL}/upload_invoice`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`
      },
      body: formData
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Upload failed: ${response.status}`)
    }

    const result = await response.json()
    return { jobId: result.job_id }
  }

  async healthCheck(): Promise<boolean> {
    if (!this.API_URL) return false

    try {
      const idToken = await authService.getIdToken()
      if (!idToken) return false

      const response = await fetch(`${this.API_URL}/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      })

      return response.ok
    } catch (error) {
      console.error('Health check failed:', error)
      return false
    }
  }

  createLocalPreviewUrl(file: File): string {
    return URL.createObjectURL(file)
  }

  revokeLocalPreviewUrl(url: string): void {
    try {
      URL.revokeObjectURL(url)
    } catch (error) {
      console.warn('Failed to revoke object URL:', error)
    }
  }

  validateFile(file: File): { valid: boolean; error?: string } {
    // Check file type
    const allowedTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf'
    ]

    if (!allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: `Unsupported file type: ${file.type}`
      }
    }

    // Check file size (10MB limit)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return {
        valid: false,
        error: `File too large: ${(file.size / (1024 * 1024)).toFixed(1)}MB (max 10MB)`
      }
    }

    return { valid: true }
  }

  generateFileId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}

export const uploadService = new UploadService()
export default uploadService