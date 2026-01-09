import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import type { NetworkStatus } from '../services/pwaService';
import { firestoreService, type InvoiceResult } from '../services/firestoreService';
import { authService } from '../services/auth';

interface ResultsProps {
  networkStatus: NetworkStatus;
}

const Results: React.FC<ResultsProps> = ({ networkStatus }) => {
  const [results, setResults] = useState<InvoiceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState<InvoiceResult | null>(null);

  useEffect(() => {
    if (!authService.isAuthenticated()) {
      setLoading(false);
      return;
    }

    // Start listening to Firestore results
    const unsubscribe = firestoreService.listenToActiveResults((newResults) => {
      setResults(newResults);
      setLoading(false);
    });

    // Cleanup on unmount
    return () => {
      unsubscribe();
    };
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const downloadCSV = (result: InvoiceResult) => {
    if (!result.results) return;

    const csvRows = [];
    
    // Header
    csvRows.push('Invoice Processing Results');
    csvRows.push(`File: ${result.fileName}`);
    csvRows.push(`Processed: ${formatDate(result.completedAt || result.createdAt)}`);
    csvRows.push('');

    // Basic Info
    if (result.results.companyName) csvRows.push(`Company: ${result.results.companyName}`);
    if (result.results.invoiceNumber) csvRows.push(`Invoice Number: ${result.results.invoiceNumber}`);
    if (result.results.date) csvRows.push(`Date: ${result.results.date}`);
    if (result.results.totalAmount) csvRows.push(`Total: ${formatCurrency(result.results.totalAmount)}`);
    csvRows.push('');

    // Items
    if (result.results.items && result.results.items.length > 0) {
      csvRows.push('Items:');
      csvRows.push('Description,Quantity,Rate,Amount');
      result.results.items.forEach(item => {
        csvRows.push(`"${item.description}",${item.quantity},${item.rate},${item.amount}`);
      });
      csvRows.push('');
    }

    // Journal Entries
    if (result.results.journalEntries && result.results.journalEntries.length > 0) {
      csvRows.push('Journal Entries:');
      csvRows.push('Account,Debit,Credit');
      result.results.journalEntries.forEach(entry => {
        csvRows.push(`"${entry.account}",${entry.debit},${entry.credit}`);
      });
    }

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `invoice_${result.fileName.replace(/\.[^/.]+$/, '')}_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    toast.success('CSV downloaded successfully');
  };

  if (!authService.isAuthenticated()) {
    return (
      <div className="p-4 pb-20">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center">
          <span className="text-4xl mb-4 block">🔒</span>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Sign In Required</h2>
          <p className="text-gray-600">Please sign in to view your invoice processing results.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 pb-20">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto"></div>
          </div>
          <p className="text-gray-600 mt-4">Loading your results...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-20">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Processing Results</h2>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                networkStatus.isOnline ? 'bg-green-500' : 'bg-red-500'
              }`}></div>
              <span className="text-sm text-gray-500">
                {networkStatus.isOnline ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        {!networkStatus.isOnline && (
          <div className="mx-6 mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <span className="text-yellow-600">⚠️</span>
              <span className="text-sm text-yellow-700">
                You're offline. Results shown are cached and may not be up-to-date.
              </span>
            </div>
          </div>
        )}

        {results.length === 0 ? (
          <div className="p-6 text-center">
            <span className="text-4xl mb-4 block">📋</span>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No results yet</h3>
            <p className="text-gray-600">
              Upload some invoices to see processing results here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {results.map((result) => (
              <div key={result.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-gray-900 truncate flex-1">
                    {result.fileName}
                  </h3>
                  <div className="flex items-center space-x-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      result.status === 'completed' ? 'bg-green-100 text-green-700' :
                      result.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {result.status}
                    </span>
                    {result.status === 'processing' && (
                      <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                    )}
                  </div>
                </div>

                <div className="text-sm text-gray-500 mb-3">
                  <span>Started: {formatDate(result.createdAt)}</span>
                  {result.completedAt && (
                    <span className="ml-4">Completed: {formatDate(result.completedAt)}</span>
                  )}
                </div>

                {result.status === 'error' && result.error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                    <p className="text-sm text-red-700">{result.error}</p>
                  </div>
                )}

                {result.results && result.status === 'completed' && (
                  <>
                    <div className="bg-gray-50 rounded-lg p-4 mb-3">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {result.results.companyName && (
                          <div>
                            <span className="text-gray-600">Company:</span>
                            <p className="font-medium">{result.results.companyName}</p>
                          </div>
                        )}
                        {result.results.totalAmount !== undefined && (
                          <div>
                            <span className="text-gray-600">Total:</span>
                            <p className="font-medium">{formatCurrency(result.results.totalAmount)}</p>
                          </div>
                        )}
                        {result.results.invoiceNumber && (
                          <div>
                            <span className="text-gray-600">Invoice #:</span>
                            <p className="font-medium">{result.results.invoiceNumber}</p>
                          </div>
                        )}
                        {result.results.date && (
                          <div>
                            <span className="text-gray-600">Date:</span>
                            <p className="font-medium">{result.results.date}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex space-x-3">
                      <button
                        onClick={() => setSelectedResult(result)}
                        className="text-sm bg-primary-100 text-primary-700 px-3 py-2 rounded-lg hover:bg-primary-200"
                      >
                        View Details
                      </button>
                      <button
                        onClick={() => downloadCSV(result)}
                        className="text-sm bg-green-100 text-green-700 px-3 py-2 rounded-lg hover:bg-green-200"
                      >
                        Download CSV
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Result Details Modal */}
      {selectedResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-96 overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">Invoice Details</h3>
                <button
                  onClick={() => setSelectedResult(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <h4 className="font-medium text-gray-900 mb-2">{selectedResult.fileName}</h4>
              
              {selectedResult.results?.items && (
                <div className="mb-4">
                  <h5 className="font-medium text-gray-800 mb-2">Items</h5>
                  <div className="space-y-2">
                    {selectedResult.results.items.map((item, index) => (
                      <div key={index} className="bg-gray-50 rounded p-2 text-sm">
                        <div className="flex justify-between">
                          <span>{item.description}</span>
                          <span>{formatCurrency(item.amount)}</span>
                        </div>
                        <div className="text-gray-500">
                          Qty: {item.quantity} × {formatCurrency(item.rate)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedResult.results?.journalEntries && (
                <div>
                  <h5 className="font-medium text-gray-800 mb-2">Journal Entries</h5>
                  <div className="space-y-1">
                    {selectedResult.results.journalEntries.map((entry, index) => (
                      <div key={index} className="flex justify-between text-sm py-1">
                        <span>{entry.account}</span>
                        <div className="space-x-4">
                          <span className="text-green-600">
                            Dr: {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                          </span>
                          <span className="text-red-600">
                            Cr: {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Results;