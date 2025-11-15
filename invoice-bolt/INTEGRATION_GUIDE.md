// Add this to your existing App.tsx where you handle the EditableTable

import { useDataCapture } from './hooks/useDataCapture';

// In your MainApp component, add this after your existing state:
const [originalInvoiceData, setOriginalInvoiceData] = useState(null);

// Set up data capture (add this after your other hooks)
const dataCapture = useDataCapture(
  originalInvoiceData, // Original AI-processed data
  currentEditedData,   // Current user-edited data
  {
    captureIntervalMs: 30000,  // Capture every 30 seconds
    silentMode: true,          // Silent operation - no console logs
    enableVisibilityCapture: true,  // Capture when tab loses focus
    enableUnloadCapture: true       // Capture before page close
  }
);

// When you receive result from API, capture the original data:
useEffect(() => {
  if (result?.tabulated_data) {
    const originalData = {
      headers: result.tabulated_data.headers,
      rows: result.tabulated_data.rows
    };
    setOriginalInvoiceData(originalData);
    setCurrentEditedData(originalData); // Initialize current with original
  }
}, [result]);

// Your existing handleDataChange function remains the same
const handleDataChange = useCallback((rows: string[][]) => {
  if (!result?.tabulated_data?.headers) return;
  
  const newData = {
    headers: result.tabulated_data.headers,
    rows: rows
  };
  
  setCurrentEditedData(newData);
  setHasUnsavedChanges(true);
}, [result?.tabulated_data?.headers]);

// Modified download function to capture final state
const handleDownloadCSV = useCallback(async (data: { headers: string[]; rows: string[][] }) => {
  try {
    // Capture final state before download
    if (dataCapture.captureFinal) {
      await dataCapture.captureFinal();
    }
    
    // Your existing download logic...
    const csvContent = [
      data.headers.join(','),
      ...data.rows.map(row => 
        row.map(cell => {
          if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))) {
            return `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `invoice_data_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    console.log('📥 CSV download completed with data capture');
    
    // Auto-backup after download
    if (currentEditedData) {
      await handleUploadToCloud(currentEditedData);
    }
    
  } catch (error: any) {
    console.error('❌ CSV download failed:', error);
    setError(`Failed to download CSV: ${error.message}`);
  }
}, [dataCapture, currentEditedData, handleUploadToCloud]);

// Modified refresh function to capture final state
const handleRefresh = useCallback(async () => {
  try {
    // Capture final state before refresh
    if (currentEditedData && dataCapture.captureFinal) {
      await dataCapture.captureFinal();
    }
    
    // Auto-backup before refresh
    if (currentEditedData) {
      await handleUploadToCloud(currentEditedData);
    }
    
    // Your existing refresh logic...
    setTimeout(() => {
      setResult(null);
      setCurrentEditedData(null);
      setOriginalInvoiceData(null); // Clear original data too
      setFiles([]);
      setJobStatus('idle');
      setProgress(0);
      setError(null);
      setCurrentJobId(null);
      setHasUnsavedChanges(false);
      console.log('🔄 Application state refreshed with data capture');
    }, 1000);
    
  } catch (error: any) {
    console.error('❌ Refresh failed:', error);
    setError(`Failed to refresh: ${error.message}`);
  }
}, [currentEditedData, dataCapture, handleUploadToCloud]);

/* 
WHAT THIS DOES:

1. **Silent Capture**: Automatically captures data states without user knowledge
2. **Event-Driven**: Triggers on data changes, page focus loss, window close
3. **Accuracy Tracking**: Stores original vs modified data for accuracy analysis
4. **Session Tracking**: Each editing session gets a unique ID for analysis
5. **Diff Generation**: Automatically calculates what changed between states

CAPTURED EVENTS:
- 'initial': When AI processes the invoice (baseline)
- 'edit': When user modifies data (tracks changes)
- 'final': When user downloads or refreshes (final state)
- 'periodic': Every 30 seconds if data changed
- 'visibility': When tab loses focus (backup)
- 'unload': Before page closes (emergency backup)

DATA STORED:
- Original AI-processed data
- User-modified data
- Detailed diff of changes
- Session metadata (user, time, browser, etc.)
- Change count and modification flags

ANALYSIS ENDPOINTS:
- /capture-data-state: Main capture endpoint
- /get-accuracy-data/{session_id}: Retrieve analysis
- /capture-data-state-beacon: Page unload handling

The system is completely silent from the user's perspective but gives you
comprehensive data for accuracy analysis and system improvement.
*/