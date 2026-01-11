import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { sharedResultsService, type SharedResult } from '../services/sharedResultsService';

const SharedResultPage: React.FC = () => {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [result, setResult] = useState<SharedResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareToken) {
      setError('Invalid share link');
      setLoading(false);
      return;
    }

    loadSharedResult();
  }, [shareToken]);

  const loadSharedResult = async () => {
    try {
      const sharedResult = await sharedResultsService.getSharedResult(shareToken!);
      
      if (!sharedResult) {
        setError('Result not found or has expired');
        return;
      }

      if (!sharedResultsService.isResultValid(sharedResult)) {
        setError('This result has expired');
        return;
      }

      setResult(sharedResult);
    } catch (err) {
      setError('Failed to load result');
      console.error('Error loading shared result:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      await sharedResultsService.downloadSharedResult(shareToken!);
    } catch (error) {
      // Error handling is done in service
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mb-4"></div>
          <p className="text-gray-600">Loading invoice result...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-8 max-w-md w-full text-center shadow-lg">
          <span className="text-4xl mb-4 block">❌</span>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Access Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => window.location.href = '/'}
            className="bg-primary-500 text-white px-6 py-2 rounded-lg hover:bg-primary-600"
          >
            Go to Homepage
          </button>
        </div>
      </div>
    );
  }

  if (!result) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Invoice Result</h1>
              <p className="text-gray-600 mt-1">{result.fileName}</p>
            </div>
            <div className="text-right">
              <span className={`px-3 py-1 text-sm rounded-full ${
                result.status === 'completed' ? 'bg-green-100 text-green-700' :
                result.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                'bg-red-100 text-red-700'
              }`}>
                {result.status}
              </span>
              <p className="text-xs text-gray-500 mt-2">
                {sharedResultsService.getTimeUntilExpiry(result)}
              </p>
            </div>
          </div>
        </div>

        {result.status === 'processing' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-center space-x-2">
              <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              <span className="text-blue-700">Processing in progress... Check back later.</span>
            </div>
          </div>
        )}

        {result.status === 'error' && result.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700">{result.error}</p>
          </div>
        )}

        {result.results && result.status === 'completed' && (
          <>
            {/* Basic Info */}
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Invoice Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {result.results.companyName && (
                  <div>
                    <label className="text-sm text-gray-600">Company Name</label>
                    <p className="font-medium text-gray-900">{result.results.companyName}</p>
                  </div>
                )}
                {result.results.invoiceNumber && (
                  <div>
                    <label className="text-sm text-gray-600">Invoice Number</label>
                    <p className="font-medium text-gray-900">{result.results.invoiceNumber}</p>
                  </div>
                )}
                {result.results.date && (
                  <div>
                    <label className="text-sm text-gray-600">Date</label>
                    <p className="font-medium text-gray-900">{result.results.date}</p>
                  </div>
                )}
                {result.results.totalAmount !== undefined && (
                  <div>
                    <label className="text-sm text-gray-600">Total Amount</label>
                    <p className="font-medium text-gray-900">{formatCurrency(result.results.totalAmount)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Items */}
            {result.results.items && result.results.items.length > 0 && (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Items</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2">Description</th>
                        <th className="text-right py-2">Qty</th>
                        <th className="text-right py-2">Rate</th>
                        <th className="text-right py-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.results.items.map((item, index) => (
                        <tr key={index} className="border-b border-gray-100">
                          <td className="py-2">{item.description}</td>
                          <td className="text-right py-2">{item.quantity}</td>
                          <td className="text-right py-2">{formatCurrency(item.rate)}</td>
                          <td className="text-right py-2 font-medium">{formatCurrency(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Journal Entries */}
            {result.results.journalEntries && result.results.journalEntries.length > 0 && (
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Journal Entries</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2">Account</th>
                        <th className="text-right py-2">Debit</th>
                        <th className="text-right py-2">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.results.journalEntries.map((entry, index) => (
                        <tr key={index} className="border-b border-gray-100">
                          <td className="py-2">{entry.account}</td>
                          <td className="text-right py-2 text-green-600">
                            {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                          </td>
                          <td className="text-right py-2 text-red-600">
                            {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Download Button */}
            <div className="text-center">
              <button
                onClick={handleDownload}
                className="bg-primary-500 text-white px-8 py-3 rounded-lg hover:bg-primary-600 font-medium"
              >
                📥 Download Complete Data (CSV)
              </button>
            </div>
          </>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-gray-500">
          <p>This is a shared invoice processing result.</p>
          <p>Results are automatically archived after expiry.</p>
        </div>
      </div>
    </div>
  );
};

export default SharedResultPage;