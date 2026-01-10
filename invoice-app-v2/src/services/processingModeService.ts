/**
 * Processing Mode Service - Switch between legacy and functional processing
 */

import { functionalInvoiceService, CompletePipelineResult } from './functionalInvoiceService'
import { getApiUrl } from '../config/api'
import { authService } from './auth'

export type ProcessingMode = 'legacy' | 'functional'

export interface ProcessingConfig {
  mode: ProcessingMode
  enableRealtime: boolean
  enableFallback: boolean
}

export class ProcessingModeService {
  private config: ProcessingConfig = {
    mode: 'functional', // Default to new functional services
    enableRealtime: true,
    enableFallback: true
  }

  /**
   * Set processing mode
   */
  setMode(mode: ProcessingMode): void {
    this.config.mode = mode
    console.log(`🔧 Processing mode set to: ${mode}`)
  }

  /**
   * Get current processing mode
   */
  getMode(): ProcessingMode {
    return this.config.mode
  }

  /**
   * Process invoice using selected mode
   */
  async processInvoice(file: File, jobId: string): Promise<CompletePipelineResult | any> {
    if (this.config.mode === 'functional') {
      return this.processFunctional(file, jobId)
    } else {
      return this.processLegacy(file, jobId)
    }
  }

  /**
   * Process using new functional microservices
   */
  private async processFunctional(file: File, jobId: string): Promise<CompletePipelineResult> {
    try {
      // Convert file to base64
      const imageData = await this.fileToBase64(file)
      
      // Use functional service
      const result = await functionalInvoiceService.processInvoiceComplete(imageData, jobId)
      
      console.log(`✅ Functional processing completed for ${jobId}`)
      return result
      
    } catch (error) {
      console.error(`❌ Functional processing failed for ${jobId}:`, error)
      
      // Fallback to legacy if enabled
      if (this.config.enableFallback) {
        console.log('🔄 Falling back to legacy processing...')
        return this.processLegacy(file, jobId)
      }
      
      throw error
    }
  }

  /**
   * Process using legacy Cloud Tasks system
   */
  private async processLegacy(file: File, jobId: string): Promise<any> {
    try {
      const idToken = await authService.getIdToken()
      if (!idToken) {
        throw new Error('Authentication required')
      }

      // Upload using legacy initial-api
      const formData = new FormData()
      formData.append('file', file)

      const uploadResponse = await fetch(getApiUrl.uploadInvoice(), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`
        },
        body: formData
      })

      if (!uploadResponse.ok) {
        throw new Error(`Legacy upload failed: ${uploadResponse.statusText}`)
      }

      const result = await uploadResponse.json()
      console.log(`✅ Legacy processing initiated for ${jobId}`)
      
      return {
        job_id: jobId,
        status: 'PROCESSING',
        legacy: true,
        ...result
      }
      
    } catch (error) {
      console.error(`❌ Legacy processing failed for ${jobId}:`, error)
      throw error
    }
  }

  /**
   * Check health of services for current mode
   */
  async healthCheck(): Promise<{ healthy: boolean; mode: ProcessingMode; details: any }> {
    if (this.config.mode === 'functional') {
      const health = await functionalInvoiceService.healthCheck()
      return {
        healthy: health.overall,
        mode: 'functional',
        details: health
      }
    } else {
      try {
        const response = await fetch(getApiUrl.health())
        return {
          healthy: response.ok,
          mode: 'legacy', 
          details: { legacy: response.ok }
        }
      } catch (error) {
        return {
          healthy: false,
          mode: 'legacy',
          details: { error: error instanceof Error ? error.message : String(error) }
        }
      }
    }
  }

  /**
   * Convert File to base64 string
   */
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        const result = reader.result as string
        // Remove data URL prefix (e.g., "data:image/png;base64,")
        const base64 = result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = error => reject(error)
    })
  }

  /**
   * Get processing mode configuration
   */
  getConfig(): ProcessingConfig {
    return { ...this.config }
  }

  /**
   * Update processing configuration
   */
  updateConfig(updates: Partial<ProcessingConfig>): void {
    this.config = { ...this.config, ...updates }
    console.log('🔧 Processing config updated:', this.config)
  }
}

// Export singleton instance
export const processingModeService = new ProcessingModeService()