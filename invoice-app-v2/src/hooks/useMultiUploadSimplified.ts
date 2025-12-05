/**
 * Simplified Multi-Upload Hook
 * Uses modular services for better separation of concerns
 * Fixes batch tracking and download button issues
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { authService } from '../services/auth'
import { archiveService } from '../services/archive'
import { BatchManager, type BatchFile, type BatchState } from '../services/batch-manager'
import { FirestoreSyncManager, type JournalEntry } from '../services/firestore-sync-manager'

export const useMultiUploadSimplified = () => {
  // Core state
  const [batchState, setBatchState] = useState<BatchState>({
    files: [],
    totalFiles: 0,
    completedFiles: 0,
    processingFiles: 0,
    errorFiles: 0,
    isComplete: false,
    readyForDownload: false
  })
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [isInitialized, setIsInitialized] = useState(false)

  // Service instances (using refs to maintain consistency)
  const batchManager = useRef<BatchManager | null>(null)
  const syncManager = useRef<FirestoreSyncManager | null>(null)

  // Initialize services
  useEffect(() => {
    if (!batchManager.current) {
      batchManager.current = new BatchManager()
      console.log('📦 Batch manager initialized')
    }

    if (!syncManager.current && batchManager.current) {
      syncManager.current = new FirestoreSyncManager(batchManager.current)
      console.log('🔥 Firestore sync manager initialized')
    }

    setIsInitialized(true)
  }, [])

  // Subscribe to batch state changes
  useEffect(() => {
    if (!batchManager.current || !isInitialized) return

    const unsubscribe = batchManager.current.subscribe((state) => {
      setBatchState(state)
      console.log('📊 Batch state updated:', {
        total: state.totalFiles,
        completed: state.completedFiles,
        processing: state.processingFiles,
        readyForDownload: state.readyForDownload
      })
    })

    return unsubscribe
  }, [isInitialized])

  // Subscribe to journal entry changes
  useEffect(() => {
    if (!syncManager.current || !isInitialized) return

    const unsubscribe = syncManager.current.subscribeToJournalEntries((entries) => {
      setJournalEntries(entries)
      console.log('📋 Journal entries updated:', entries.length)
    })

    return unsubscribe
  }, [isInitialized])

  // Start Firestore listeners on first upload
  const startFirestoreListening = useCallback(() => {
    if (syncManager.current && !syncManager.current.getStats().isListening) {
      console.log('🚀 Starting Firestore listening (triggered by first upload)')
      syncManager.current.startListening()
    }
  }, [])

  // Process a single file
  const processFile = useCallback(async (file: File): Promise<void> => {
    if (!batchManager.current) {
      throw new Error('Batch manager not initialized')
    }

    const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Add file to batch
    const batchFile: BatchFile = {
      id: fileId,
      fileName: file.name,
      status: 'uploading',
      progress: 0
    }
    batchManager.current.addFile(batchFile)

    try {
      // Get authentication token
      const idToken = await authService.getIdToken()
      if (!idToken) {
        throw new Error('Authentication required')
      }

      // Update progress
      batchManager.current.updateFile(fileId, { status: 'uploading', progress: 20 })

      // Health check
      const healthCheck = await fetch('https://initial-api-812016027146.asia-south1.run.app/health', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${idToken}` }
      })

      if (!healthCheck.ok) {
        throw new Error(`Service unavailable: ${healthCheck.status}`)
      }

      // Upload file
      const formData = new FormData()
      formData.append('file', file)

      const uploadResponse = await fetch('https://initial-api-812016027146.asia-south1.run.app/upload_invoice', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}` },
        body: formData
      })

      if (!uploadResponse.ok) {
        let errorMessage = `Upload failed: ${uploadResponse.status}`
        
        try {
          const errorData = await uploadResponse.json()
          errorMessage = errorData.error || errorMessage
        } catch {
          if (uploadResponse.status === 502) {
            errorMessage = 'Service unavailable (502)'
          } else if (uploadResponse.status === 503) {
            errorMessage = 'Service temporarily unavailable (503)'
          }
        }
        throw new Error(errorMessage)
      }

      const uploadResult = await uploadResponse.json()
      const jobId = uploadResult.job_id

      console.log('🎯 Upload successful:', { jobId, fileName: file.name })

      // Update file with job ID and set to processing
      batchManager.current.updateFile(fileId, {
        jobId,
        status: 'processing',
        progress: 50
      })

      // Start Firestore listening on first upload
      startFirestoreListening()

      toast.success(`Uploaded: ${file.name}`)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      
      batchManager.current.updateFile(fileId, {
        status: 'error',
        progress: 0,
        error: errorMessage
      })

      toast.error(`Upload failed: ${errorMessage}`)
      throw error
    }
  }, [startFirestoreListening])

  // Upload multiple files
  const uploadFiles = useCallback(async (files: FileList): Promise<void> => {
    const fileArray = Array.from(files)
    
    // Validate files
    const validFiles = fileArray.filter(file => {
      if (file.type.includes('image') || file.type === 'application/pdf') {
        return true
      } else {
        toast.error(`Unsupported file type: ${file.name}`)
        return false
      }
    })

    if (validFiles.length === 0) {
      toast.error('No valid files to upload')
      return
    }

    // Process files sequentially to avoid overwhelming the service
    for (const file of validFiles) {
      try {
        await processFile(file)
      } catch (error) {
        console.error(`Failed to process ${file.name}:`, error)
        // Continue with other files even if one fails
      }
    }

    toast.success(`Started processing ${validFiles.length} files`)
  }, [processFile])

  // Remove file from batch
  const removeFile = useCallback((fileId: string) => {
    if (batchManager.current) {
      batchManager.current.removeFile(fileId)
      toast.success('File removed from batch')
    }
  }, [])

  // Update journal entry
  const updateJournalEntry = useCallback((entryId: string, field: string, value: any) => {
    if (syncManager.current) {
      syncManager.current.updateJournalEntry(entryId, field, value)
      toast.success('Journal entry updated')
    }
  }, [])

  // Download CSV
  const downloadCSV = useCallback(async () => {
    if (!batchState.readyForDownload) {
      toast.error('⏳ Please wait for all files to complete processing')
      return
    }

    if (journalEntries.length === 0) {
      toast.error('No journal entries to download')
      return
    }

    try {
      console.log('📥 Starting CSV download...')
      
      // Archive completed results after download
      try {
        const result = await archiveService.archiveCompletedResults()
        if (result.archived_count > 0) {
          console.log(`📦 Archived ${result.archived_count} completed results`)
        }
      } catch (archiveError) {
        console.error('❌ Archive after download failed:', archiveError)
        // Don't fail the download if archive fails
      }

      // Create CSV content
      const headers = [
        'Date', 'Account Name', 'Account Code', 'Description',
        'Debit Amount', 'Credit Amount', 'Reference', 'Vendor'
      ]

      const csvContent = [
        headers.join(','),
        ...journalEntries.map(entry => [
          entry.date,
          `"${entry.accountName}"`,
          entry.accountCode,
          `"${entry.description}"`,
          entry.debitAmount,
          entry.creditAmount,
          `"${entry.reference}"`,
          `"${entry.vendor || ''}"`
        ].join(','))
      ].join('\n')

      // Download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      
      link.setAttribute('href', url)
      link.setAttribute('download', `journal_entries_${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success(`📥 Downloaded ${journalEntries.length} journal entries`)

    } catch (error) {
      console.error('❌ Download failed:', error)
      toast.error('Failed to download CSV')
    }
  }, [batchState.readyForDownload, journalEntries])

  // Mark all as displayed
  const markAllDisplayed = useCallback(async () => {
    if (syncManager.current) {
      try {
        await syncManager.current.markAllDisplayed()
        toast.success('All results marked as displayed')
      } catch (error) {
        console.error('❌ Failed to mark as displayed:', error)
        toast.error('Failed to mark results as displayed')
      }
    }
  }, [])

  // Archive completed results
  const archiveCompletedResults = useCallback(async () => {
    try {
      const result = await archiveService.archiveCompletedResults()
      
      if (result.archived_count > 0) {
        toast.success(`📦 Archived ${result.archived_count} completed results`)
      } else {
        toast('No completed results to archive', { icon: '📭' })
      }
      
      return result
    } catch (error) {
      console.error('❌ Archive failed:', error)
      toast.error('Failed to archive completed results')
      throw error
    }
  }, [])

  // Clear all
  const clearAll = useCallback(() => {
    if (batchManager.current) {
      batchManager.current.clear()
    }
    if (syncManager.current) {
      syncManager.current.reset()
    }
    toast.success('Cleared all files and entries')
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (syncManager.current) {
        syncManager.current.stopListening()
      }
    }
  }, [])

  return {
    // State
    uploadedFiles: batchState.files,
    journalEntries,
    batchState,
    isInitialized,

    // Actions
    uploadFiles,
    removeFile,
    updateJournalEntry,
    downloadCSV,
    markAllDisplayed,
    archiveCompletedResults,
    clearAll,

    // Computed state
    isBatchReadyForDownload: () => batchState.readyForDownload,
    getBatchStats: () => batchManager.current?.getStats() || { total: 0, completed: 0, processing: 0, errors: 0, completionRate: 0 },
    
    // Access to services for advanced functionality
    syncManager: syncManager.current
  }
}