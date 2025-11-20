import React, { useState, useCallback, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MultiFileUpload from './components/MultiFileUpload';
import MultiUploadProgress from './components/MultiUploadProgress';
import AuthCallback from './components/AuthCallback';
import LoginButton from './components/LoginButton';
import UserProfile from './components/UserProfile';
import EnvTest from './components/EnvTest';
// Updated: Added result data to job-status endpoint for table rendering fix
import JobStatusPanel from './components/JobStatusPanel';
import AuthGuard from './components/AuthGuard';
import TokenDebugPanel from './components/TokenDebugPanel';
import EditableTable from './components/EditableTable';
import { uploadInvoice, getJobStatus, JobStatusResponse } from './services/api';
import { uploadMultipleFiles, BatchUploadProgress, UploadResult } from './services/multiUploadApi';
import { FileText, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import { useDataCaptureWithFallback } from './hooks/useDataCaptureWithFallback';
import { useJobBatchListener } from './hooks/useJobBatchListener';
import { debugListenerIssues } from './services/debugListenerService';

/**
 * Auth Status Component - Shows Firebase authentication status
 * Updated: Deployment trigger - watch-mail-trial project integration complete
 */
const AuthStatusBanner: React.FC = () => {
  const { user, isLoading, isSignedIn, signIn, signOut, error } = useAuth();

  if (isLoading) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-blue-700">Checking authentication status...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="text-red-700">Authentication Error: {error}</span>
          </div>
          <button
            onClick={signIn}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Retry Sign In
          </button>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-yellow-500" />
            <span className="text-yellow-700">
              🔐 Sign in required for Firestore realtime updates
            </span>
          </div>
          <button
            onClick={signIn}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Sign In with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-500 rounded-full"></div>
          <span className="text-green-700">
            ✅ Authenticated as {user?.email} - Firestore listeners enabled
          </span>
        </div>
        <button
          onClick={signOut}
          className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
};

const MainApp: React.FC = (): React.ReactNode => {
  const [files, setFiles] = useState<File[]>([]);
  const [jobStatus, setJobStatus] = useState<'idle' | 'pending' | 'processing' | 'completed' | 'failed' | 'partially_completed'>('idle');
  const [progress, setProgress] = useState<number>(0); // 0.0 to 1.0
  const [result, setResult] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [currentEditedData, setCurrentEditedData] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [originalData, setOriginalData] = useState<{ headers: string[]; rows: string[][] } | null>(null); // Track AI baseline
  
  // Track previous job ID to prevent reprocessing same data
  const previousJobRef = useRef<string | null>(null);
  const currentResultRef = useRef<any>(null);
  const currentJobIdRef = useRef<string | null>(null);

  // Update refs when values change
  useEffect(() => {
    currentResultRef.current = result;
    currentJobIdRef.current = currentJobId;
  }, [result, currentJobId]);

  // Debug listener architecture on component mount
  useEffect(() => {
    debugListenerIssues();
  }, []);

  // Debug effect to track result changes
  useEffect(() => {
    console.log('🔄 Result state changed:', {
      hasResult: !!result,
      jobStatus,
      currentJobId,
      resultType: result ? typeof result : 'null',
      hasTabulated: result?.tabulated_data ? 'yes' : 'no'
    });
  }, [result, jobStatus, currentJobId]);

  // Initialize silent data capture with fallback storage
  const { captureInitial, captureEdit, captureFinal, getLocalStoredData } = useDataCaptureWithFallback(
    originalData,
    currentEditedData,
    {
      captureIntervalMs: 30000,
      silentMode: true,
      enableVisibilityCapture: true,
      enableUnloadCapture: true,
      enableLocalStorage: true,
      maxRetries: 3,
      jobId: currentJobId || undefined,
      jobMetadata: {
        jobStatus,
        progress,
        processingTimestamp: result ? new Date().toISOString() : null,
        extractionModel: 'gpt-4o-mini',
        hasTabularData: result?.tabulated_data?.success || false,
        dataRowCount: result?.tabulated_data?.rows?.length || 0,
        dataColumnCount: result?.tabulated_data?.headers?.length || 0
      }
    }
  );
  const { isAuthenticated, user, loading, logout, signIn } = useAuth();

  // Helper function to generate table data from raw invoice data (for old format compatibility)
  const generateTableDataFromRaw = (rawData: any) => {
    console.log('🎯 generateTableDataFromRaw called with:', rawData);
    console.log('🎯 rawData type:', typeof rawData);
    console.log('🎯 rawData keys:', rawData ? Object.keys(rawData) : 'null');
    console.log('🎯 Has extracted_table:', !!rawData?.extracted_table);
    console.log('🎯 extracted_table type:', rawData?.extracted_table ? typeof rawData.extracted_table : 'undefined');
    
    try {
      const tabulated_data: {
        headers: string[];
        rows: string[][];
        basic_info: string[][];
        success: boolean;
        journal_entries?: {
          headers: string[];
          rows: string[][];
        };
      } = {
        headers: [] as string[],
        rows: [] as string[][],
        basic_info: [] as string[][],
        success: true
      };
      
      // Handle new format with InvoiceDetails and SuggestedJournalEntries
      if (rawData.InvoiceDetails) {
        const invoice_details = rawData.InvoiceDetails;
        
        // Basic invoice information from InvoiceDetails
        const basic_info = [];
        if (invoice_details.number) basic_info.push(["Invoice Number", String(invoice_details.number)]);
        if (invoice_details.date) basic_info.push(["Invoice Date", String(invoice_details.date)]);
        if (invoice_details.seller) basic_info.push(["Seller", String(invoice_details.seller)]);
        if (invoice_details.buyer) basic_info.push(["Buyer", String(invoice_details.buyer)]);
        if (invoice_details.totals) {
          if (typeof invoice_details.totals === 'object') {
            Object.entries(invoice_details.totals).forEach(([key, value]) => {
              basic_info.push([key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), String(value)]);
            });
          } else {
            basic_info.push(["Total", String(invoice_details.totals)]);
          }
        }
        if (invoice_details.taxes) {
          if (typeof invoice_details.taxes === 'object') {
            Object.entries(invoice_details.taxes).forEach(([key, value]) => {
              basic_info.push([`Tax - ${key}`, String(value)]);
            });
          } else {
            basic_info.push(["Tax", String(invoice_details.taxes)]);
          }
        }
        
        // Handle line items from InvoiceDetails
        if (invoice_details.line_items && Array.isArray(invoice_details.line_items) && invoice_details.line_items.length > 0) {
          const first_item = invoice_details.line_items[0];
          if (typeof first_item === 'object' && first_item !== null) {
            const headers = Object.keys(first_item);
            tabulated_data.headers = headers;
            
            for (const item of invoice_details.line_items) {
              if (typeof item === 'object' && item !== null) {
                const row = headers.map(header => String(item[header] || ''));
                tabulated_data.rows.push(row);
              }
            }
            
            tabulated_data.basic_info = basic_info;
          } else {
            tabulated_data.headers = ["Field", "Value"];
            tabulated_data.rows = basic_info;
          }
        } else {
          tabulated_data.headers = ["Field", "Value"];
          tabulated_data.rows = basic_info;
        }
        
        // Handle journal entries - check both SummaryJournalEntries (new) and SuggestedJournalEntries (fallback)
        const journalEntries = rawData.SummaryJournalEntries || rawData.SuggestedJournalEntries;
        if (journalEntries && Array.isArray(journalEntries) && journalEntries.length > 0) {
          const journal_headers = ["DebitAccount", "CreditAccount", "Amount", "Narration"];
          const journal_rows = [];
          
          for (const entry of journalEntries) {
            if (typeof entry === 'object' && entry !== null) {
              const row = [
                String(entry.DebitAccount || ''),
                String(entry.CreditAccount || ''),
                String(entry.Amount || ''),
                String(entry.Narration || '')
              ];
              journal_rows.push(row);
            }
          }
          
          tabulated_data.journal_entries = {
            headers: journal_headers,
            rows: journal_rows
          };
        }
      } else {
        // Handle old format (backward compatibility)
        const basic_info = [];
        if (rawData.vendor_name) basic_info.push(["Vendor Name", String(rawData.vendor_name)]);
        if (rawData.invoice_number) basic_info.push(["Invoice Number", String(rawData.invoice_number)]);
        if (rawData.invoice_date) basic_info.push(["Invoice Date", String(rawData.invoice_date)]);
        if (rawData.total_amount) basic_info.push(["Total Amount", String(rawData.total_amount)]);
        if (rawData.tax_amount) basic_info.push(["Tax Amount", String(rawData.tax_amount)]);
        if (rawData.currency) basic_info.push(["Currency", String(rawData.currency)]);
        
        // Prioritize double-entry bookkeeping format if available
        if (rawData.double_entry_bookkeeping && rawData.double_entry_bookkeeping.journal_entry_set) {
          console.log('🎯 Creating simplified invoice table');
          
          // Create simplified headers for clean table display
          tabulated_data.headers = [
            'Invoice #',
            'Date', 
            'Vendor/Buyer',
            'Description', 
            'Amount',
            'Account Type',
            'Entry Type'
          ];
          
          // Extract invoice information
          const invoiceNumber = rawData.invoice_number || 'N/A';
          const vendorName = rawData.vendor_name || 'Unknown Vendor';
          const currency = rawData.currency || 'INR';
          const invoiceDate = rawData.invoice_date || '';
          
          // Process each journal entry set - simplified
          for (const entrySet of rawData.double_entry_bookkeeping.journal_entry_set) {
            if (entrySet && entrySet.entries) {
              // Add individual entries - only essential data
              for (const entry of entrySet.entries) {
                if (entry) {
                  const accountName = String(entry.account_name || '');
                  const accountType = String(entry.account_type || '');
                  const narration = String(entry.narration || '');
                  
                  // Determine entry type and amount
                  let entryType = '';
                  let amount = '';
                  
                  if (entry.debit_amount && entry.debit_amount !== 0) {
                    entryType = 'Debit';
                    amount = `${currency} ${entry.debit_amount}`;
                  } else if (entry.credit_amount && entry.credit_amount !== 0) {
                    entryType = 'Credit';
                    amount = `${currency} ${entry.credit_amount}`;
                  }
                  
                  // Create simplified description combining account name and narration
                  const description = accountName + (narration ? ` - ${narration}` : '');
                  
                  tabulated_data.rows.push([
                    invoiceNumber,
                    invoiceDate,
                    vendorName,
                    description,
                    amount,
                    accountType,
                    entryType
                  ]);
                }
              }
            }
          }
          
          tabulated_data.basic_info = basic_info;
          console.log('✅ Successfully created double-entry bookkeeping table');
        }
        // Fallback to India-compliant comprehensive invoice display
        else if (rawData.suggested_journal_entries && Array.isArray(rawData.suggested_journal_entries) && rawData.suggested_journal_entries.length > 0) {
          console.log('🎯 Creating simplified journal entries table');
          
          // Create simplified headers
          tabulated_data.headers = [
            'Invoice #', 
            'Date',
            'Vendor/Buyer', 
            'Description',
            'Amount', 
            'Account Type',
            'Entry Type'
          ];
          
          // Extract invoice-level information
          const invoiceNumber = rawData.invoice_number || 'N/A';
          const vendorName = rawData.vendor_name || 'Unknown Vendor';
          const currency = rawData.currency || 'INR';
          const invoiceDate = rawData.invoice_date || '';
          
          // Process suggested journal entries - simplified
          for (const entry of rawData.suggested_journal_entries) {
            if (typeof entry === 'object' && entry !== null) {
              const accountName = String(entry.account_name || '').trim();
              const accountType = String(entry.account_type || '').trim();
              const narration = String(entry.narration || '').trim();
              
              // Determine entry type and amount
              let entryType = '';
              let amount = '';
              
              if (entry.debit_amount && entry.debit_amount !== 0) {
                entryType = 'Debit';
                amount = `${currency} ${entry.debit_amount}`;
              } else if (entry.credit_amount && entry.credit_amount !== 0) {
                entryType = 'Credit';
                amount = `${currency} ${entry.credit_amount}`;
              }
              
              // Create simplified description
              const description = accountName + (narration ? ` - ${narration}` : '');
              
              if (accountName && amount) {
                tabulated_data.rows.push([
                  invoiceNumber,
                  invoiceDate,
                  vendorName,
                  description,
                  amount,
                  accountType,
                  entryType
                ]);
              }
            }
          }
          
          tabulated_data.basic_info = basic_info;
          console.log('✅ Successfully created simplified journal entries table');
        }
        // Fallback to comprehensive invoice display with accounting details
        else if (rawData.items && Array.isArray(rawData.items) && rawData.items.length > 0) {
          console.log('🎯 Creating comprehensive invoice table with accounting details');
          
          // Create comprehensive headers for invoice accounting
          tabulated_data.headers = [
            'Invoice #', 
            'Vendor/Supplier', 
            'Description', 
            'Amount', 
            'Account Type', 
            'Debit Entry', 
            'Credit Entry'
          ];
          
          // Extract invoice-level information
          const invoiceNumber = rawData.invoice_number || 'N/A';
          const vendorName = rawData.vendor_name || 'Unknown Vendor';
          const totalAmount = rawData.total_amount || '0';
          const currency = rawData.currency || '';
          const invoiceDate = rawData.invoice_date || '';
          
          // Add invoice header row
          tabulated_data.rows.push([
            '---',
            '--- INVOICE DETAILS ---',
            '---',
            '---',
            '---',
            '---',
            '---'
          ]);
          
          tabulated_data.rows.push([
            invoiceNumber,
            vendorName,
            `Invoice Date: ${invoiceDate}`,
            `Total: ${currency} ${totalAmount}`,
            'Invoice Header',
            '',
            ''
          ]);
          
          // Add separator
          tabulated_data.rows.push([
            '---',
            '--- LINE ITEMS ---',
            '---',
            '---',
            '---',
            '---',
            '---'
          ]);
          
          // Process each item with accounting context
          let itemNumber = 1;
          for (const item of rawData.items) {
            if (typeof item === 'object' && item !== null) {
              const description = String(item.description || item.item || item.particulars || '').trim();
              const quantity = String(item.quantity || item.qty || '').trim();
              const unitPrice = String(item.unit_price || item.price || item.rate || '').trim();
              const total = String(item.total || item.amount || '').trim();
              
              // Only add rows with meaningful descriptions
              if (description) {
                // Create detailed description with quantity and unit price
                let fullDescription = description;
                if (quantity && quantity !== '1') {
                  fullDescription += ` (Qty: ${quantity})`;
                }
                if (unitPrice) {
                  fullDescription += ` @ ${currency} ${unitPrice}`;
                }
                
                // Determine account type based on description
                let accountType = 'Expense';
                let debitEntry = total || '';
                
                const descLower = description.toLowerCase();
                if (descLower.includes('transport') || descLower.includes('freight')) {
                  accountType = 'Transportation Exp';
                } else if (descLower.includes('pack') || descLower.includes('loading')) {
                  accountType = 'Packing/Handling Exp';
                } else if (descLower.includes('tax') || descLower.includes('gst')) {
                  accountType = 'Tax Expense';
                } else if (descLower.includes('insurance')) {
                  accountType = 'Insurance Exp';
                } else if (descLower.includes('service')) {
                  accountType = 'Service Charges';
                }
                
                tabulated_data.rows.push([
                  invoiceNumber,
                  vendorName,
                  fullDescription,
                  total ? `${currency} ${total}` : '-',
                  accountType,
                  debitEntry ? `${currency} ${debitEntry}` : '-',
                  '-'
                ]);
                
                itemNumber++;
              }
            }
          }
          
          // Add accounts payable credit entry (balancing entry)
          if (totalAmount && totalAmount !== '0') {
            tabulated_data.rows.push([
              '---',
              '--- BALANCING ENTRY ---',
              '---',
              '---',
              '---',
              '---',
              '---'
            ]);
            
            tabulated_data.rows.push([
              invoiceNumber,
              vendorName,
              'Accounts Payable',
              `${currency} ${totalAmount}`,
              'Liability',
              '-',
              `${currency} ${totalAmount}`
            ]);
          }
          
          // Add summary row
          tabulated_data.rows.push([
            '===',
            '=== SUMMARY ===',
            '===',
            '===',
            '===',
            '===',
            '==='
          ]);
          
          tabulated_data.rows.push([
            invoiceNumber,
            vendorName,
            `Total Invoice Amount`,
            `${currency} ${totalAmount}`,
            'Total',
            `${currency} ${totalAmount}`,
            `${currency} ${totalAmount}`
          ]);
          
          tabulated_data.basic_info = basic_info;
          console.log('✅ Successfully created comprehensive invoice accounting table');
        }
        // Check if we have line items to create a table
        else if (rawData.line_items && Array.isArray(rawData.line_items) && rawData.line_items.length > 0) {
          const first_item = rawData.line_items[0];
          if (typeof first_item === 'object' && first_item !== null) {
            const headers = Object.keys(first_item);
            tabulated_data.headers = headers;
            
            // Add rows from line items
            for (const item of rawData.line_items) {
              if (typeof item === 'object' && item !== null) {
                const row = headers.map(header => String(item[header] || ''));
                tabulated_data.rows.push(row);
              }
            }
            
            tabulated_data.basic_info = basic_info;
          } else {
            // Line items are not objects, use basic info table
            tabulated_data.headers = ["Field", "Value"];
            tabulated_data.rows = basic_info;
          }
        } else if (rawData.extracted_table && Array.isArray(rawData.extracted_table) && rawData.extracted_table.length > 0) {
          // Handle extracted_table data (NEW FORMAT - flattened pipe-separated strings)
          console.log('🔧 Processing extracted_table:', rawData.extracted_table);
          console.log('🔧 Raw data keys:', Object.keys(rawData));
          console.log('🔧 First table entry type:', typeof rawData.extracted_table[0]);
          console.log('🔧 First table entry:', rawData.extracted_table[0]);
          
          try {
            // Check if it's the new flattened format (array of pipe-separated strings)
            if (typeof rawData.extracted_table[0] === 'string' && rawData.extracted_table[0].includes('|')) {
              // Parse flattened pipe-separated format with invoice optimization
              const tableRows = [];
              for (const rowString of rawData.extracted_table) {
                if (typeof rowString === 'string' && rowString.trim()) {
                  // Split by pipe and clean up each cell
                  const cells = rowString.split('|').map(cell => 
                    cell.replace(/\\n/g, ' ').trim().replace(/^N\/A$/, '') || ''
                  );
                  // Only include rows that have meaningful data
                  if (cells.some(cell => cell && cell !== '')) {
                    tableRows.push(cells);
                  }
                }
              }
              
              if (tableRows.length > 0) {
                // Optimize headers for invoice display
                const rawHeaders = tableRows[0];
                const optimizedHeaders = rawHeaders.map(header => {
                  const h = header.toLowerCase();
                  if (h.includes('sr') || h.includes('no')) return 'Sr.';
                  if (h.includes('particular') || h.includes('description') || h.includes('item')) return 'Description';
                  if (h.includes('amount') || h.includes('total') || h.includes('price')) return 'Amount';
                  if (h.includes('qty') || h.includes('quantity')) return 'Qty';
                  return header || 'Details';
                });
                
                // Process data rows for better invoice display
                const processedRows = [];
                for (let i = 1; i < tableRows.length; i++) {
                  const row = tableRows[i];
                  
                  // Skip empty rows
                  if (!row.some(cell => cell && cell.trim())) continue;
                  
                  // Optimize row data for invoice display
                  const processedRow = row.map((cell, index) => {
                    if (!cell || cell === '') return '';
                    
                    // Format amount columns
                    const header = optimizedHeaders[index]?.toLowerCase() || '';
                    if (header.includes('amount') || header.includes('price') || header.includes('total')) {
                      // Extract numeric values from amount cells
                      const numberMatch = cell.match(/[\d,]+/);
                      return numberMatch ? numberMatch[0] : cell;
                    }
                    
                    // Truncate very long descriptions
                    if (header.includes('description') && cell.length > 50) {
                      return cell.substring(0, 47) + '...';
                    }
                    
                    return cell;
                  });
                  
                  processedRows.push(processedRow);
                }
                
                tabulated_data.headers = optimizedHeaders;
                tabulated_data.rows = processedRows;
                tabulated_data.basic_info = basic_info;
                console.log('✅ Successfully parsed and optimized flattened extracted_table');
                console.log('📊 Optimized headers:', optimizedHeaders);
                console.log('📊 Processed rows:', processedRows.length);
              }
            } else if (Array.isArray(rawData.extracted_table[0])) {
              // Handle old nested array format
              tabulated_data.headers = rawData.extracted_table[0];
              tabulated_data.rows = rawData.extracted_table.slice(1);
              tabulated_data.basic_info = basic_info;
              console.log('✅ Successfully parsed nested extracted_table');
            }
          } catch (error) {
            console.error('❌ Error parsing extracted_table:', error);
            // Fallback to basic info table
            tabulated_data.headers = ["Field", "Value"];
            tabulated_data.rows = basic_info;
          }
        } else {
          // No line items or extracted_table, use basic info table
          tabulated_data.headers = ["Field", "Value"];
          tabulated_data.rows = basic_info;
        }
      }
      
      return tabulated_data;
    } catch (error) {
      console.error('Error generating table data:', error);
      return { success: false, error: String(error) };
    }
  };



  // Enhanced state for multi-file uploads
  const [batchProgress, setBatchProgress] = useState<BatchUploadProgress | null>(null);
  const [batchResults, setBatchResults] = useState<UploadResult[]>([]);
  const [isMultiUpload, setIsMultiUpload] = useState(false);
  
  // New realtime listener state
  const [currentBatchJobIds, setCurrentBatchJobIds] = useState<string[]>([]);
  const [enableListener, setEnableListener] = useState(false);
  
  // Use the realtime listener for job batch monitoring
  const {
    completedJobs,
    failedJobs,
    isComplete: isBatchComplete,
    isListening,
    totalProcessed,
    totalJobs
  } = useJobBatchListener({
    jobIds: currentBatchJobIds,
    userEmail: user?.email || '',
    enabled: enableListener && currentBatchJobIds.length > 0
  });

  // Handle individual job completion via realtime listener
  useEffect(() => {
    // Process newly completed jobs individually
    if (completedJobs.length > 0) {
      console.log(`📊 Processing ${completedJobs.length} completed jobs individually`);
      
      // Get the standard headers for Indian accounting
      const standardHeaders = [
        'Invoice Number',
        'Invoice Date', 
        'Vendor Name',
        'Total Amount',
        'Tax Amount',
        'Net Amount',
        'Description'
      ];
      
      // Convert all completed jobs to table rows
      const allRows: string[][] = [];
      
      completedJobs.forEach((job, index) => {
        if (job.result?.extracted_data) {
          console.log(`✅ Processing job ${index + 1}: ${job.job_id}`);
          const tableData = extractedDataToTableFormat(job.result.extracted_data);
          if (tableData.rows.length > 0) {
            allRows.push(...tableData.rows);
          }
        }
      });
      
      if (allRows.length > 0) {
        console.log(`📈 Updating display with ${allRows.length} total rows from ${completedJobs.length} jobs`);
        
        // Update display with all results so far - this shows results immediately as they complete
        const updatedResults = {
          headers: standardHeaders,
          rows: allRows
        };
        
        setResult(updatedResults);
        setCurrentEditedData(updatedResults);
        setOriginalData(updatedResults);
        
        // Update job status based on completion
        if (isBatchComplete) {
          setJobStatus(failedJobs.length > 0 ? 'partially_completed' : 'completed');
          console.log(`🎉 All jobs completed! Final status: ${allRows.length} invoices processed`);
          // Reset listener state
          setEnableListener(false);
          setCurrentBatchJobIds([]);
        } else {
          setJobStatus('processing'); // Still processing remaining jobs
        }
      }
    }
  }, [completedJobs, isBatchComplete, failedJobs]);

  // Helper function to convert extracted data to table format
  const extractedDataToTableFormat = useCallback((extractedData: any): { headers: string[], rows: string[][] } => {
    if (!extractedData) {
      return { headers: [], rows: [] };
    }

    // Use the 7-column simplified format based on our Indian accounting requirements
    const headers = [
      'Invoice Number',
      'Invoice Date', 
      'Vendor Name',
      'Total Amount',
      'Tax Amount',
      'Net Amount',
      'Description'
    ];

    const row = [
      extractedData.invoice_number || extractedData.bill_number || '',
      extractedData.invoice_date || extractedData.date || '',
      extractedData.vendor_name || extractedData.supplier_name || '',
      extractedData.total_amount || extractedData.amount || '',
      extractedData.tax_amount || extractedData.gst_amount || '',
      extractedData.net_amount || '',
      extractedData.description || extractedData.purpose || ''
    ];

    return { headers, rows: [row] };
  }, []);

  const handleFilesChange = useCallback((newFiles: File[]) => {
    setFiles(newFiles);
    setError(null);
    // Reset batch states when files change
    setBatchProgress(null);
    setBatchResults([]);
  }, []);

  // Start processing: upload files to queue processor
  const handleUpload = useCallback(async () => {
    if (files.length === 0) return;
    
    setIsUploading(true);
    setError(null);
    setJobStatus('idle');
    setProgress(0);
    setResult(null);
    setCurrentJobId(null);
    setBatchResults([]);

    try {
      if (files.length === 1) {
        // Single file upload (existing logic)
        setIsMultiUpload(false);
        console.log('🚀 Starting single file upload via queue-based flow...');
        const { backend_request_id } = await uploadInvoice(files[0]);
        
        if (!backend_request_id) throw new Error('No backend_request_id received');
        
        setCurrentJobId(backend_request_id);
        setJobStatus('pending');
        setProgress(0.1); // Initial progress
        
        console.log('✅ Upload successful, starting queue polling...');
        // Start polling for job status
        pollJobStatus(backend_request_id);
        setFiles([]);
        
      } else {
        // Multi-file upload
        setIsMultiUpload(true);
        console.log(`🚀 Starting multi-file upload for ${files.length} files...`);
        
        const finalProgress = await uploadMultipleFiles(files, {
          maxConcurrent: 5, // Limit concurrent uploads
          onProgress: (progress: BatchUploadProgress) => {
            setBatchProgress(progress);
            // Set overall progress based on batch completion
            setProgress(progress.progress_percentage / 100);
          },
          batchDelay: 200 // Small delay between batches
        });
        
        setBatchResults(finalProgress.results);
        
        // Check if all uploads succeeded
        const successCount = finalProgress.successful_uploads;
        const failureCount = finalProgress.failed_uploads;
        
        if (successCount === files.length) {
          setJobStatus('processing'); // Set to processing while waiting for results
          console.log(`✅ All ${files.length} files uploaded successfully`);
          
          // Start realtime listener for successful uploads
          const successfulUploads = finalProgress.results.filter(r => r.success && r.job_id);
          if (successfulUploads.length > 0) {
            console.log(`� Starting realtime listener for ${successfulUploads.length} job IDs`);
            setCurrentBatchJobIds(successfulUploads.map(r => r.job_id));
            setEnableListener(true);
          }
        } else if (successCount > 0) {
          setJobStatus('processing'); // Set to processing while waiting for partial results
          console.log(`⚠️ ${successCount}/${files.length} files uploaded successfully, ${failureCount} failed`);
          
          // Start realtime listener for partially successful uploads  
          const successfulUploads = finalProgress.results.filter(r => r.success && r.job_id);
          if (successfulUploads.length > 0) {
            console.log(`� Starting realtime listener for ${successfulUploads.length} partial job IDs`);
            setCurrentBatchJobIds(successfulUploads.map(r => r.job_id));
            setEnableListener(true);
          }
        } else {
          setJobStatus('failed');
          console.log(`❌ All ${files.length} files failed to upload`);
        }
        
        setFiles([]);
      }
    } catch (err: any) {
      console.error('❌ Upload failed:', err);
      setError(err.message || 'Upload failed');
      setJobStatus('failed');
    } finally {
      setIsUploading(false);
    }
  }, [files]);

  // Poll job status with queue processor progress tracking
  const pollJobStatus = useCallback((backend_request_id: string) => {
    let attempts = 0;
    const maxAttempts = 120; // 5 minutes total (120 * 2.5s = 300 seconds)
    const interval = 2500; // 2.5 seconds between polls
    
    console.log(`🔄 Starting queue polling for ID: ${backend_request_id}`);
    console.log(`⏱️ Will poll every ${interval/1000}s for up to ${(maxAttempts * interval)/1000/60} minutes`);
    
    const poll = async () => {
      attempts++;
      const elapsedTime = (attempts * interval) / 1000;
      
      try {
        console.log(`📡 Polling attempt ${attempts}/${maxAttempts} (${elapsedTime}s elapsed)`);
        
        const resp: JobStatusResponse = await getJobStatus(backend_request_id);
        console.log(`📊 Job status response:`, resp);
        
        // Update progress from queue processor (0.0 to 1.0)
        if (resp.progress !== undefined) {
          setProgress(resp.progress);
          console.log(`📈 Progress updated: ${(resp.progress * 100).toFixed(1)}%`);
        }
        
        // Handle status updates
        setJobStatus(resp.status);
        
        if (resp.status === 'completed') {
          console.log('✅ Job completed successfully!');
          setProgress(1.0);
          if (resp.result) {
            console.log('Raw result from backend:', resp.result);
            
            // Check for new format with tabulated_data and extracted_data
            if (resp.result.tabulated_data && resp.result.extracted_data) {
              console.log('✅ Found new format with tabulated_data');
              setResult(resp.result); // Set the entire result object with both tabulated_data and extracted_data
            } else if (resp.result.extracted_data) {
              // Legacy format with nested extracted_data
              const extractedData = resp.result.extracted_data;
              if (extractedData.error) {
                console.error('Extraction error:', extractedData.error);
                setError(`Processing error: ${extractedData.error}`);
                setResult([]);
              } else {
                setResult([extractedData]);
              }
            } else {
              // Check if we have direct invoice-related fields (old format)
              const hasInvoiceData = resp.result.vendor_name || resp.result.total_amount || resp.result.invoice_number;
              
              if (hasInvoiceData) {
                // We have invoice data - convert to array for table display
                setResult([resp.result]);
              } else if (Array.isArray(resp.result)) {
                // Array format
                setResult(resp.result);
              } else {
                // Single object format
                setResult([resp.result]);
              }
            }
          } else {
            setResult([]);
          }
        } else if (resp.status === 'failed') {
          console.log('❌ Job failed on backend');
          setJobStatus('failed');
          setError(resp.error_message || 'Job failed on backend');
        } else if (resp.status === 'processing' || resp.status === 'pending') {
          console.log(`⏳ Job ${resp.status}, continuing to poll...`);
          if (attempts < maxAttempts) {
            setTimeout(poll, interval);
          } else {
            console.log('⏰ Job polling timed out after', (maxAttempts * interval)/1000, 'seconds');
            setJobStatus('failed');
            setError(`Job processing timed out after ${Math.round((maxAttempts * interval)/1000/60)} minutes. The job may still be processing in the queue.`);
          }
        } else {
          console.log(`❓ Unknown job status: ${resp.status}, continuing to poll...`);
          if (attempts < maxAttempts) {
            setTimeout(poll, interval);
          } else {
            setJobStatus('failed');
            setError('Job polling timed out');
          }
        }
      } catch (err) {
        console.error('❌ Error polling job status:', err);
        setJobStatus('failed');
        setError(`Error polling job status: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    };
    
    // Start polling immediately
    poll();
  }, []);

  // Initialize original data and capture initial state when result is processed
  useEffect(() => {
    if (result && result.tabulated_data && result.tabulated_data.headers && result.tabulated_data.rows) {
      const initialData = {
        headers: result.tabulated_data.headers,
        rows: result.tabulated_data.rows
      };
      
      // Set original data for comparison (only set once per job)
      if (!originalData || currentJobId !== previousJobRef.current) {
        console.log('🎯 Setting up initial data for job:', currentJobId);
        setOriginalData(initialData);
        setCurrentEditedData(initialData);
        previousJobRef.current = currentJobId;
        
        // Capture initial AI-generated data
        setTimeout(() => captureInitial(), 500); // Small delay to ensure state is set
        
        console.log('🎯 Initial AI data captured for accuracy tracking');
      }
    }
  }, [result, currentJobId, captureInitial]); // Remove originalData dependency to prevent loops

  // Debug function to check stored data (development only)
  const debugStoredData = useCallback(() => {
    const localData = getLocalStoredData();
    console.log('📦 Local stored capture data:', localData);
    console.log('📊 Number of stored events:', localData.length);
    
    // Also test immediate capture
    if (currentEditedData) {
      console.log('🧪 Testing immediate capture...');
      captureEdit();
    }
  }, [getLocalStoredData, currentEditedData, captureEdit]);

  // Test function to check job data with modifications from backend
  const testJobAnalysis = useCallback(async () => {
    if (!currentJobId) {
      console.log('❌ No current job ID to test');
      return;
    }

    try {
      if (!user) {
        console.log('❌ User not authenticated');
        return;
      }
      
      const token = await user.getIdToken();
      if (!token) {
        console.log('❌ No authentication token available');
        return;
      }

      console.log('🔍 Testing job analysis endpoint for job:', currentJobId);
      
      const response = await fetch(`https://queue-processor-545188726513.asia-south1.run.app/get-job-with-modifications/${currentJobId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const jobData = await response.json();
        console.log('✅ Job analysis data:', jobData);
        console.log('📊 User modifications count:', jobData.analysis?.job_summary?.total_modifications || 0);
      } else {
        const error = await response.text();
        console.log('❌ Job analysis failed:', error);
      }
    } catch (error) {
      console.log('💥 Job analysis error:', error);
    }
  }, [currentJobId]);

  // Handler functions for the new features
  const handleDataChange = useCallback((updatedRows: string[][]) => {
    // Store the updated data for potential backup - combine with current headers
    const currentResult = currentResultRef.current;
    const currentJobIdValue = currentJobIdRef.current;
    
    if (currentResult && currentResult.tabulated_data && currentResult.tabulated_data.headers) {
      const newData = {
        headers: currentResult.tabulated_data.headers,
        rows: updatedRows
      };
      setCurrentEditedData(newData);
      
      // Silent data capture on edit with debugging
      console.log('🔄 Data changed, triggering capture...', {
        jobId: currentJobIdValue,
        hasNewData: !!newData,
        rowCount: updatedRows.length
      });
      
      captureEdit();
      
      console.log('📝 Data updated, stored for backup');
    }
  }, [captureEdit]); // Only captureEdit as dependency

  const handleUploadToCloud = useCallback(async (data: { headers: string[]; rows: string[][] }, showAlert: boolean = false) => {
    try {
      // Create both CSV and JSON versions
      const csvData = [
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

      const jsonData = JSON.stringify({ headers: data.headers, rows: data.rows }, null, 2);

      // Determine which format is smaller
      const csvSize = new Blob([csvData]).size;
      const jsonSize = new Blob([jsonData]).size;
      const useCSV = csvSize < jsonSize;

      const fileFormat = useCSV ? 'csv' : 'json';

      console.log(`📤 Uploading ${fileFormat.toUpperCase()} format (${useCSV ? csvSize : jsonSize} bytes)`);

      // Call the backend upload endpoint
      const uploadPayload = {
        headers: data.headers,
        rows: data.rows,
        format: fileFormat
      };

      // Get authenticated headers
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      const idToken = await user.getIdToken();
      
      if (!idToken) {
        throw new Error('Authentication required');
      }

      const API_BASE_URL = 'https://queue-processor-545188726513.asia-south1.run.app';

      const response = await fetch(`${API_BASE_URL}/upload-to-cloud`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(uploadPayload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();
      
      console.log(`✅ Successfully uploaded ${result.format.toUpperCase()} to Google Cloud`);
      console.log(`📁 File: ${result.filename}`);
      console.log(`📊 Size: ${result.file_size} bytes, Rows: ${result.row_count}, Columns: ${result.column_count}`);
      
      // Show success message with details only if user initiated
      if (showAlert) {
        alert(`Successfully uploaded data to Google Cloud!\n\nFormat: ${result.format.toUpperCase()}\nFile: ${result.filename}\nSize: ${result.file_size} bytes\nRows: ${result.row_count}, Columns: ${result.column_count}`);
      }
      
    } catch (error: any) {
      console.error('❌ Upload to cloud failed:', error);
      setError(`Failed to upload to Google Cloud: ${error.message}`);
    }
  }, []);

  const handleDownloadCSV = useCallback(async (data: { headers: string[]; rows: string[][] }) => {
    try {
      // Create CSV content
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

      // Create and trigger download
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoice_data_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      console.log('📥 CSV download completed');
      
      // Automatically upload as backup after download
      console.log('🔄 Creating automatic backup after download...');
      await handleUploadToCloud(data);
      
    } catch (error) {
      console.error('❌ Download failed:', error);
      setError('Failed to download CSV');
    }
  }, [handleUploadToCloud]);

  const handleRefresh = useCallback(async () => {
    // Automatically upload current edited data as backup before refreshing
    if (currentEditedData && currentEditedData.headers.length > 0 && currentEditedData.rows.length > 0) {
      console.log('🔄 Auto-uploading current data as backup before refresh...');
      try {
        await handleUploadToCloud(currentEditedData);
        console.log('✅ Backup completed before refresh');
      } catch (error) {
        console.warn('⚠️ Backup failed before refresh:', error);
        // Continue with refresh even if backup fails
      }
    }
    
    // Capture final state before reset
    if (currentEditedData) {
      captureFinal();
    }
    
    // Reset all state to allow processing next image
    setFiles([]);
    setJobStatus('idle');
    setProgress(0);
    setResult(null);
    setCurrentJobId(null);
    setError(null);
    setIsUploading(false);
    setCurrentEditedData(null);
    setOriginalData(null); // Reset original data too
    console.log('🔄 Reset for next image processing');
  }, [currentEditedData, handleUploadToCloud, captureFinal]);

  // Wrapper for user-initiated uploads (shows success alert)
  const handleUserUploadToCloud = useCallback(async (data: { headers: string[]; rows: string[][] }) => {
    await handleUploadToCloud(data, true); // true = show alert
  }, [handleUploadToCloud]);

  // Add beforeunload event listener for automatic backup on window close
  useEffect(() => {
    const handleBeforeUnload = async (event: BeforeUnloadEvent) => {
      if (currentEditedData && currentEditedData.headers.length > 0 && currentEditedData.rows.length > 0) {
        console.log('🔄 Auto-uploading current data as backup before window close...');
        
        // Prevent the default dialog and set custom message
        event.preventDefault();
        event.returnValue = 'You have unsaved changes. They will be automatically backed up to cloud storage.';
        
        // Attempt to upload in the background
        try {
          await handleUploadToCloud(currentEditedData);
          console.log('✅ Backup completed before window close');
        } catch (error) {
          console.warn('⚠️ Backup failed before window close:', error);
        }
        
        return 'You have unsaved changes. They will be automatically backed up to cloud storage.';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentEditedData, handleUploadToCloud]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
          <FileText className="w-16 h-16 text-blue-600 mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Invoice Parser</h1>
          <p className="text-gray-600 mb-6">
            Sign in with your Google account to start processing invoices and documents.
          </p>
          <EnvTest />
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
          <LoginButton className="w-full justify-center" disabled={loading} />
          <div className="mt-4 text-xs text-gray-500">
            <p>Environment: {import.meta.env.MODE}</p>
            <p>Client ID configured: {import.meta.env.VITE_GOOGLE_CLIENT_ID ? 'Yes' : 'No'}</p>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <FileText className="w-8 h-8 text-blue-600" />
              <h1 className="text-3xl font-bold text-gray-900">Invoice Parser</h1>
            </div>
            <p className="text-gray-600">
              Upload invoices, receipts, or documents (images & PDFs) to extract and analyze data
            </p>
          </div>
          {user && <UserProfile user={user} onLogout={logout} />}
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <p className="text-red-800 font-medium">Upload Error</p>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        )}

        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          {/* Auth Status Banner */}
          <AuthStatusBanner />
          
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Upload Documents</h2>
          
          {/* Enhanced Multi-File Upload - Only show if authenticated */}
          {isAuthenticated ? (
            <>
              <MultiFileUpload
                files={files}
                onFilesChange={handleFilesChange}
                onUpload={handleUpload}
                isUploading={isUploading}
                maxFiles={100}
              />

              {/* Multi-Upload Progress Display */}
              {isMultiUpload && batchProgress && (
                <div className="mt-6">
                  <MultiUploadProgress
                    progress={batchProgress}
                    isUploading={isUploading}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
              <div className="flex flex-col items-center gap-4">
                <AlertCircle className="w-12 h-12 text-gray-400" />
                <div>
                  <h3 className="text-lg font-medium text-gray-700 mb-2">
                    Authentication Required
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Please sign in with your Google account to upload and process invoice documents.
                  </p>
                  <button
                    onClick={signIn}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    Sign In with Google
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Realtime Job Processing Progress */}
          {isListening && currentBatchJobIds.length > 0 && (
            <div className="mt-6 bg-blue-50 border border-blue-200 p-4 rounded-lg">
              <h4 className="text-md font-semibold text-blue-800 mb-3 flex items-center">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing & Displaying Invoices Live ({totalProcessed}/{totalJobs})
              </h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{completedJobs.length}</div>
                  <div className="text-gray-600">Displayed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{failedJobs.length}</div>
                  <div className="text-gray-600">Failed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{totalJobs - totalProcessed}</div>
                  <div className="text-gray-600">Processing</div>
                </div>
              </div>
              <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${totalJobs > 0 ? (totalProcessed / totalJobs) * 100 : 0}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-blue-700">
                Results appear in the table below as each invoice completes processing
              </div>
            </div>
          )}

          {/* Batch Results Summary */}
          {isMultiUpload && batchResults.length > 0 && !isUploading && (
            <div className="mt-6 bg-gray-50 p-4 rounded-lg">
              <h4 className="text-md font-semibold text-gray-800 mb-3">Upload Summary</h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {batchResults.filter(r => r.success).length}
                  </div>
                  <div className="text-gray-600">Successful</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {batchResults.filter(r => !r.success).length}
                  </div>
                  <div className="text-gray-600">Failed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {batchResults.length}
                  </div>
                  <div className="text-gray-600">Total</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Job Status Panel */}
        {jobStatus !== 'idle' && (
          <JobStatusPanel 
            status={jobStatus} 
            progress={progress}
            jobId={currentJobId || undefined}
            error={error} 
          />
        )}

        {/* Results */}
        {jobStatus === 'completed' && result && (
          <div className="bg-white rounded-lg shadow-lg p-6 mt-8">
            <div className="space-y-6">
              {/* Original JSON Data */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-lg font-medium text-gray-900 mb-3">Extracted Invoice Data</h3>
                <div className="text-sm text-gray-700 space-y-1">
                  <pre className="whitespace-pre-wrap font-mono text-xs bg-white p-3 rounded border overflow-auto max-h-96">
                    {(() => {
                      console.log('🖼️ Rendering results section with result:', result);
                      // Handle both old array format and new object format with extracted_data
                      if (result && typeof result === 'object' && 'extracted_data' in result) {
                        return JSON.stringify(result.extracted_data, null, 2);
                      }
                      return JSON.stringify(result, null, 2);
                    })()}
                  </pre>
                </div>
              </div>

              {/* Tabulated Data Display - Check for new format first, then generate from old format */}
              {(() => {
                let displayData = null;
                let rawData = null;
                
                // Check if we have the new format with tabulated_data
                if (result && typeof result === 'object' && 'tabulated_data' in result && result.tabulated_data && result.tabulated_data.success) {
                  displayData = result.tabulated_data;
                  rawData = result.extracted_data;
                } else {
                  // Try to generate table data from old format
                  rawData = Array.isArray(result) ? result[0] : result;
                  if (rawData && typeof rawData === 'object') {
                    displayData = generateTableDataFromRaw(rawData);
                  }
                }
                
                if (displayData && displayData.success !== false && displayData.headers && displayData.rows && displayData.rows.length > 0) {
                  return (
                    <div>
                      <EditableTable
                        headers={displayData.headers}
                        initialRows={displayData.rows}
                        onDataChange={handleDataChange}
                        onCellSave={() => {
                          console.log('📱 Cell save triggered, capturing edit state...');
                          captureEdit();
                        }}
                        onDownloadCSV={handleDownloadCSV}
                        onUploadToCloud={handleUserUploadToCloud}
                        onRefresh={handleRefresh}
                        title="📊 Editable Invoice Data"
                      />
                      
                      {/* Debug Button for Data Capture Testing (Development Only) */}
                      {import.meta.env.DEV && (
                        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex gap-2 flex-wrap">
                            <button
                              onClick={debugStoredData}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                            >
                              🔍 Debug Data Capture
                            </button>
                            <button
                              onClick={() => {
                                console.log('🚀 Manual capture test...', {
                                  jobId: currentJobId,
                                  hasCurrentData: !!currentEditedData,
                                  hasOriginalData: !!originalData
                                });
                                captureEdit();
                              }}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                            >
                              📸 Test Capture
                            </button>
                            <button
                              onClick={testJobAnalysis}
                              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                            >
                              🔬 Test Job Analysis
                            </button>
                          </div>
                          <p className="text-xs text-blue-600 mt-1">
                            Debug tools: Check console for stored data and test immediate capture
                          </p>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}

              {/* Additional sections for Basic Invoice Information and Journal Entries */}
              {(() => {
                let displayData = null;
                
                // Check if we have the new format with tabulated_data
                if (result && typeof result === 'object' && 'tabulated_data' in result && result.tabulated_data && result.tabulated_data.success) {
                  displayData = result.tabulated_data;
                } else {
                  // Try to generate table data from old format
                  const rawData = Array.isArray(result) ? result[0] : result;
                  if (rawData && typeof rawData === 'object') {
                    displayData = generateTableDataFromRaw(rawData);
                  }
                }
                
                if (displayData && displayData.success !== false) {
                  return (
                    <div className="space-y-4 mt-6">
                      {/* Basic Invoice Information */}
                      {displayData.basic_info && displayData.basic_info.length > 0 && (
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <h4 className="text-md font-semibold text-gray-800 mb-3">📋 Invoice Summary</h4>
                          <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
                            <table className="min-w-full">
                              <tbody>
                                {displayData.basic_info.map((info: string[], infoIndex: number) => (
                                  <tr key={infoIndex} className={infoIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                    <td className="px-4 py-3 text-sm font-medium text-gray-700 border-b border-gray-200 w-1/3">
                                      {info[0]}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-900 border-b border-gray-200 font-mono">
                                      {info[1] || '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      
                      {/* Journal Entries Table */}
                      {displayData.journal_entries && displayData.journal_entries.headers && displayData.journal_entries.rows && displayData.journal_entries.rows.length > 0 && (
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <h4 className="text-md font-semibold text-gray-800 mb-3">💰 Suggested Journal Entries (Double Entry)</h4>
                          <div className="bg-white rounded-lg border border-gray-300 overflow-hidden">
                            <table className="min-w-full">
                              <thead className="bg-green-100">
                                <tr>
                                  {displayData.journal_entries.headers.map((header: string, index: number) => (
                                    <th 
                                      key={index} 
                                      className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b border-gray-300"
                                    >
                                      {header.replace(/([A-Z])/g, ' $1').trim()}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {displayData.journal_entries.rows.map((row: string[], rowIndex: number) => (
                                  <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-green-50'}>
                                    {row.map((cell: string, cellIndex: number) => (
                                      <td 
                                        key={cellIndex} 
                                        className={`px-4 py-3 text-sm border-b border-gray-200 ${
                                          cellIndex === 2 ? 'text-gray-900 font-mono font-medium' : 'text-gray-700'
                                        }`}
                                      >
                                        {cell || '-'}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}

              {/* Show note if tabulation failed */}
              {result && typeof result === 'object' && 'tabulated_data' in result && result.tabulated_data && !result.tabulated_data.success && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="text-yellow-600">⚠️</div>
                    <div>
                      <h4 className="text-yellow-800 font-medium">Table View Unavailable</h4>
                      <p className="text-yellow-700 text-sm mt-1">
                        Could not generate table format for this data. The raw extracted data is available above.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Show message when job completes but no valid results */}
        {jobStatus === 'completed' && !result && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mt-8">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="text-yellow-800 font-medium">Processing Complete</p>
                <p className="text-yellow-700 text-sm mt-1">
                  The job finished processing, but no valid data was extracted. This could be due to:
                </p>
                <ul className="text-yellow-700 text-sm mt-2 list-disc list-inside">
                  <li>Unsupported file format</li>
                  <li>Poor image quality</li>
                  <li>Non-invoice document</li>
                  <li>Processing error</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Token Debug Panel - only show when authenticated */}
        {user && (
          <div className="mt-8">
            <TokenDebugPanel />
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-center text-gray-500 text-sm">
          <p>Supported formats: JPG, PNG, GIF, WebP, PDF • Secure processing with Google authentication</p>
        </div>
      </div>
    </div>
  );
};

// Login page component
const LoginPage: React.FC = () => {
  const { error, loading } = useAuth();
  
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
        <FileText className="w-16 h-16 text-blue-600 mx-auto mb-6" />
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Invoice Parser</h1>
        <p className="text-gray-600 mb-6">
          Sign in with your Google account to start processing invoices and documents.
        </p>
        <EnvTest />
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
        <LoginButton className="w-full justify-center" disabled={loading} />
        <div className="mt-4 text-xs text-gray-500">
          <p>Environment: {import.meta.env.MODE}</p>
          <p>Client ID configured: {import.meta.env.VITE_GOOGLE_CLIENT_ID ? 'Yes' : 'No'}</p>
        </div>
      </div>
    </div>
  );
};

function App() {
  const { isAuthenticated, loading } = useAuth();
  
  return (
    <Router>
      <Routes>
        {/* Public routes */}
        <Route path="/oauth2/callback" element={<AuthCallback />} />
        
        {/* Conditionally render main app or login page */}
        <Route
          path="/"
          element={
            loading ? (
              <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
              </div>
            ) : isAuthenticated ? (
              <MainApp />
            ) : (
              <LoginPage />
            )
          }
        />
        
        {/* Protected routes */}
        <Route path="/dashboard" element={
          <AuthGuard>
            <MainApp />
          </AuthGuard>
        } />
        
        {/* Catch all route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;