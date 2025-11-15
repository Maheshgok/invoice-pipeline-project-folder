import React, { useState, useCallback, useEffect, useRef } from 'react';
import { X, Download, Upload, RefreshCw, Edit2 } from 'lucide-react';

interface EditableTableProps {
  headers: string[];
  initialRows: string[][];
  onDataChange?: (rows: string[][]) => void;
  onCellSave?: () => void; // New callback for when a cell edit is saved
  onDownloadCSV?: (data: { headers: string[]; rows: string[][] }) => void;
  onUploadToCloud?: (data: { headers: string[]; rows: string[][] }) => void;
  onRefresh?: () => void;
  title?: string;
}

interface EditingCell {
  rowIndex: number;
  cellIndex: number;
}

const EditableTable: React.FC<EditableTableProps> = ({
  headers,
  initialRows,
  onDataChange,
  onCellSave,
  onDownloadCSV,
  onUploadToCloud,
  onRefresh,
  title = "📊 Editable Data Table"
}) => {
  const [rows, setRows] = useState<string[][]>(initialRows);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [isModified, setIsModified] = useState<boolean>(false);
  
  // Use refs to prevent render loops
  const isInternalUpdate = useRef(false);
  const currentRowsRef = useRef<string[][]>(initialRows);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update rows when initialRows change (but only if it's not from our own update)
  useEffect(() => {
    if (!isInternalUpdate.current) {
      setRows(initialRows);
      currentRowsRef.current = initialRows;
      setIsModified(false);
    }
    isInternalUpdate.current = false;
  }, [initialRows]);

  // Optimized data sync - only call onDataChange when we make changes
  const syncDataChange = useCallback((newRows: string[][]) => {
    if (onDataChange) {
      isInternalUpdate.current = true;
      currentRowsRef.current = newRows;
      onDataChange(newRows);
    }
  }, [onDataChange]);

  // COMPLETELY STABLE auto-save function (no dependencies that change)
  const autoSaveDraft = useCallback((value: string, rowIndex: number, cellIndex: number) => {
    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    // Set new timeout for auto-save
    autoSaveTimeoutRef.current = setTimeout(() => {
      const draftKey = `edit-draft-${rowIndex}-${cellIndex}`;
      localStorage.setItem(draftKey, value);
      console.log('🔄 Auto-saved draft to localStorage');
    }, 1000);
  }, []); // EMPTY dependencies - completely stable

  // COMPLETELY STABLE textarea handler (no React state dependencies)
  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const textarea = e.target;
    const cursorPos = textarea.selectionStart;
    
    // Simple cursor tracking
    console.log('✏️ CURSOR:', cursorPos, 'VALUE:', newValue.length);
    
    // DON'T update React state - keep textarea uncontrolled
    // setEditValue(newValue);
    
    // Get current editing info from DOM/refs instead of state
    const currentEditingElement = document.querySelector('[data-editing="true"]');
    if (currentEditingElement) {
      const rowIndex = parseInt(currentEditingElement.getAttribute('data-row') || '0');
      const cellIndex = parseInt(currentEditingElement.getAttribute('data-cell') || '0');
      autoSaveDraft(newValue, rowIndex, cellIndex);
    }
  }, []); // COMPLETELY EMPTY - no React dependencies

  const startEditing = useCallback((rowIndex: number, cellIndex: number) => {
    const cellValue = rows[rowIndex][cellIndex] || '';
    console.log('🔍 Starting edit:', {
      rowIndex,
      cellIndex,
      originalValue: cellValue,
      valueLength: cellValue.length,
      valueBytes: new TextEncoder().encode(cellValue)
    });
    
    setEditingCell({ rowIndex, cellIndex });
    setEditValue(cellValue); // Keep for save logic, but textarea will be uncontrolled
    
    // Set data attributes for uncontrolled textarea to find
    setTimeout(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.value = cellValue; // Set initial value directly
        textarea.focus();
        textarea.setSelectionRange(cellValue.length, cellValue.length); // Cursor at end
      }
    }, 0);
  }, [rows]);

  const saveEdit = useCallback(() => {
    if (editingCell) {
      // Clean up auto-save timeout
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
      
      // Get value directly from textarea (uncontrolled)
      const currentValue = textareaRef.current?.value || editValue;
      
      const newRows = [...rows];
      newRows[editingCell.rowIndex][editingCell.cellIndex] = currentValue;
      setRows(newRows);
      setIsModified(true);
      setEditingCell(null);
      setEditValue('');
      
      // Clear any draft from localStorage
      const draftKey = `edit-draft-${editingCell.rowIndex}-${editingCell.cellIndex}`;
      localStorage.removeItem(draftKey);
      
      // Sync to parent immediately
      syncDataChange(newRows);
      
      // Call the cell save callback for immediate capture
      onCellSave?.();
      
      console.log('💾 Cell saved, draft cleared, data synced to cloud, and capture triggered');
    }
  }, [editingCell, editValue, rows, syncDataChange, onCellSave]);

  const cancelEdit = useCallback(() => {
    // Clean up auto-save timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    
    setEditingCell(null);
    setEditValue('');
  }, []);

  const addRow = useCallback(() => {
    const newRow = new Array(headers.length).fill('');
    const newRows = [...rows, newRow];
    setRows(newRows);
    setIsModified(true);
    
    // Sync to parent immediately
    syncDataChange(newRows);
  }, [headers.length, rows, syncDataChange]);

  // Stable Modal Editor Component (no re-renders, no cursor jumps)
  const ModalEditor = useCallback(() => {
    if (!editingCell) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        {/* Modal Container - centered, stable positioning */}
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Edit Cell
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-medium text-blue-600">{headers[editingCell.cellIndex]}</span> 
                  {' '} • Row {editingCell.rowIndex + 1}
                </p>
              </div>
              <button
                onClick={cancelEdit}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Close (Escape)"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
          
          {/* Content */}
          <div className="px-6 py-4 flex-1 min-h-0">
            <textarea
              ref={textareaRef}
              key={`edit-${editingCell.rowIndex}-${editingCell.cellIndex}`}
              data-editing="true"
              data-row={editingCell.rowIndex}
              data-cell={editingCell.cellIndex}
              onChange={handleTextareaChange}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEdit();
                } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  saveEdit();
                }
              }}
              className="w-full h-full min-h-[200px] px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono resize-none"
              autoFocus
              placeholder={`Enter your text here...

💡 Tips:
• Ctrl/Cmd + Enter to save
• Escape to cancel
• Changes auto-sync on save`}
              spellCheck={false}
            />
          </div>
          
          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500">
                <span className="inline-flex items-center gap-1">
                  💾 Auto-saves drafts • 🌐 Syncs to cloud on save
                </span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={cancelEdit}
                  className="px-4 py-2 text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  className="px-6 py-2 text-white bg-blue-600 border border-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors text-sm font-medium"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }, [editingCell, headers, cancelEdit, saveEdit]);

  const deleteRow = useCallback((rowIndex: number) => {
    const newRows = rows.filter((_, index) => index !== rowIndex);
    setRows(newRows);
    setIsModified(true);
    
    // Sync to parent immediately
    syncDataChange(newRows);
  }, [rows, syncDataChange]);

  const handleDownload = useCallback(() => {
    if (onDownloadCSV) {
      onDownloadCSV({ headers, rows });
    }
  }, [onDownloadCSV, headers, rows]);

  const handleUpload = useCallback(() => {
    if (onUploadToCloud) {
      onUploadToCloud({ headers, rows });
    }
  }, [onUploadToCloud, headers, rows]);

  return (
    <>
      {/* Modal Editor */}
      <ModalEditor />
      
      <div className="bg-blue-50 p-4 rounded-lg">
      {/* Header with Actions */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">{title}</h3>
          {isModified && (
            <p className="text-sm text-blue-600 mt-1">✏️ Table has been modified</p>
          )}
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={addRow}
            className="flex items-center gap-1 bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700 transition-colors text-sm"
            title="Add new row"
          >
            + Add Row
          </button>
          
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 transition-colors text-sm"
            title="Download as CSV"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
          
          <button
            onClick={handleUpload}
            className="flex items-center gap-1 bg-purple-600 text-white px-3 py-1 rounded-md hover:bg-purple-700 transition-colors text-sm"
            title="Upload to Google Cloud"
          >
            <Upload className="w-4 h-4" />
            Cloud
          </button>
          
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="flex items-center gap-1 bg-gray-600 text-white px-3 py-1 rounded-md hover:bg-gray-700 transition-colors text-sm"
              title="Process next image"
            >
              <RefreshCw className="w-4 h-4" />
              Next
            </button>
          )}
        </div>
      </div>

      {/* Main Data Table */}
      {rows.length > 0 && (
        <div className="overflow-x-auto mb-4">
          <table className="min-w-full bg-white border border-gray-300 rounded-lg shadow-sm table-fixed">
            <thead className="bg-gray-100">
              <tr>
                {headers.map((header: string, index: number) => {
                  // Optimize column widths for invoice data
                  let colClass = "px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b border-gray-300";
                  const headerLower = header.toLowerCase();
                  
                  if (headerLower.includes('sr') || headerLower.includes('no') || headerLower.includes('invoice')) {
                    colClass += " w-24"; // Invoice number - medium
                  } else if (headerLower.includes('qty') || headerLower.includes('quantity')) {
                    colClass += " w-20"; // Quantity - narrow
                  } else if (headerLower.includes('amount') || headerLower.includes('price') || headerLower.includes('total') || 
                            headerLower.includes('debit') || headerLower.includes('credit')) {
                    colClass += " w-32 text-right"; // Amount columns - medium, right-aligned
                  } else if (headerLower.includes('vendor') || headerLower.includes('supplier') || headerLower.includes('buyer')) {
                    colClass += " w-40"; // Vendor/Supplier - medium-large
                  } else if (headerLower.includes('account') || headerLower.includes('type')) {
                    colClass += " w-32"; // Account type - medium
                  } else if (headerLower.includes('description') || headerLower.includes('particular') || headerLower.includes('item')) {
                    colClass += " w-auto min-w-64"; // Description - flexible but with minimum
                  } else {
                    colClass += " w-40"; // Default medium width
                  }
                  
                  return (
                    <th key={index} className={colClass}>
                      {header}
                    </th>
                  );
                })}
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b border-gray-300 w-20">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: string[], rowIndex: number) => {
                return (
                <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  {row.map((cell: string, cellIndex: number) => {
                    // Apply specific styling for amount columns
                    const header = headers[cellIndex]?.toLowerCase() || '';
                    let cellClass = "px-4 py-4 text-sm border-b border-gray-200 relative";
                    
                    if (header.includes('amount') || header.includes('price') || header.includes('total') ||
                        header.includes('debit') || header.includes('credit')) {
                      cellClass += " text-right font-medium"; // Right-align amounts
                      if (cell && cell !== '-' && cell !== '' && !cell.includes('---') && !cell.includes('===')) {
                        cellClass += " text-green-700"; // Green for amounts
                      }
                    }
                    
                    // Special styling for separator rows
                    if (cell && (cell.includes('---') || cell.includes('==='))) {
                      cellClass += " bg-gray-100 font-semibold text-gray-600 text-center";
                    }
                    
                    return (
                      <td key={cellIndex} className={cellClass}>
                        <div 
                          className={`cursor-pointer hover:bg-blue-50 p-2 rounded group min-h-8 flex items-center transition-colors border border-transparent hover:border-blue-200 ${
                            editingCell?.rowIndex === rowIndex && editingCell?.cellIndex === cellIndex 
                              ? 'bg-blue-100 border-blue-400 ring-2 ring-blue-200' 
                              : ''
                          }`}
                          onClick={() => startEditing(rowIndex, cellIndex)}
                          title="Click to edit"
                        >
                          <span className="text-gray-700 flex-1 break-words">{cell || '-'}</span>
                        {editingCell?.rowIndex === rowIndex && editingCell?.cellIndex === cellIndex ? (
                          <span className="text-blue-600 text-xs ml-1">Editing...</span>
                        ) : (
                          <Edit2 className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity ml-1 flex-shrink-0" />
                        )}
                      </div>
                    </td>
                    );
                  })}
                  <td className="px-4 py-3 text-sm border-b border-gray-200">
                    <button
                      onClick={() => deleteRow(rowIndex)}
                      className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded hover:bg-red-50 transition-colors"
                      title="Delete row"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>No data available. Click "Add Row" to start.</p>
        </div>
      )}
      </div>
    </>
  );
};

export default React.memo(EditableTable);