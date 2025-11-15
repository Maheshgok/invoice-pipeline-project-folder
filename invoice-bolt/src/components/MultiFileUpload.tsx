import React, { useCallback, useState } from 'react';
import { Upload, X, FileIcon, ImageIcon, AlertTriangle, CheckCircle } from 'lucide-react';

interface FileUploadProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  onUpload: () => void;
  isUploading: boolean;
  maxFiles?: number;
}

const MultiFileUpload: React.FC<FileUploadProps> = ({ 
  files, 
  onFilesChange, 
  onUpload, 
  isUploading,
  maxFiles = 100 
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const validateFiles = (newFiles: File[]): { valid: File[], errors: string[] } => {
    const validFiles: File[] = [];
    const validationErrors: string[] = [];
    
    for (const file of newFiles) {
      // Check file type
      const isValidType = file.type.startsWith('image/') || 
                         file.type === 'application/pdf' ||
                         file.name.toLowerCase().endsWith('.pdf');
      
      if (!isValidType) {
        validationErrors.push(`${file.name}: Invalid file type. Only images and PDFs are allowed.`);
        continue;
      }
      
      // Check file size (50MB limit)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        validationErrors.push(`${file.name}: File too large. Maximum size is 50MB.`);
        continue;
      }
      
      // Check for duplicates
      const isDuplicate = files.some(existingFile => 
        existingFile.name === file.name && existingFile.size === file.size
      );
      
      if (isDuplicate) {
        validationErrors.push(`${file.name}: File already added.`);
        continue;
      }
      
      validFiles.push(file);
    }
    
    return { valid: validFiles, errors: validationErrors };
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    const { valid: validFiles, errors: validationErrors } = validateFiles(droppedFiles);
    
    setErrors(validationErrors);
    
    if (validFiles.length > 0) {
      const newTotal = files.length + validFiles.length;
      if (newTotal > maxFiles) {
        const allowedCount = maxFiles - files.length;
        const allowedFiles = validFiles.slice(0, allowedCount);
        onFilesChange([...files, ...allowedFiles]);
        setErrors(prev => [...prev, `Only ${allowedCount} files added. Maximum ${maxFiles} files allowed.`]);
      } else {
        onFilesChange([...files, ...validFiles]);
      }
    }
  }, [files, onFilesChange, maxFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      const { valid: validFiles, errors: validationErrors } = validateFiles(selectedFiles);
      
      setErrors(validationErrors);
      
      if (validFiles.length > 0) {
        const newTotal = files.length + validFiles.length;
        if (newTotal > maxFiles) {
          const allowedCount = maxFiles - files.length;
          const allowedFiles = validFiles.slice(0, allowedCount);
          onFilesChange([...files, ...allowedFiles]);
          setErrors(prev => [...prev, `Only ${allowedCount} files added. Maximum ${maxFiles} files allowed.`]);
        } else {
          onFilesChange([...files, ...validFiles]);
        }
      }
    }
    // Reset input value to allow selecting the same files again
    e.target.value = '';
  }, [files, onFilesChange, maxFiles]);

  const removeFile = useCallback((index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    onFilesChange(newFiles);
    setErrors([]); // Clear errors when files are removed
  }, [files, onFilesChange]);

  const clearAllFiles = useCallback(() => {
    onFilesChange([]);
    setErrors([]);
  }, [onFilesChange]);

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <ImageIcon className="w-4 h-4 text-green-600" />;
    } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      return <FileIcon className="w-4 h-4 text-red-600" />;
    }
    return <FileIcon className="w-4 h-4 text-blue-600" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getTotalSize = () => {
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    return formatFileSize(totalBytes);
  };

  const getFileTypeBreakdown = () => {
    const images = files.filter(f => f.type.startsWith('image/')).length;
    const pdfs = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')).length;
    return { images, pdfs };
  };

  return (
    <div className="space-y-4">
      {/* Errors Display */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="text-red-800 font-medium text-sm">Upload Issues:</h4>
              <ul className="text-red-700 text-sm mt-1 space-y-1">
                {errors.map((error, index) => (
                  <li key={index} className="text-xs">• {error}</li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => setErrors([])}
              className="text-red-400 hover:text-red-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* File Summary */}
      {files.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-blue-600" />
              <h3 className="text-blue-800 font-medium">
                {files.length} file{files.length !== 1 ? 's' : ''} ready for upload
              </h3>
            </div>
            <button
              onClick={clearAllFiles}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              disabled={isUploading}
            >
              Clear All
            </button>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="bg-white rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-blue-600">{files.length}</div>
              <div className="text-gray-600">Total Files</div>
            </div>
            <div className="bg-white rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-green-600">{getFileTypeBreakdown().images}</div>
              <div className="text-gray-600">Images</div>
            </div>
            <div className="bg-white rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-red-600">{getFileTypeBreakdown().pdfs}</div>
              <div className="text-gray-600">PDFs</div>
            </div>
            <div className="bg-white rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-purple-600">{getTotalSize()}</div>
              <div className="text-gray-600">Total Size</div>
            </div>
          </div>
        </div>
      )}

      {/* File List */}
      {files.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4 max-h-60 overflow-y-auto">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Selected Files:</h4>
          <div className="space-y-2">
            {files.map((file, index) => (
              <div key={index} className="flex items-center bg-white rounded-md px-3 py-2 text-sm border shadow-sm">
                {getFileIcon(file)}
                <div className="flex-1 ml-3 min-w-0">
                  <div className="text-gray-700 truncate font-medium">{file.name}</div>
                  <div className="text-gray-400 text-xs">
                    {formatFileSize(file.size)} • {file.type || 'Unknown type'}
                  </div>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="text-gray-400 hover:text-red-500 transition-colors ml-2"
                  disabled={isUploading}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragOver
            ? 'border-blue-500 bg-blue-50'
            : files.length >= maxFiles
            ? 'border-gray-200 bg-gray-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Upload className={`w-12 h-12 mx-auto mb-4 ${
          files.length >= maxFiles ? 'text-gray-300' : 'text-gray-400'
        }`} />
        
        {files.length >= maxFiles ? (
          <div>
            <p className="text-lg font-medium text-gray-500 mb-2">
              Maximum files reached ({maxFiles})
            </p>
            <p className="text-sm text-gray-400">
              Remove some files to add more
            </p>
          </div>
        ) : (
          <div>
            <p className="text-lg font-medium text-gray-700 mb-2">
              Drop files here or click to browse
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Supports images (JPG, PNG, GIF, WebP) and PDF documents
            </p>
            <p className="text-xs text-gray-400 mb-4">
              Maximum {maxFiles} files • 50MB per file • {files.length}/{maxFiles} selected
            </p>
          </div>
        )}
        
        <input
          type="file"
          multiple
          accept="image/*,.pdf"
          onChange={handleFileInput}
          className="hidden"
          id="multi-file-input"
          disabled={files.length >= maxFiles}
        />
        
        <div className="flex justify-center gap-4">
          <label
            htmlFor="multi-file-input"
            className={`px-6 py-2 rounded-md transition-colors cursor-pointer ${
              files.length >= maxFiles
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            Browse Files
          </label>
          
          <button
            onClick={onUpload}
            disabled={files.length === 0 || isUploading}
            className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isUploading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Uploading...
              </span>
            ) : (
              `Upload & Process ${files.length > 0 ? `(${files.length} files)` : ''}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MultiFileUpload;