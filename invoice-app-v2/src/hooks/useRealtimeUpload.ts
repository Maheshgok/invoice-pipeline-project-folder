import { useState, useCallback, useEffect } from 'react'
import toast from 'react-hot-toast'
import { authService } from '../services/auth'
import { realtimeFirestoreService } from '../services/firestore-realtime'
import type { InvoiceProcessingResult } from '../services/firestore-realtime'

interface UploadedFile {
  id: string
  file: File
  status: 'uploading' | 'processing' | 'completed' | 'error'
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

  // Set up real-time listener for ALL user results
  useEffect(() => {
    console.log('🔥 Setting up REAL-TIME Firestore listener for all user results...')
    
    // Wait for user authentication before setting up listener
    const setupListener = () => {
      const user = authService.getCurrentUser()
      if (!user) {
        console.log('⏳ User not authenticated yet, waiting...')
        setTimeout(setupListener, 1000) // Retry in 1 second
        return
      }
      
      console.log('✅ User authenticated, setting up real-time listener for:', user.email)
      
      realtimeFirestoreService.listenToAllUserResults(
        (results) => {
          console.log('📡 Real-time update received:', results.length, 'results')
          setAllInvoiceResults(results)
        
        // Extract and set journal entries
        const entries = realtimeFirestoreService.extractJournalEntriesFromResults(results)
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
        setJournalEntries(journalEntries)
        
        // Update file statuses based on real-time results
        setUploadedFiles(prev => prev.map(file => {
          if (!file.jobId) return file
          
          const result = results.find(r => r.jobId === file.jobId)
          if (result) {
            console.log(`📄 Updating file ${file.id} status:`, {
              oldStatus: file.status,
              newStatus: result.status,
              progress: result.progress
            })
            
            return {
              ...file,
              status: result.status === 'queued' ? 'processing' : result.status,
              progress: result.progress,
              result: result,
              error: result.error
            }
          }
          return file
        }))
        
        // Show toast notifications for status changes
        results.forEach(result => {
          if (result.status === 'completed') {
            toast.success(`✅ Invoice processed: ${result.fileName}`)
          } else if (result.status === 'error') {
            toast.error(`❌ Processing failed: ${result.fileName}`)
          }
        })
        },
        (error) => {
          console.error('❌ Real-time listener error:', error)
          toast.error('Unable to get real-time updates')
        }
      )
    }
    
    setupListener()    // Cleanup on unmount
    return () => {
      console.log('🧹 Cleaning up real-time listeners...')
      realtimeFirestoreService.cleanup()
    }
  }, []) // Empty dependency array - set up once on mount

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

    // Process files one by one
    for (const file of newFiles) {
      await processFile(file)
    }
  }, [processFile])

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
    processFile,
    updateFileProgress,
    setFileResult,
    setFileError
  }
}