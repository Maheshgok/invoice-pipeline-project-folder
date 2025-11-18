import { useState, useCallback, useEffect } from 'react'
import toast from 'react-hot-toast'
import { authService } from '../services/auth'
import { firestoreService, InvoiceProcessingResult, JournalEntryData } from '../services/firestore'

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

export const useMultiUpload = () => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [activeJobIds, setActiveJobIds] = useState<string[]>([])
  const [invoiceResults, setInvoiceResults] = useState<InvoiceProcessingResult[]>([])

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

  // Set up real-time Firestore listeners
  useEffect(() => {
    if (activeJobIds.length > 0) {
      // Listen to invoice processing results
      firestoreService.listenToInvoiceResults(
        activeJobIds,
        (results) => {
          setInvoiceResults(results)
          // Update file statuses based on results
          setUploadedFiles(prev => prev.map(file => {
            const result = results.find(r => r.jobId === file.jobId)
            if (result) {
              return {
                ...file,
                status: result.status,
                progress: result.progress,
                result: result,
                error: result.error
              }
            }
            return file
          }))
        },
        (error) => {
          console.error('Invoice results listener error:', error)
          toast.error('Real-time updates failed')
        }
      )

      // Listen to journal entries
      const invoiceIds = invoiceResults.map(r => r.id).filter(Boolean)
      if (invoiceIds.length > 0) {
        firestoreService.listenToJournalEntries(
          invoiceIds,
          (entries) => {
            // Convert Firestore entries to JournalEntry format
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
          },
          (error) => {
            console.error('Journal entries listener error:', error)
          }
        )
      }
    }

    // Cleanup listeners on unmount
    return () => {
      firestoreService.cleanup()
    }
  }, [activeJobIds, invoiceResults])

  const processFile = useCallback(async (uploadedFile: UploadedFile) => {
    try {
      // Step 1: Get authentication token
      const idToken = await authService.getIdToken()
      if (!idToken) {
        throw new Error('Authentication required')
      }

      updateFileProgress(uploadedFile.id, 'uploading', 20)

      // Step 2: Upload file to GCP initial-api (your existing Cloud Run service)
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
        const errorData = await uploadResponse.json()
        throw new Error(errorData.error || 'Upload failed')
      }

      const uploadResult = await uploadResponse.json()
      const jobId = uploadResult.job_id

      // Step 3: Update file with job ID and set to processing
      setUploadedFiles(prev => prev.map(file => 
        file.id === uploadedFile.id 
          ? { ...file, jobId, status: 'processing', progress: 30 }
          : file
      ))

      // Step 4: Add job ID to active jobs for real-time monitoring
      setActiveJobIds(prev => [...prev, jobId])

      // Step 5: Trigger queue processing
      const queueResponse = await fetch('https://queue-processor-812016027146.asia-south1.run.app/add-job', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          job_id: jobId,
          bucket_path: uploadResult.bucket_path,
          gcs_path: uploadResult.gcsPath,
          filename: uploadedFile.file.name,
          user_email: authService.getCurrentUser()?.email
        })
      })

      if (!queueResponse.ok) {
        const errorData = await queueResponse.json()
        throw new Error(errorData.error || 'Queue processing failed')
      }

      updateFileProgress(uploadedFile.id, 'processing', 50)
      toast.success(`Started processing: ${uploadedFile.file.name}`)
      
      // Real-time updates will handle completion via Firestore listeners
      
    } catch (error: any) {
      updateFileProgress(uploadedFile.id, 'error', 0)
      setFileError(uploadedFile.id, error.message)
      toast.error(`Error processing ${uploadedFile.file.name}: ${error.message}`)
    }
  }, [updateFileProgress, setFileError])

  const generateJournalEntries = (extractedData: any, fileName: string): JournalEntry[] => {
    // Handle new IndAS format with proper double-entry bookkeeping
    if (extractedData.double_entry_bookkeeping?.journal_entry_set?.[0]?.entries) {
      const journalSet = extractedData.double_entry_bookkeeping.journal_entry_set[0]
      
      // Create individual journal entries for each account in the double-entry set
      return journalSet.entries.map((entry: any, index: number) => ({
        id: `journal_${Date.now()}_${index}_${Math.random()}`,
        invoiceId: extractedData.id || extractedData.invoice_number,
        date: entry.date || extractedData.invoice_date || new Date().toLocaleDateString('en-IN').replace(/\//g, '-'),
        accountName: entry.account_name,
        accountCode: entry.account_code || '',
        description: entry.narration || `${extractedData.vendor_name} - ${extractedData.invoice_number}`,
        debitAmount: entry.debit_amount || 0,
        creditAmount: entry.credit_amount || 0,
        reference: extractedData.invoice_number || fileName.replace(/\.[^/.]+$/, ""),
        vendor: extractedData.vendor_name,
        totalAmount: extractedData.total_amount,
        taxableAmount: extractedData.tax_details?.taxable_amount,
        gstAmount: extractedData.tax_details?.total_gst,
        isBalanced: journalSet.is_balanced
      }))
    }
    
    // Fallback to legacy format - create basic double entry
    const invoiceDate = extractedData.invoice_date || extractedData.invoiceDate || new Date().toISOString().split('T')[0]
    const totalAmount = parseFloat(extractedData.total_amount || extractedData.totalAmount || '0')
    const vendorName = extractedData.vendor_name || extractedData.vendorName || 'Unknown Vendor'
    const invoiceNumber = extractedData.invoice_number || extractedData.invoiceNumber || fileName.replace(/\.[^/.]+$/, "")

    return [
      {
        id: `journal_${Date.now()}_0_${Math.random()}`,
        invoiceId: extractedData.id || invoiceNumber,
        date: invoiceDate,
        accountName: `Purchases - ${vendorName}`,
        accountCode: '6001',
        description: `Invoice from ${vendorName} - ${invoiceNumber}`,
        debitAmount: totalAmount,
        creditAmount: 0,
        reference: invoiceNumber,
        vendor: vendorName,
        totalAmount: totalAmount
      },
      {
        id: `journal_${Date.now()}_1_${Math.random()}`,
        invoiceId: extractedData.id || invoiceNumber,
        date: invoiceDate,
        accountName: `Accounts Payable - ${vendorName}`,
        accountCode: '2001',
        description: `Invoice from ${vendorName} - ${invoiceNumber}`,
        debitAmount: 0,
        creditAmount: totalAmount,
        reference: invoiceNumber,
        vendor: vendorName,
        totalAmount: totalAmount
      }
    ]
  }

  const addFile = useCallback((file: File) => {
    const uploadedFile: UploadedFile = {
      id: `${Date.now()}-${Math.random()}`,
      file,
      status: 'uploading',
      progress: 0
    }

    setUploadedFiles(prev => [...prev, uploadedFile])
    processFile(uploadedFile)
  }, [processFile])

  const removeFile = useCallback((fileId: string) => {
    setUploadedFiles(prev => prev.filter(file => file.id !== fileId))
  }, [])

  const updateJournalEntry = useCallback((id: string, field: string, value: any) => {
    setJournalEntries(prev =>
      prev.map(entry =>
        entry.id === id ? { ...entry, [field]: value } : entry
      )
    )
  }, [])

  const downloadCSV = useCallback(() => {
    if (journalEntries.length === 0) {
      toast.error('No data to export')
      return
    }

    const headers = [
      'Date', 'Account Name', 'Account Code', 'Description', 
      'Debit Amount', 'Credit Amount', 'Reference', 'Vendor', 
      'Total Amount', 'Taxable Amount', 'GST Amount', 'Balanced'
    ]

    const csvContent = [
      headers.join(','),
      ...journalEntries.map(entry => [
        entry.date,
        `"${entry.accountName.replace(/"/g, '""')}"`,
        entry.accountCode,
        `"${entry.description.replace(/"/g, '""')}"`,
        entry.debitAmount,
        entry.creditAmount,
        `"${entry.reference.replace(/"/g, '""')}"`,
        `"${(entry.vendor || '').replace(/"/g, '""')}"`,
        entry.totalAmount || 0,
        entry.taxableAmount || 0,
        entry.gstAmount || 0,
        entry.isBalanced ? 'Yes' : 'No'
      ].join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `journal_entries_${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
    toast.success('CSV downloaded successfully')
  }, [journalEntries])

  const clearAll = useCallback(() => {
    firestoreService.cleanup()
    setUploadedFiles([])
    setJournalEntries([])
    setActiveJobIds([])
    setInvoiceResults([])
  }, [])

  return {
    uploadedFiles,
    journalEntries,
    invoiceResults,
    addFile,
    removeFile,
    updateJournalEntry,
    downloadCSV,
    clearAll
  }
}
