import { useState, useCallback, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Upload, Download, FileText, CheckCircle, Clock, AlertCircle, X, LogOut, User, Eye, Archive, Edit3 } from 'lucide-react'
import toast from 'react-hot-toast'
// Import the new simplified hook
import { useMultiUploadSimplified } from '../hooks/useMultiUploadSimplified'
import { authService } from '../services/auth'

const MultiUploadDashboard: React.FC = () => {
  const { user, logout } = useAuth()
  const { 
    uploadedFiles, 
    journalEntries,
    batchState,
    isInitialized,
    uploadFiles,
    removeFile, 
    clearAll,
    downloadCSV,
    updateJournalEntry,
    markAllDisplayed,
    archiveCompletedResults,
    isBatchReadyForDownload,
    getBatchStats,
    // Access to sync manager for document URLs
    syncManager
  } = useMultiUploadSimplified()
  
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [isEditingMode, setIsEditingMode] = useState(false)
  const [currentEditingInvoiceId, setCurrentEditingInvoiceId] = useState<string | null>(null)
  const [selectedDocumentUrl, setSelectedDocumentUrl] = useState<string | null>(null)
  const [isUploadDrawerOpen, setIsUploadDrawerOpen] = useState(true)
  const [documentLoading, setDocumentLoading] = useState<{ [key: string]: boolean }>({})
  const [documentError, setDocumentError] = useState<{ [key: string]: string }>({})

  const MAX_QUEUE_SIZE = 100

  // Get document URL for a given invoice ID
  const getDocumentUrlForInvoice = useCallback(async (invoiceId: string) => {
    // Access results from the sync manager
    if (syncManager) {
      const results = syncManager.getAllResults()
      const result = results.find(r => r.id === invoiceId || r.jobId === invoiceId)
      if (result?.gcsPath) {
        try {
          // Get authentication token
          const idToken = await authService.getIdToken()
          if (!idToken) {
            console.error('No authentication token available')
            return null
          }
          
          // Call the signed URL endpoint
          const response = await fetch(
            `https://initial-api-812016027146.asia-south1.run.app/signed-url?path=${encodeURIComponent(result.gcsPath)}`,
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
              }
            }
          )
          
          if (!response.ok) {
            console.error(`Failed to get signed URL: ${response.status}`)
            return null
          }
          
          const data = await response.json()
          return data.signed_url
          
        } catch (error) {
          console.error('Error getting signed URL:', error)
          return null
        }
      }
    }
    return null
  }, [syncManager])

  // Handle editing cell - update editing mode and show corresponding document
  const handleCellEdit = useCallback(async (entryId: string, field: string, value: any) => {
    const entry = journalEntries.find(e => e.id === entryId)
    if (entry) {
      setEditingCell(`${entryId}-${field}`)
      setEditValue(String(value))
      setIsEditingMode(true)
      setCurrentEditingInvoiceId(entry.invoiceId)
      
      // Auto-show the document for this entry
      try {
        setSelectedDocumentUrl(null) // Clear previous document
        setDocumentError(null) // Clear any previous errors
        setDocumentLoading(prev => ({ ...prev, [invoiceId]: true })) // Show loading state
        
        const docUrl = await getDocumentUrlForInvoice(entry.invoiceId)
        if (docUrl) {
          setSelectedDocumentUrl(docUrl)
          console.log('✅ Document loaded for invoice:', entry.invoiceId)
        } else {
          setDocumentError('Document not available')
          console.warn('⚠️ No document URL found for invoice:', entry.invoiceId)
        }
      } catch (error) {
        setDocumentError(prev => ({ ...prev, [invoiceId]: 'Failed to load document' }))
        console.error('❌ Error loading document:', error)
      } finally {
        setDocumentLoading(prev => ({ ...prev, [invoiceId]: false }))
      }
    }
  }, [journalEntries, getDocumentUrlForInvoice])

  // Handle cell cancel - exit editing mode if no more edits
  const handleCellCancel = useCallback(() => {
    setEditingCell(null)
    setEditValue('')
    setIsEditingMode(false)
    setCurrentEditingInvoiceId(null)
    setSelectedDocumentUrl(null)
    setDocumentLoading({})
    setDocumentError({})
  }, [])

  // Handle cell save
  const handleCellSave = useCallback((entryId: string, field: string) => {
    updateJournalEntry(entryId, field, editValue)
    setEditingCell(null)
    setEditValue('')
    // Keep editing mode active for potential more edits
    // setIsEditingMode(false) // Don't exit editing mode automatically
  }, [editValue, updateJournalEntry])

  // Helper function to get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'processing':
        return <Clock className="w-4 h-4 text-yellow-500" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      default:
        return <Clock className="w-4 h-4 text-gray-500" />
    }
  }

  // Helper function to get progress color
  const getProgressColor = (progress: number) => {
    if (progress === 100) return 'bg-green-500'
    if (progress > 50) return 'bg-yellow-500'
    return 'bg-blue-500'
  }

  // Get queue statistics
  const queueStats = getBatchStats()

  // Handle drag and drop
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      uploadFiles(files)
    }
  }, [uploadFiles])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files)
      uploadFiles(files)
    }
  }, [uploadFiles])

  // Auto-collapse drawer when all files are processed
  useEffect(() => {
    if (batchState.totalFiles > 0 && batchState.completedFiles === batchState.totalFiles && batchState.processingFiles === 0) {
      // Show success notification
      toast.success('🎉 All files processed! Panel will auto-hide in 2 seconds.', {
        duration: 2000
      })
      
      // Auto-collapse after a short delay when all processing is complete
      const timer = setTimeout(() => {
        setIsUploadDrawerOpen(false)
      }, 2000) // 2 second delay
      return () => clearTimeout(timer)
    }
  }, [batchState.totalFiles, batchState.completedFiles, batchState.processingFiles])

  // Keyboard shortcut to toggle drawer
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ctrl/Cmd + U to toggle upload drawer
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
        e.preventDefault()
        setIsUploadDrawerOpen(prev => !prev)
        toast(isUploadDrawerOpen ? 'Upload panel hidden' : 'Upload panel shown', {
          duration: 1500,
          icon: '📁'
        })
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isUploadDrawerOpen])

  // Show notification when processing starts
  useEffect(() => {
    if (batchState.processingFiles > 0 && isUploadDrawerOpen) {
      toast('💫 Processing files... You can collapse the panel and continue editing.', {
        duration: 3000,
        icon: '💡'
      })
    }
  }, [batchState.processingFiles, isUploadDrawerOpen])

  // Handle window close/refresh - reliable archive trigger
  useEffect(() => {
    if (!user?.email || !isInitialized) return

    // Use pagehide for actual page unload detection
    const handlePageHide = (e: PageTransitionEvent) => {
      // Only archive if page is actually being unloaded (not just cached)
      if (!e.persisted && batchState.completedFiles > 0) {
        console.log('🔄 Page unloading - triggering archive for cleanup...')
        archiveCompletedResults().catch(err => 
          console.error('❌ Page hide archive failed:', err)
        )
      }
    }

    // Conservative beforeunload - only for actual navigation/close
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (batchState.completedFiles > 0) {
        console.log('🔄 Window unloading - triggering archive...')
        archiveCompletedResults().catch(err => 
          console.error('❌ Before unload archive failed:', err)
        )
      }
    }

    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [user?.email, isInitialized, batchState.completedFiles, archiveCompletedResults])

  // Handle user logout - clean up listeners and optionally archive
  useEffect(() => {
    // Only set up logout cleanup if user exists and is initialized
    if (!user?.email || !isInitialized) {
      console.log('🎯 No user or not initialized - skipping archive setup')
      return
    }

    console.log('🔐 Setting up logout cleanup for user:', user.email)

    // Archive on explicit user logout (when auth state changes from authenticated to null)
    return () => {
      console.log('🔄 User state cleanup - checking if archive needed')
      // Only archive if we have data to archive
      if (batchState.completedFiles > 0) {
        console.log('📦 User logout detected - archiving completed results')
        archiveCompletedResults().catch(err => 
          console.error('❌ Logout archive failed:', err)
        )
      }
    }
  }, [user?.email, isInitialized, batchState.completedFiles, archiveCompletedResults])

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Multi-File Invoice Processing Dashboard
          </h1>
          <p className="text-gray-600">
            Upload multiple invoices for batch processing and generate journal entries
          </p>
        </div>
        
        {/* User Menu */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <User className="w-4 h-4" />
            <span>{user?.email}</span>
          </div>
          <button
            onClick={logout}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Drawer-Based Layout */}
      <div className="relative" style={{
        height: 'calc(100vh - 200px)'
      }}>
        
        {/* Upload Drawer */}
        <div className={`absolute top-0 left-0 right-0 z-10 bg-white rounded-lg shadow-lg transition-all duration-300 ease-in-out ${
          isUploadDrawerOpen ? 'translate-y-0' : '-translate-y-full'
        }`} style={{
          transform: isUploadDrawerOpen ? 'translateY(0)' : `translateY(calc(-100% + ${isEditingMode ? '40px' : '60px'}))`
        }}>
          
          {/* Drawer Handle */}
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-b from-transparent to-gray-100 rounded-b-lg">
            <button
              onClick={() => setIsUploadDrawerOpen(!isUploadDrawerOpen)}
              className={`absolute bottom-0 left-1/2 transform -translate-x-1/2 px-6 py-2 text-sm font-medium rounded-t-lg transition-all duration-200 flex items-center space-x-2 ${
                isUploadDrawerOpen 
                  ? 'bg-blue-600 text-white hover:bg-blue-700' 
                  : 'bg-gray-600 text-white hover:bg-gray-700'
              }`}
              style={{ marginBottom: '-1px' }}
            >
              <span>{isUploadDrawerOpen ? '▲ Hide Upload' : '▼ Show Upload'}</span>
              {!isUploadDrawerOpen && (
                <div className="flex items-center space-x-1">
                  {batchState.processingFiles > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 text-xs bg-yellow-400 text-yellow-900 rounded-full animate-bounce font-bold">
                      {batchState.processingFiles}
                    </span>
                  )}
                  {batchState.totalFiles > 0 && (
                    <span className="text-xs bg-white bg-opacity-20 px-2 py-1 rounded-full">
                      {batchState.completedFiles}/{batchState.totalFiles}
                    </span>
                  )}
                </div>
              )}
            </button>
          </div>
          
          {/* Upload Section Content */}
          <div className="p-6 pb-12">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <h2 className="text-xl font-semibold text-gray-800">Upload & Processing</h2>
                {!isUploadDrawerOpen && batchState.totalFiles > 0 && (
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                      {batchState.completedFiles}/{batchState.totalFiles} completed
                    </span>
                    {batchState.processingFiles > 0 && (
                      <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full animate-pulse">
                        {batchState.processingFiles} processing
                      </span>
                    )}
                  </div>
                )}
                {isEditingMode && (
                  <div className="flex items-center space-x-2 text-blue-600">
                    <Edit3 className="w-4 h-4" />
                    <span className="text-sm font-medium">Editing Mode Active</span>
                    <button
                      onClick={() => {
                        setIsEditingMode(false)
                        setCurrentEditingInvoiceId(null)
                        setSelectedDocumentUrl(null)
                        setEditingCell(null)
                      }}
                      className="px-3 py-1 text-xs bg-blue-100 hover:bg-blue-200 rounded-full"
                    >
                      Exit Editing
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-500">
                  {uploadedFiles.length}/{MAX_QUEUE_SIZE} files
                </span>
                {batchState.totalFiles > 0 && (
                  <button
                    onClick={() => setIsUploadDrawerOpen(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    title="Collapse upload panel"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Upload Zone */}
            <div className="lg:col-span-2">
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  dragActive 
                    ? 'border-blue-400 bg-blue-50' 
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                <p className="text-sm font-medium text-gray-900 mb-1">
                  Drop files here or click to upload
                </p>
                <p className="text-xs text-gray-500 mb-3">
                  Supports PDF and image files (PNG, JPG, JPEG)
                </p>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleFileInput}
                  className="hidden"
                  id="file-input"
                />
                <label
                  htmlFor="file-input"
                  className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
                >
                  Choose Files
                </label>
              </div>
              
              {/* Queue Statistics */}
              <div className="mt-4 grid grid-cols-4 gap-3 text-center">
                <div className="bg-blue-50 rounded-lg p-2">
                  <div className="text-lg font-bold text-blue-600">{queueStats.total}</div>
                  <div className="text-xs text-blue-600">Total</div>
                </div>
                <div className="bg-green-50 rounded-lg p-2">
                  <div className="text-lg font-bold text-green-600">{queueStats.completed}</div>
                  <div className="text-xs text-green-600">Completed</div>
                </div>
                <div className="bg-yellow-50 rounded-lg p-2">
                  <div className="text-lg font-bold text-yellow-600">{queueStats.processing}</div>
                  <div className="text-xs text-yellow-600">Processing</div>
                </div>
                <div className="bg-red-50 rounded-lg p-2">
                  <div className="text-lg font-bold text-red-600">{queueStats.errors}</div>
                  <div className="text-xs text-red-600">Errors</div>
                </div>
              </div>
            </div>
            
            {/* Processing Queue */}
            <div className="">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Processing Queue</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {uploadedFiles.length === 0 ? (
                  <div className="text-center py-4 text-gray-500">
                    <FileText className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                    <p className="text-xs">No files in queue</p>
                  </div>
                ) : (
                  uploadedFiles.map((file) => (
                    <div key={file.id} className="flex items-center space-x-2 p-2 bg-gray-50 rounded-lg">
                      <div className="flex-shrink-0">
                        {getStatusIcon(file.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 truncate">
                          {file.fileName}
                        </p>
                        <div className="mt-1 bg-gray-200 rounded-full h-1">
                          <div 
                            className={`h-1 rounded-full transition-all duration-300 ${getProgressColor(file.progress)}`}
                            style={{ width: `${file.progress}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-xs text-gray-500">
                        {file.progress}%
                      </div>
                      <button
                        onClick={() => removeFile(file.id)}
                        className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Floating Upload Button (when drawer is closed) - SIMPLIFIED FOR TESTING */}
        {!isUploadDrawerOpen && (
          <div className="fixed top-4 right-4 z-20">
            <button
              onClick={() => setIsUploadDrawerOpen(true)}
              className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg"
            >
              <Upload className="w-4 h-4 mr-2" />
              Show Upload
            </button>
          </div>
        )}
        )}

        {/* Results Section - positioned below drawer */}
        <div className={`bg-white rounded-lg shadow-lg transition-all duration-300 ${
          isEditingMode ? 'ring-4 ring-blue-300 shadow-2xl' : ''
        }`} style={{
          marginTop: isUploadDrawerOpen ? (isEditingMode ? '320px' : '380px') : (isEditingMode ? '50px' : '70px'),
          height: isUploadDrawerOpen 
            ? `calc(100% - ${isEditingMode ? '330px' : '390px'})` 
            : `calc(100% - ${isEditingMode ? '60px' : '80px'})`
        }}>
          <div className="p-6 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <h2 className="text-xl font-semibold text-gray-800">Results & Journal Entries</h2>
                {isEditingMode && currentEditingInvoiceId && (
                  <div className="flex items-center space-x-2 text-blue-600">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    <span className="text-sm font-medium">Editing Invoice: {currentEditingInvoiceId}</span>
                  </div>
                )}
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={markAllDisplayed}
                  disabled={batchState.completedFiles === 0}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Mark all completed results as displayed to prevent future notifications"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  Mark as Displayed ({batchState.completedFiles})
                </button>
                <button
                  onClick={() => {
                    archiveCompletedResults().catch(err => 
                      console.error('Manual archive failed:', err)
                    )
                  }}
                  disabled={batchState.completedFiles === 0}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Manually archive completed results to clean the interface"
                >
                  <Archive className="w-4 h-4 mr-2" />
                  Archive ({batchState.completedFiles})
                </button>
                <button
                  onClick={downloadCSV}
                  disabled={!batchState.readyForDownload || journalEntries.length === 0}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!batchState.readyForDownload ? "Please wait for all files to complete processing" : "Download journal entries as CSV"}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download CSV
                  {!batchState.readyForDownload && batchState.totalFiles > 0 && (
                    <span className="ml-2 text-xs">
                      (Processing...)
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex gap-6 min-h-0">
              {/* Journal Entries Table */}
              <div className={`flex-1 flex flex-col min-h-0 ${
                isEditingMode && selectedDocumentUrl ? 'lg:flex-none lg:w-2/3' : ''
              }`}>
                <div className="flex-1 overflow-auto">
                  {journalEntries.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <FileText className="mx-auto h-12 w-12 text-gray-300 mb-2" />
                      <p>No journal entries generated yet</p>
                    </div>
                  ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Debit ₹</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credit ₹</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GST ₹</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balanced</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {journalEntries.map((entry) => (
                          <tr key={entry.id} className={`hover:bg-gray-50 transition-colors ${
                            currentEditingInvoiceId === entry.invoiceId ? 'bg-blue-50 ring-2 ring-blue-200' : ''
                          }`}>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                              {editingCell === `${entry.id}-date` ? (
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="date"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    className="border rounded px-2 py-1 text-sm"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleCellSave(entry.id, 'date')}
                                    className="text-green-600 hover:text-green-800"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={handleCellCancel}
                                    className="text-gray-500 hover:text-gray-700"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div 
                                  className="cursor-pointer hover:bg-blue-50 rounded px-2 py-1"
                                  onClick={() => handleCellEdit(entry.id, 'date', entry.date)}
                                >
                                  {entry.date}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                              {editingCell === `${entry.id}-accountName` ? (
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="text"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    className="border rounded px-2 py-1 text-sm w-32"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleCellSave(entry.id, 'accountName')}
                                    className="text-green-600 hover:text-green-800"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={handleCellCancel}
                                    className="text-gray-500 hover:text-gray-700"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div 
                                  className="cursor-pointer hover:bg-blue-50 rounded px-2 py-1"
                                  onClick={() => handleCellEdit(entry.id, 'accountName', entry.accountName)}
                                >
                                  {entry.accountName}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                              <span className="text-gray-600">{entry.accountCode || 'N/A'}</span>
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-900">
                              {editingCell === `${entry.id}-description` ? (
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="text"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    className="border rounded px-2 py-1 text-sm w-40"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleCellSave(entry.id, 'description')}
                                    className="text-green-600 hover:text-green-800"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={handleCellCancel}
                                    className="text-gray-500 hover:text-gray-700"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div 
                                  className="cursor-pointer hover:bg-blue-50 rounded px-2 py-1 max-w-xs truncate"
                                  onClick={() => handleCellEdit(entry.id, 'description', entry.description)}
                                  title={entry.description}
                                >
                                  {entry.description}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                              {editingCell === `${entry.id}-debitAmount` ? (
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    className="border rounded px-2 py-1 text-sm w-20"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleCellSave(entry.id, 'debitAmount')}
                                    className="text-green-600 hover:text-green-800"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={handleCellCancel}
                                    className="text-gray-500 hover:text-gray-700"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div 
                                  className="cursor-pointer hover:bg-blue-50 rounded px-2 py-1"
                                  onClick={() => handleCellEdit(entry.id, 'debitAmount', entry.debitAmount)}
                                >
                                  ₹{entry.debitAmount.toFixed(2)}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                              {editingCell === `${entry.id}-creditAmount` ? (
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    className="border rounded px-2 py-1 text-sm w-20"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleCellSave(entry.id, 'creditAmount')}
                                    className="text-green-600 hover:text-green-800"
                                  >
                                    <CheckCircle className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={handleCellCancel}
                                    className="text-gray-500 hover:text-gray-700"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div 
                                  className="cursor-pointer hover:bg-blue-50 rounded px-2 py-1"
                                  onClick={() => handleCellEdit(entry.id, 'creditAmount', entry.creditAmount)}
                                >
                                  ₹{entry.creditAmount.toFixed(2)}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                              <span className="text-gray-600">{entry.vendor || 'N/A'}</span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                              <span className="text-gray-600">₹{entry.gstAmount?.toFixed(2) || '0.00'}</span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                entry.isBalanced ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {entry.isBalanced ? '✓ Balanced' : '✗ Unbalanced'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
              {/* Document Viewer - appears during editing */}
              {isEditingMode && (
                <div className="lg:w-1/3 bg-gray-50 rounded-lg border-2 border-blue-200 p-4 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-800">Document Viewer</h3>
                    <div className="flex items-center space-x-2">
                      {currentEditingInvoiceId && (
                        <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                          ID: {currentEditingInvoiceId.slice(0, 8)}...
                        </span>
                      )}
                      <button
                        onClick={() => {
                          setSelectedDocumentUrl(null)
                          setIsEditingMode(false)
                          setCurrentEditingInvoiceId(null)
                          setEditingCell(null)
                          setDocumentLoading({})
                          setDocumentError({})
                        }}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex-1 flex items-center justify-center">
                    {currentEditingInvoiceId && documentLoading[currentEditingInvoiceId] ? (
                      <div className="text-center text-blue-600">
                        <Clock className="mx-auto h-16 w-16 text-blue-400 mb-4 animate-spin" />
                        <p className="text-sm">Loading document...</p>
                      </div>
                    ) : currentEditingInvoiceId && documentError[currentEditingInvoiceId] ? (
                      <div className="text-center text-red-500">
                        <AlertCircle className="mx-auto h-16 w-16 text-red-400 mb-4" />
                        <p className="text-sm">{documentError[currentEditingInvoiceId]}</p>
                        <button
                          onClick={async () => {
                            if (currentEditingInvoiceId) {
                              setDocumentError(prev => ({ ...prev, [currentEditingInvoiceId]: '' }))
                              setDocumentLoading(prev => ({ ...prev, [currentEditingInvoiceId]: true }))
                              try {
                                const docUrl = await getDocumentUrlForInvoice(currentEditingInvoiceId)
                                if (docUrl) {
                                  setSelectedDocumentUrl(docUrl)
                                } else {
                                  setDocumentError(prev => ({ ...prev, [currentEditingInvoiceId]: 'Document not available' }))
                                }
                              } catch (error) {
                                setDocumentError(prev => ({ ...prev, [currentEditingInvoiceId]: 'Failed to load document' }))
                              } finally {
                                setDocumentLoading(prev => ({ ...prev, [currentEditingInvoiceId]: false }))
                              }
                            }
                          }}
                          className="mt-2 px-3 py-1 text-xs bg-red-100 hover:bg-red-200 rounded"
                        >
                          Retry
                        </button>
                      </div>
                    ) : selectedDocumentUrl ? (
                      <div className="w-full h-full">
                        <img 
                          src={selectedDocumentUrl}
                          alt="Invoice document" 
                          className="w-full h-full object-contain border rounded-lg shadow-sm"
                          onError={() => {
                            console.error('Failed to load document image')
                            setDocumentError('Failed to load image')
                            setSelectedDocumentUrl(null)
                          }}
                          onLoad={() => {
                            console.log('✅ Document image loaded successfully')
                          }}
                        />
                      </div>
                    ) : (
                      <div className="text-center text-gray-500">
                        <FileText className="mx-auto h-16 w-16 text-gray-300 mb-4" />
                        <p className="text-sm">No document available</p>
                        <p className="text-xs mt-2 text-gray-400">
                          Click any cell in the table to edit and view the corresponding document
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-4 text-center">
                    <p className="text-xs text-gray-500">
                      Click any cell in the table to edit and view the corresponding document
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MultiUploadDashboard
