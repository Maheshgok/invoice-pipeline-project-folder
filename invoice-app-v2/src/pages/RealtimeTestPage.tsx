import React from 'react'
import { useRealtimeUpload } from '../hooks/useRealtimeUpload'

const RealtimeTestPage: React.FC = () => {
  const { 
    uploadedFiles, 
    journalEntries, 
    allInvoiceResults, 
    uploadFiles 
  } = useRealtimeUpload()

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      uploadFiles(e.target.files)
    }
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">🔥 Real-time Invoice Processing Test</h1>
        <div className="bg-blue-100 p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">How Real-time Updates Work:</h2>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li><strong>Event-driven:</strong> Firestore pushes updates automatically when documents change</li>
            <li><strong>No polling:</strong> Frontend receives updates instantly without querying</li>
            <li><strong>Real-time notifications:</strong> Toast messages appear as processing completes</li>
            <li><strong>Live status updates:</strong> File progress updates in real-time</li>
          </ul>
        </div>
      </div>

      {/* File Upload */}
      <div className="mb-8">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Upload Invoice Files
        </label>
        <input
          type="file"
          multiple
          accept=".pdf,image/*"
          onChange={handleFileUpload}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
      </div>

      {/* Real-time Status */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="font-semibold text-gray-800 mb-2">📁 Uploaded Files</h3>
          <p className="text-2xl font-bold text-blue-600">{uploadedFiles.length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="font-semibold text-gray-800 mb-2">📊 All Results</h3>
          <p className="text-2xl font-bold text-green-600">{allInvoiceResults.length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="font-semibold text-gray-800 mb-2">📋 Journal Entries</h3>
          <p className="text-2xl font-bold text-purple-600">{journalEntries.length}</p>
        </div>
      </div>

      {/* Live File Status */}
      {uploadedFiles.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">📄 Current Upload Status</h2>
          <div className="space-y-3">
            {uploadedFiles.map((file) => (
              <div key={file.id} className="bg-white p-4 rounded-lg shadow border">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{file.file.name}</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    file.status === 'completed' ? 'bg-green-100 text-green-800' :
                    file.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                    file.status === 'error' ? 'bg-red-100 text-red-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {file.status}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${
                      file.status === 'completed' ? 'bg-green-500' :
                      file.status === 'error' ? 'bg-red-500' :
                      'bg-blue-500'
                    }`}
                    style={{ width: `${file.progress}%` }}
                  />
                </div>
                {file.jobId && (
                  <p className="text-xs text-gray-500 mt-1">Job ID: {file.jobId}</p>
                )}
                {file.error && (
                  <p className="text-xs text-red-500 mt-1">Error: {file.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Invoice Results (Real-time) */}
      {allInvoiceResults.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">📊 All Invoice Results (Real-time)</h2>
          <div className="grid gap-4">
            {allInvoiceResults.map((result) => (
              <div key={result.id} className="bg-white p-4 rounded-lg shadow border">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{result.fileName}</span>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      result.status === 'completed' ? 'bg-green-100 text-green-800' :
                      result.status === 'processing' ? 'bg-yellow-100 text-yellow-800' :
                      result.status === 'error' ? 'bg-red-100 text-red-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {result.status}
                    </span>
                    <span className="text-xs text-gray-500">{result.progress}%</span>
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  <p>Job ID: <code className="bg-gray-100 px-1 rounded">{result.jobId}</code></p>
                  <p>User: {result.userEmail}</p>
                  {result.processedAt && (
                    <p>Processed: {new Date(result.processedAt).toLocaleString()}</p>
                  )}
                </div>
                {result.extractedData && (
                  <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                    <strong>Extracted Data Available:</strong> 
                    {result.extractedData.vendor_name && ` Vendor: ${result.extractedData.vendor_name}`}
                    {result.extractedData.invoice_number && ` | Invoice: ${result.extractedData.invoice_number}`}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Journal Entries (Real-time) */}
      {journalEntries.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">📋 Journal Entries (Real-time)</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white border rounded-lg">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 border text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                  <th className="px-4 py-2 border text-left text-xs font-semibold text-gray-600 uppercase">Account</th>
                  <th className="px-4 py-2 border text-left text-xs font-semibold text-gray-600 uppercase">Description</th>
                  <th className="px-4 py-2 border text-right text-xs font-semibold text-gray-600 uppercase">Debit</th>
                  <th className="px-4 py-2 border text-right text-xs font-semibold text-gray-600 uppercase">Credit</th>
                  <th className="px-4 py-2 border text-left text-xs font-semibold text-gray-600 uppercase">Vendor</th>
                </tr>
              </thead>
              <tbody>
                {journalEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 border text-sm">{entry.date}</td>
                    <td className="px-4 py-2 border text-sm">{entry.accountName}</td>
                    <td className="px-4 py-2 border text-sm">{entry.description}</td>
                    <td className="px-4 py-2 border text-sm text-right">
                      {entry.debitAmount > 0 ? entry.debitAmount.toFixed(2) : ''}
                    </td>
                    <td className="px-4 py-2 border text-sm text-right">
                      {entry.creditAmount > 0 ? entry.creditAmount.toFixed(2) : ''}
                    </td>
                    <td className="px-4 py-2 border text-sm">{entry.vendor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default RealtimeTestPage