/**
 * Functional Invoice Processing Service  
 * Integration with the new functional microservices for invoice processing
 */

import { getApiUrl } from '../config/api'

export interface FunctionalProcessingResult {
  success: boolean
  content: string
  tokens_used: number
  processing_time: number
  job_id: string
  timestamp: string
}

export interface CompletePipelineResult {
  job_id: string
  status: 'COMPLETE' | 'ERROR'
  extracted_data?: FunctionalProcessingResult
  enriched_data?: FunctionalProcessingResult
  analysis_data?: FunctionalProcessingResult
  final_tabulation?: any
  processing_stats?: {
    total_processing_time: number
    total_tokens_used: number
    tokens_per_second: number
    phase_breakdown: {
      extraction: { time: number; tokens: number }
      enrichment: { time: number; tokens: number }
      analysis: { time: number; tokens: number }
    }
  }
  error?: string
}

export class FunctionalInvoiceService {
  
  /**
   * Extract data from invoice image using functional extraction service
   */
  async extractInvoiceData(imageData: string, jobId: string): Promise<FunctionalProcessingResult> {
    const response = await fetch(getApiUrl.extractData(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image_data: imageData,
        job_id: jobId
      })
    })

    if (!response.ok) {
      throw new Error(`Extraction failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Enrich extracted data with business intelligence
   */
  async enrichInvoiceData(extractedData: string, jobId: string): Promise<FunctionalProcessingResult> {
    const response = await fetch(getApiUrl.enrichData(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        extracted_data: extractedData,
        job_id: jobId
      })
    })

    if (!response.ok) {
      throw new Error(`Enrichment failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Analyze and validate combined invoice data
   */
  async analyzeInvoiceData(combinedData: any, jobId: string): Promise<FunctionalProcessingResult> {
    const response = await fetch(getApiUrl.analyzeData(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        combined_data: combinedData,
        job_id: jobId
      })
    })

    if (!response.ok) {
      throw new Error(`Analysis failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Create final tabulated summary from all processing phases
   */
  async createTabulation(
    extractionResult: FunctionalProcessingResult,
    enrichmentResult: FunctionalProcessingResult,
    analysisResult: FunctionalProcessingResult,
    jobId: string
  ): Promise<{ success: boolean; tabulation: any; job_id: string; timestamp: string }> {
    const response = await fetch(getApiUrl.tabulateData(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        extraction_result: extractionResult,
        enrichment_result: enrichmentResult,
        analysis_result: analysisResult,
        job_id: jobId
      })
    })

    if (!response.ok) {
      throw new Error(`Tabulation failed: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Complete 3-phase functional processing pipeline
   */
  async processInvoiceComplete(imageData: string, jobId: string): Promise<CompletePipelineResult> {
    try {
      console.log(`🚀 Starting functional pipeline for job ${jobId}`)
      
      // Phase 1: Extraction
      console.log('📋 Phase 1: Extracting invoice data...')
      const extractionResult = await this.extractInvoiceData(imageData, jobId)
      
      if (!extractionResult.success) {
        throw new Error(`Extraction failed: ${extractionResult}`)
      }
      
      // Phase 2: Enrichment
      console.log('💡 Phase 2: Enriching with business intelligence...')
      const enrichmentResult = await this.enrichInvoiceData(extractionResult.content, jobId)
      
      if (!enrichmentResult.success) {
        throw new Error(`Enrichment failed: ${enrichmentResult}`)
      }
      
      // Phase 3: Analysis
      console.log('🔍 Phase 3: Analyzing and validating...')
      const combinedData = {
        extracted_data: extractionResult.content,
        enriched_data: enrichmentResult.content
      }
      
      const analysisResult = await this.analyzeInvoiceData(combinedData, jobId)
      
      if (!analysisResult.success) {
        throw new Error(`Analysis failed: ${analysisResult}`)
      }
      
      // Phase 4: Tabulation
      console.log('📋 Phase 4: Creating final tabulation...')
      const tabulationResult = await this.createTabulation(
        extractionResult,
        enrichmentResult,
        analysisResult,
        jobId
      )
      
      // Calculate totals
      const totalTokens = extractionResult.tokens_used + enrichmentResult.tokens_used + analysisResult.tokens_used
      const totalTime = extractionResult.processing_time + enrichmentResult.processing_time + analysisResult.processing_time
      
      console.log(`✅ Functional pipeline completed in ${totalTime.toFixed(2)}s using ${totalTokens} tokens`)
      
      return {
        job_id: jobId,
        status: 'COMPLETE',
        extracted_data: extractionResult,
        enriched_data: enrichmentResult,
        analysis_data: analysisResult,
        final_tabulation: tabulationResult.tabulation,
        processing_stats: {
          total_processing_time: totalTime,
          total_tokens_used: totalTokens,
          tokens_per_second: totalTokens / totalTime,
          phase_breakdown: {
            extraction: { time: extractionResult.processing_time, tokens: extractionResult.tokens_used },
            enrichment: { time: enrichmentResult.processing_time, tokens: enrichmentResult.tokens_used },
            analysis: { time: analysisResult.processing_time, tokens: analysisResult.tokens_used }
          }
        }
      }
      
    } catch (error) {
      console.error(`❌ Functional pipeline failed for job ${jobId}:`, error)
      return {
        job_id: jobId,
        status: 'ERROR',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * Check health of all functional services
   */
  async healthCheck(): Promise<{ 
    extraction: boolean; 
    enrichment: boolean; 
    analysis: boolean; 
    overall: boolean 
  }> {
    try {
      const [extractionHealth, enrichmentHealth, analysisHealth] = await Promise.all([
        fetch(getApiUrl.extractionHealth()).then(r => r.ok),
        fetch(getApiUrl.enrichmentHealth()).then(r => r.ok),
        fetch(getApiUrl.analysisHealth()).then(r => r.ok)
      ])

      const overall = extractionHealth && enrichmentHealth && analysisHealth

      return {
        extraction: extractionHealth,
        enrichment: enrichmentHealth, 
        analysis: analysisHealth,
        overall
      }
    } catch (error) {
      console.error('Health check failed:', error)
      return {
        extraction: false,
        enrichment: false,
        analysis: false,
        overall: false
      }
    }
  }
}

// Export singleton instance
export const functionalInvoiceService = new FunctionalInvoiceService()