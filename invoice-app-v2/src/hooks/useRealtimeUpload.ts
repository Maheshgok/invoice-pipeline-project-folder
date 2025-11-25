import { useState, useCallback, useEffect } from 'react'
import toast from 'react-hot-toast'
import { authService } from '../services/auth'
import { realtimeFirestoreService } from '../services/firestore-realtime'
import type { InvoiceProcessingResult } from '../services/firestore-realtime'

interface UploadedFile {
  id: string
  file: File
  status: 'uploading' | 'processing' | 'completed' | 'error' | 'displayed'
  progress: number
  result?: InvoiceProcessingResult
  error?: string
  jobId?: string
}

interface JournalEntry {
  id: string
  invoiceId: string
  date: string
  accountName: string
  accountCode: string
  description: string
  debitAmount: number
  creditAmount: number
  reference: string
  vendor?: string
  totalAmount?: number
  taxableAmount?: number
  gstAmount?: number
  isBalanced?: boolean
}

export const useRealtimeUpload = () => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [allInvoiceResults, setAllInvoiceResults] = useState<InvoiceProcessingResult[]>([])
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [processedJobIds, setProcessedJobIds] = useState<Set<string>>(new Set())
  const [hasActiveUploads, setHasActiveUploads] = useState(false)
  const [listenersActive, setListenersActive] = useState(false)

  const updateFileProgress = useCallback((fileId: string, status: UploadedFile['status'], progress: number) => {
    setUploadedFiles(prev =>
      prev.map(file =>
        file.id === fileId ? { ...file, status, progress } : file
      )
    )
  }, [])

  const setFileResult = useCallback((fileId: string, result: any) => {
    setUploadedFiles(prev =>
      prev.map(file =>
        file.id === fileId ? { ...file, result } : file
      )
    )
  }, [])

  const setFileError = useCallback((fileId: string, error: string) => {
    setUploadedFiles(prev =>
      prev.map(file =>
        file.id === fileId ? { ...file, error } : file
      )
    )
  }, [])

  // Mark results as displayed to prevent future notifications
  const markAsDisplayed = useCallback(async (jobIds: string[]) => {
    try {
      await realtimeFirestoreService.markAsDisplayed(jobIds)
      console.log('📤 Marked as displayed:', jobIds)
    } catch (error) {
      console.error('❌ Failed to mark as displayed:', error)
    }
  }, [])

  // Mark all completed results as displayed
  const markAllDisplayed = useCallback(async () => {
    const completedJobIds = allInvoiceResults
      .filter(result => result.status === 'completed' && result.jobId && result.frontendStatus !== 'displayed')
      .map(result => result.jobId!)
    
    if (completedJobIds.length > 0) {
      await markAsDisplayed(completedJobIds)
      toast.success(`🏠 Marked ${completedJobIds.length} results as displayed`)
    } else {
      toast.success('📋 No new results to mark as displayed')
    }
  }, [allInvoiceResults, markAsDisplayed])

  // Function to start listeners on-demand (after first upload)
  const startRealtimeListeners = useCallback(() => {
    if (listenersActive) {
      console.log('🔥 Real-time listeners already active')
      return
    }

    const user = authService.getCurrentUser()
    if (!user) {
      console.log('⚠️ Cannot start listeners - user not authenticated')
      return
    }

    console.log('🚀 STARTING real-time listeners after upload for:', user.email)
    setListenersActive(true)
    
    // ⚡ Tier 1: Active processing results (real-time, small dataset)
    realtimeFirestoreService.listenToActiveResults(
      (activeResults) => {
        console.log('🎨 Active results update:', activeResults.length, 'active items')
        
        // Extract journal entries from active results only
        const entries = realtimeFirestoreService.extractJournalEntriesFromResults(activeResults)
        const journalEntries = entries.map(entry => ({
          id: entry.id,
          invoiceId: entry.invoiceId,
          date: entry.date,
          accountName: entry.accountName,
          accountCode: entry.accountCode,
          description: entry.narration,
          debitAmount: entry.debitAmount,
          creditAmount: entry.creditAmount,
          reference: entry.invoiceNumber,
          vendor: entry.vendor
        }))
        
        // Update state with active results
        setAllInvoiceResults(activeResults)
        setJournalEntries(journalEntries)
        
        // Handle notifications for NEW active results only
        if (isInitialLoad) {
          console.log('📚 Initial active load - skipping notifications')
          setIsInitialLoad(false)
          const existingJobIds = new Set(activeResults.map(r => r.jobId).filter((jobId): jobId is string => Boolean(jobId)))
          setProcessedJobIds(existingJobIds)
        } else {
          // Only notify for truly new active results
          activeResults.forEach(result => {
            if (result.jobId && !processedJobIds.has(result.jobId)) {
              if (result.status === 'completed') {
                toast.success(`✅ Invoice processed: ${result.fileName}`)
                console.log('🎉 NEW completion notification for:', result.jobId)
              }
              setProcessedJobIds((prev: Set<string>) => new Set(prev).add(result.jobId!))
            }
          })
        }
      },
      (error) => {
        console.error('❌ Active results listener error:', error)
        toast.error('Unable to get real-time updates for active processing')
      }
    )
  }, [listenersActive, isInitialLoad, processedJobIds])

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      if (listenersActive) {
        console.log('🧹 Cleaning up real-time listeners on unmount...')
        realtimeFirestoreService.cleanup()
      }
    }
  }, [listenersActive]) // Empty dependency array - set up once on mount

  const processFile = useCallback(async (uploadedFile: UploadedFile) => {
    try {
      // Step 1: Get authentication token
      const idToken = await authService.getIdToken()
      if (!idToken) {
        throw new Error('Authentication required')
      }

      updateFileProgress(uploadedFile.id, 'uploading', 20)

      // Step 2: Health check
      try {
        const healthCheck = await fetch('https://initial-api-812016027146.asia-south1.run.app/health', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${idToken}` }
        })
        
        if (!healthCheck.ok) {
          throw new Error(`Cloud Run service health check failed: ${healthCheck.status}`)
        }
        console.log('✅ Cloud Run service is healthy')
      } catch (healthError) {
        console.error('❌ Cloud Run service health check failed:', healthError)
        throw new Error('Cloud Run service is not responding. Please check if the service is running.')
      }

      // Step 3: Upload file to initial-api
      const formData = new FormData()
      formData.append('file', uploadedFile.file)

      const uploadResponse = await fetch('https://initial-api-812016027146.asia-south1.run.app/upload_invoice', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`
        },
        body: formData
      })

      if (!uploadResponse.ok) {
        console.error('Upload failed:', uploadResponse.status, uploadResponse.statusText)
        let errorMessage = `Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`
        
        try {
          const errorData = await uploadResponse.json()
          errorMessage = errorData.error || errorMessage
        } catch (jsonError) {
          const errorText = await uploadResponse.text()
          console.error('Non-JSON error response:', errorText.substring(0, 500))
          if (uploadResponse.status === 502) {
            errorMessage = 'Cloud Run service unavailable (502). Service may be starting up or down.'
          } else if (uploadResponse.status === 503) {
            errorMessage = 'Cloud Run service temporarily unavailable (503). Please try again.'
          } else {
            errorMessage = `Service error (${uploadResponse.status}). Please check if the Cloud Run service is running.`
          }
        }
        throw new Error(errorMessage)
      }

      const uploadResult = await uploadResponse.json()
      const jobId = uploadResult.job_id

      console.log('🎯 Upload response:', uploadResult)
      console.log('🆔 Job ID received from backend:', jobId)

      // Step 4: Update file with job ID and set to processing
      setUploadedFiles(prev => prev.map(file => 
        file.id === uploadedFile.id 
          ? { ...file, jobId, status: 'processing', progress: 30 }
          : file
      ))

      // Step 5: Track this job ID for real-time updates
      realtimeFirestoreService.trackJobIds([jobId])

      // Step 6: Trigger queue processing with job ID from initial-api
      const queueResponse = await fetch('https://queue-processor-812016027146.asia-south1.run.app/process-file', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bucket_path: uploadResult.bucket_path,
          gcs_path: uploadResult.gcsPath,
          filename: uploadedFile.file.name,
          job_id: jobId  // Pass the production job ID from initial-api
        })
      })

      if (!queueResponse.ok) {
        throw new Error(`Queue processing failed: ${queueResponse.status}`)
      }

      const queueResult = await queueResponse.json()
      console.log('🔄 Queue response:', queueResult)

      updateFileProgress(uploadedFile.id, 'processing', 50)
      toast.success('File uploaded and processing started!')

      // Real-time listener will handle the rest automatically!

    } catch (error) {
      console.error('❌ File processing error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      updateFileProgress(uploadedFile.id, 'error', 0)
      setFileError(uploadedFile.id, errorMessage)
      toast.error(`Upload failed: ${errorMessage}`)
    }
  }, [updateFileProgress, setFileError])

  const uploadFiles = useCallback(async (files: FileList) => {
    const newFiles: UploadedFile[] = Array.from(files).map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      status: 'uploading' as const,
      progress: 0
    }))

    setUploadedFiles(prev => [...prev, ...newFiles])
    setHasActiveUploads(true)
    
    // 🚀 START real-time listeners after first upload
    if (!listenersActive) {
      console.log('🎯 First upload detected - starting real-time listeners')
      startRealtimeListeners()
    }

    // Process files one by one
    for (const file of newFiles) {
      await processFile(file)
    }
  }, [processFile, listenersActive, startRealtimeListeners])

  const removeFile = useCallback((fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId))
  }, [])

  const clearAll = useCallback(() => {
    setUploadedFiles([])
    setJournalEntries([])
  }, [])

  const downloadCSV = useCallback(() => {
    if (journalEntries.length === 0) {
      toast.error('No journal entries to download')
      return
    }

    // Create CSV content
    const headers = ['Date', 'Account Name', 'Account Code', 'Description', 'Debit Amount', 'Credit Amount', 'Reference', 'Vendor']
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

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `journal_entries_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    toast.success(`Downloaded ${journalEntries.length} journal entries`)
  }, [journalEntries])

  const updateJournalEntry = useCallback((entryId: string, field: string, value: any) => {
    setJournalEntries(prev => prev.map(entry => 
      entry.id === entryId 
        ? { ...entry, [field]: value }
        : entry
    ))
    toast.success('Journal entry updated')
  }, [])

  return {
    uploadedFiles,
    journalEntries,
    allInvoiceResults,
    uploadFiles,
    removeFile,
    clearAll,
    downloadCSV,  // Add downloadCSV to exports
    updateJournalEntry,  // Add updateJournalEntry to exports
    markAsDisplayed,  // Add markAsDisplayed to exports
    markAllDisplayed,  // Add markAllDisplayed to exports
    processFile,
    updateFileProgress,
    setFileResult,
    setFileError
  }
}