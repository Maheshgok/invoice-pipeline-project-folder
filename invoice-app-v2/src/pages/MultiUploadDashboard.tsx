import { useState, useCallback, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Upload, Download, FileText, CheckCircle, Clock, AlertCircle, X, LogOut, User, Eye, Archive } from 'lucide-react'
import toast from 'react-hot-toast'
// Import the new real-time hook instead of the old one
import { useRealtimeUpload } from '../hooks/useRealtimeUpload'

const MultiUploadDashboard: React.FC = () => {
  const { user, logout } = useAuth()
  const { 
    uploadedFiles, 
    journalEntries,
    allInvoiceResults,  // Changed from invoiceResults to allInvoiceResults
    uploadFiles,        // Changed from addFile to uploadFiles  
    removeFile, 
    clearAll,
    downloadCSV,        // Enhanced with auto-archiving
    updateJournalEntry, // Add updateJournalEntry from the hook
    markAsDisplayed,    // Add markAsDisplayed for individual items
    markAllDisplayed,   // Add markAllDisplayed for batch operations
    archiveCompletedResults,  // NEW: Archive completed results
    archiveDisplayedResults,   // NEW: Archive displayed results
    isBatchReadyForDownload,    // NEW: Check if batch is ready for download
    startRealtimeListeners      // NEW: Manual listener control
  } = useRealtimeUpload()  // Use the new real-time hook
  
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [editingCell, setEditingCell] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const MAX_QUEUE_SIZE = 100

  // Handle window close/refresh - reliable archive trigger
  useEffect(() => {
    if (!user?.email) return

    // Use visibilitychange instead of beforeunload for better reliability
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Page is becoming hidden (likely closing/navigating away)
        if (allInvoiceResults.filter(r => r.status === 'completed').length > 0) {
          console.log('🔄 Window becoming hidden - triggering archive for cleanup...')
          // Send archive request immediately (synchronous where possible)
          archiveCompletedResults().catch(err => 
            console.error('❌ Visibility change archive failed:', err)
          )
        }
      }
    }

    // Also use beforeunload as backup (though less reliable)
    const handleBeforeUnload = () => {
      if (allInvoiceResults.filter(r => r.status === 'completed').length > 0) {
        console.log('🔄 Window unloading - triggering archive...')
        // Use navigator.sendBeacon for more reliable delivery
        const archiveData = JSON.stringify({ trigger: 'window_close' })
        navigator.sendBeacon('/api/archive-hint', archiveData)
        
        // Still attempt normal archive as fallback
        archiveCompletedResults().catch(err => 
          console.error('❌ Before unload archive failed:', err)
        )
      }
    }

    // Add both event listeners for maximum reliability
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [user?.email, allInvoiceResults, archiveCompletedResults])

  // Handle user logout - clean up listeners and optionally archive
  useEffect(() => {
    // Only set up logout cleanup if user exists
    if (!user?.email) {
      console.log('🎯 No user - skipping archive setup')
      return
    }

    console.log('🔐 Setting up logout cleanup for user:', user.email)

    // Archive on explicit user logout (when auth state changes from authenticated to null)
    return () => {
      console.log('🔄 User state cleanup - checking if archive needed')
      // Only archive if we have data to archive
      if (allInvoiceResults.length > 0) {
        console.log('📦 User logout detected - archiving completed results')
        archiveCompletedResults().catch(err => 
          console.error('❌ Logout archive failed:', err)
        )
      }
    }
  }, [user?.email]) // This will trigger cleanup when user changes (including logout)

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
    
    if (uploadedFiles.length + files.length > MAX_QUEUE_SIZE) {
      toast.error(`Queue limit exceeded. Maximum ${MAX_QUEUE_SIZE} files allowed.`)
      return
    }

    // Filter valid files
    const validFiles = files.filter(file => {
      if (file.type.includes('image') || file.type === 'application/pdf') {
        return true
      } else {
        toast.error(`Unsupported file type: ${file.name}`)
        return false
      }
    })
    
    // Upload all valid files at once using the real-time system
    if (validFiles.length > 0) {
      const fileList = new DataTransfer()
      validFiles.forEach(file => fileList.items.add(file))
      uploadFiles(fileList.files)
    }
  }, [uploadFiles, uploadedFiles.length])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    
    if (uploadedFiles.length + files.length > MAX_QUEUE_SIZE) {
      toast.error(`Queue limit exceeded. Maximum ${MAX_QUEUE_SIZE} files allowed.`)
      return
    }

    // Filter valid files
    const validFiles = files.filter(file => {
      if (file.type.includes('image') || file.type === 'application/pdf') {
        return true
      } else {
        toast.error(`Unsupported file type: ${file.name}`)
        return false
      }
    })
    
    // Upload all valid files at once using the real-time system
    if (validFiles.length > 0) {
      uploadFiles(e.target.files)
    }
    
    // Reset input
    e.target.value = ''
  }, [uploadFiles, uploadedFiles.length])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'uploading':
      case 'processing':
        return <Clock className="w-4 h-4 text-blue-500 animate-spin" />
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      default:
        return null
    }
  }

  const handleCellEdit = (entryId: string, field: string, currentValue: any) => {
    setEditingCell(`${entryId}-${field}`)
    setEditValue(currentValue.toString())
  }

  const handleCellSave = (entryId: string, field: string) => {
    updateJournalEntry(entryId, field, field.includes('Amount') ? parseFloat(editValue) || 0 : editValue)
    setEditingCell(null)
    setEditValue('')
  }

  const handleCellCancel = () => {
    setEditingCell(null)
    setEditValue('')
  }

  const getProgressColor = (progress: number) => {
    if (progress < 30) return 'bg-red-500'
    if (progress < 70) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  // Calculate queue statistics
  const queueStats = {
    total: uploadedFiles.length,
    completed: uploadedFiles.filter(f => f.status === 'completed').length,
    processing: uploadedFiles.filter(f => f.status === 'uploading' || f.status === 'processing').length,
    errors: uploadedFiles.filter(f => f.status === 'error').length
  }

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

      {/* Top Section - Upload Area and Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Left - Upload Pane */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Upload Files</h2>
            <span className="text-sm text-gray-500">
              {uploadedFiles.length}/{MAX_QUEUE_SIZE} files
            </span>
          </div>
          
          {/* Drag & Drop Zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive 
                ? 'border-blue-400 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-lg font-medium text-gray-900 mb-2">
              Drop files here or click to upload
            </p>
            <p className="text-sm text-gray-500 mb-4">
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
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer"
            >
              Choose Files
            </label>
          </div>

          {/* Queue Statistics */}
          <div className="mt-6 grid grid-cols-4 gap-4 text-center">
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-blue-600">{queueStats.total}</div>
              <div className="text-xs text-blue-600">Total</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-green-600">{queueStats.completed}</div>
              <div className="text-xs text-green-600">Completed</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-yellow-600">{queueStats.processing}</div>
              <div className="text-xs text-yellow-600">Processing</div>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-red-600">{queueStats.errors}</div>
              <div className="text-xs text-red-600">Errors</div>
            </div>
          </div>
        </div>

        {/* Right - Progress Indicator */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Processing Queue</h2>
          </div>
          
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {uploadedFiles.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FileText className="mx-auto h-12 w-12 text-gray-300 mb-2" />
                <p>No files in queue</p>
              </div>
            ) : (
              uploadedFiles.map((file) => (
                <div key={file.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0">
                    {getStatusIcon(file.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {file.file.name}
                    </p>
                    <div className="mt-1 bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(file.progress)}`}
                        style={{ width: `${file.progress}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-sm text-gray-500">
                    {file.progress}%
                  </div>
                  <button
                    onClick={() => removeFile(file.id)}
                    className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section - Journal Entries Table and Image Viewer */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left - Scrollable Table (2/3 width) */}
        <div className="xl:col-span-2 bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Journal Entries</h2>
            <div className="flex space-x-3">
              <button
                onClick={markAllDisplayed}
                disabled={allInvoiceResults.filter(r => r.status === 'completed' && r.frontendStatus !== 'displayed').length === 0}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Mark all completed results as displayed to prevent future notifications"
              >
                <Eye className="w-4 h-4 mr-2" />
                Mark as Displayed ({allInvoiceResults.filter(r => r.status === 'completed' && r.frontendStatus !== 'displayed').length})
              </button>
              <button
                onClick={() => {
                  archiveCompletedResults().catch(err => 
                    console.error('Manual archive failed:', err)
                  )
                }}
                disabled={allInvoiceResults.filter(r => r.status === 'completed').length === 0}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Manually archive completed results to clean the interface"
              >
                <Archive className="w-4 h-4 mr-2" />
                Archive ({allInvoiceResults.filter(r => r.status === 'completed').length})
              </button>
              <button
                onClick={downloadCSV}
                disabled={!isBatchReadyForDownload() || journalEntries.length === 0}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                title={!isBatchReadyForDownload() ? "Please wait for all files to complete processing" : "Download journal entries as CSV"}
              >
                <Download className="w-4 h-4 mr-2" />
                Download CSV
                {!isBatchReadyForDownload() && uploadedFiles.length > 0 && (
                  <span className="ml-2 text-xs">
                    (Processing...)
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            {journalEntries.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FileText className="mx-auto h-12 w-12 text-gray-300 mb-2" />
                <p>No journal entries generated yet</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Debit ₹</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credit ₹</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GST ₹</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balanced</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {journalEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
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
                      <td className="px-6 py-4 text-sm text-gray-900">
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
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
                            ${entry.debitAmount.toFixed(2)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
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
                            ${entry.creditAmount.toFixed(2)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {editingCell === `${entry.id}-reference` ? (
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="border rounded px-2 py-1 text-sm w-24"
                              autoFocus
                            />
                            <button
                              onClick={() => handleCellSave(entry.id, 'reference')}
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
                            onClick={() => handleCellEdit(entry.id, 'reference', entry.reference)}
                          >
                            {entry.reference}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right - Image Display Panel (1/3 width) */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Image Viewer</h2>
          
          {selectedImage ? (
            <div className="space-y-4">
              <img 
                src={selectedImage} 
                alt="Selected document" 
                className="w-full h-64 object-contain border rounded-lg"
              />
              <button
                onClick={() => setSelectedImage(null)}
                className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                Close Image
              </button>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <FileText className="mx-auto h-16 w-16 text-gray-300 mb-4" />
              <p>No image selected</p>
              <p className="text-sm mt-2">Click on a processed file to view</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default MultiUploadDashboard
