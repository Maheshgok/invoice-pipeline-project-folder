import React, { useState, useCallback, useEffect } from 'react';
import EditableTable from './EditableTable';
import { useAuth } from '../hooks/useAuth';
import { useDataCaptureWithFallback } from '../hooks/useDataCaptureWithFallback';
import { Download, RotateCcw, Eye, EyeOff } from 'lucide-react';

interface DataWithCaptureProps {
  result: any;
  onDataChange?: (data: { headers: string[]; rows: string[][] }) => void;
  onDownload?: (data: { headers: string[]; rows: string[][] }) => void;
  onRefresh?: () => void;
}

const DataWithCapture: React.FC<DataWithCaptureProps> = ({
  result,
  onDataChange,
  onDownload,
  onRefresh
}) => {
  const { user } = useAuth();
  const [currentEditedData, setCurrentEditedData] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [showCaptureStatus, setShowCaptureStatus] = useState(false);

  // Extract original data from result
  const originalData = result?.tabulated_data || null;

  // Initialize current data from original
  useEffect(() => {
    if (originalData && originalData.headers && originalData.rows) {
      setCurrentEditedData({
        headers: originalData.headers,
        rows: originalData.rows
      });
    }
  }, [originalData]);

  // Set up silent data capture
  const { captureFinal } = useDataCaptureWithFallback(originalData, currentEditedData, {
    captureIntervalMs: 30000, // Capture every 30 seconds
    silentMode: true, // Silent operation
    enableVisibilityCapture: true, // Capture when tab loses focus
    enableUnloadCapture: true, // Capture before page close
    maxRetries: 3
  });

  // Handle data changes from the editable table
  const handleDataChange = useCallback((rows: string[][]) => {
    if (!originalData?.headers) return;
    
    const newData = {
      headers: originalData.headers,
      rows: rows
    };
    
    setCurrentEditedData(newData);
    
    // Call parent handler if provided
    onDataChange?.(newData);
  }, [originalData?.headers, onDataChange]);

  // Handle download with final capture
  const handleDownload = useCallback(async () => {
    if (!currentEditedData) return;
    
    // Capture final state before download
    await captureFinal();
    
    // Call parent download handler
    onDownload?.(currentEditedData);
  }, [currentEditedData, captureFinal, onDownload]);

  // Handle refresh with final capture
  const handleRefresh = useCallback(async () => {
    // Capture final state before refresh
    if (currentEditedData) {
      await captureFinal();
    }
    
    // Call parent refresh handler
    onRefresh?.();
  }, [currentEditedData, captureFinal, onRefresh]);

  // Capture status component (for development/debugging - can be hidden in production)
  const CaptureStatus = () => {
    if (!showCaptureStatus) return null;

    return (
      <div className="bg-gray-100 border rounded-lg p-3 text-xs space-y-1">
        <div className="font-medium text-gray-700">Data Capture Status</div>
        <div className="text-gray-600">Silent capture active for accuracy analysis</div>
        <div className="text-gray-500">
          User: {user?.email?.split('@')[0] || 'Unknown'}
        </div>
      </div>
    );
  };

  if (!originalData || !currentEditedData) {
    return (
      <div className="text-center py-8 text-gray-500">
        No data available for editing
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow">
        <div className="flex items-center space-x-4">
          <button
            onClick={handleDownload}
            className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Download CSV</span>
          </button>

          <button
            onClick={handleRefresh}
            className="flex items-center space-x-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          {/* Data Status Indicators */}
          <div className="flex items-center space-x-2 text-sm text-green-600 bg-green-50 px-3 py-1 rounded-lg">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>Data Loaded</span>
          </div>

          {/* Capture Status Toggle (for debugging) */}
          <button
            onClick={() => setShowCaptureStatus(!showCaptureStatus)}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            title={showCaptureStatus ? "Hide capture status" : "Show capture status"}
          >
            {showCaptureStatus ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Capture Status (hidden by default) */}
      <CaptureStatus />

      {/* Editable Table */}
      <div className="bg-white rounded-lg shadow">
        <EditableTable 
          headers={currentEditedData.headers}
          initialRows={currentEditedData.rows}
          onDataChange={handleDataChange}
          title="Invoice Data with Silent Capture"
        />
      </div>

      {/* Data Summary */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Rows:</span>
            <span className="ml-2 font-medium">{currentEditedData.rows.length}</span>
          </div>
          <div>
            <span className="text-gray-600">Columns:</span>
            <span className="ml-2 font-medium">{currentEditedData.headers.length}</span>
          </div>
          <div>
            <span className="text-gray-600">Status:</span>
            <span className="ml-2 font-medium">Active</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataWithCapture;