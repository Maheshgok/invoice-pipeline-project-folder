import { useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { authService } from '../services/auth'

interface UploadedFile {
  id: string
  file: File
  status: 'uploading' | 'processing' | 'completed' | 'error'
  progress: number
  result?: any
  error?: string
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
}

export const useMultiUpload = () => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])

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

  const processFile = useCallback(async (uploadedFile: UploadedFile) => {
    try {
      // Step 1: Prepare for processing
      updateFileProgress(uploadedFile.id, 'uploading', 25)
      
      // Get auth token first
      const idToken = await authService.getIdToken()
      if (!idToken) {
        throw new Error('Authentication required')
      }

      updateFileProgress(uploadedFile.id, 'uploading', 50)

      // Step 2: Call API with file info (for now, just send filename for mock processing)
      const response = await fetch('/api/process-invoice', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileName: uploadedFile.file.name,
          fileSize: uploadedFile.file.size,
          fileType: uploadedFile.file.type
        }),
      })

      updateFileProgress(uploadedFile.id, 'processing', 75)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to process file')
      }

      const result = await response.json()
      
      updateFileProgress(uploadedFile.id, 'completed', 100)
      setFileResult(uploadedFile.id, result)

      // Generate journal entries from the invoice data
      if (result.extractedData) {
        const journalEntry = generateJournalEntry(result.extractedData, uploadedFile.file.name)
        setJournalEntries(prev => [...prev, journalEntry])
      }

      toast.success(`Processed: ${uploadedFile.file.name}`)
    } catch (error: any) {
      updateFileProgress(uploadedFile.id, 'error', 0)
      setFileError(uploadedFile.id, error.message)
      toast.error(`Error processing ${uploadedFile.file.name}: ${error.message}`)
    }
  }, [updateFileProgress, setFileResult, setFileError])

  const generateJournalEntry = (extractedData: any, fileName: string): JournalEntry => {
    const invoiceDate = extractedData.invoiceDate || new Date().toISOString().split('T')[0]
    const totalAmount = parseFloat(extractedData.totalAmount || '0')
    const vendorName = extractedData.vendorName || 'Unknown Vendor'
    const invoiceNumber = extractedData.invoiceNumber || fileName.replace(/\.[^/.]+$/, "")

    return {
      id: `journal_${Date.now()}_${Math.random()}`,
      invoiceId: extractedData.id || invoiceNumber,
      date: invoiceDate,
      accountName: `Purchases - ${vendorName}`,
      accountCode: '5000', // Default purchases account code
      description: `Invoice from ${vendorName} - ${invoiceNumber}`,
      debitAmount: totalAmount, // Debit purchases
      creditAmount: 0,
      reference: invoiceNumber
    }
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
      'Debit Amount', 'Credit Amount', 'Reference'
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
        `"${entry.reference.replace(/"/g, '""')}"`
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

  return {
    uploadedFiles,
    journalEntries,
    addFile,
    removeFile,
    updateJournalEntry,
    downloadCSV
  }
}
