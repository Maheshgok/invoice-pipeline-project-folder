import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'react-hot-toast';
import type { NetworkStatus } from '../services/pwaService';
import { uploadService, type UploadFile } from '../services/uploadService';
import { authService } from '../services/auth';

interface FileUploadProps {
  networkStatus: NetworkStatus;
  onFilesUploaded?: (files: UploadFile[]) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ networkStatus, onFilesUploaded }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadFile[]>([]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!networkStatus.isOnline) {
      toast.error('Upload requires internet connection');
      return;
    }

    if (!authService.isAuthenticated()) {
      toast.error('Please sign in to upload files');
      return;
    }

    setIsUploading(true);

    const newUploadFiles: UploadFile[] = [];

    for (const file of acceptedFiles) {
      // Validate file
      const validation = uploadService.validateFile(file);
      if (!validation.valid) {
        toast.error(`${file.name}: ${validation.error}`);
        continue;
      }

      // Create upload file object
      const uploadFile: UploadFile = {
        id: uploadService.generateFileId(),
        file,
        fileName: file.name,
        status: 'pending',
        progress: 0,
        localPreviewUrl: uploadService.createLocalPreviewUrl(file)
      };

      newUploadFiles.push(uploadFile);
      setUploadedFiles(prev => [...prev, uploadFile]);

      try {
        // Update status to uploading
        uploadFile.status = 'uploading';
        uploadFile.progress = 25;
        setUploadedFiles(prev => prev.map(f => f.id === uploadFile.id ? { ...uploadFile } : f));

        // Upload file
        const result = await uploadService.uploadFile(file);
        
        // Update with job ID and set to processing
        uploadFile.status = 'processing';
        uploadFile.progress = 75;
        uploadFile.jobId = result.jobId;
        
        setUploadedFiles(prev => prev.map(f => f.id === uploadFile.id ? { ...uploadFile } : f));

        toast.success(`Uploaded: ${file.name} - Processing...`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        
        uploadFile.status = 'error';
        uploadFile.progress = 0;
        uploadFile.error = errorMessage;
        
        setUploadedFiles(prev => prev.map(f => f.id === uploadFile.id ? { ...uploadFile } : f));
        
        toast.error(`Upload failed: ${file.name} - ${errorMessage}`);
      }
    }

    if (onFilesUploaded && newUploadFiles.length > 0) {
      onFilesUploaded(newUploadFiles);
    }

    setIsUploading(false);
  }, [networkStatus.isOnline, onFilesUploaded]);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
      'application/pdf': ['.pdf']
    },
    maxFiles: 10,
    maxSize: 10 * 1024 * 1024, // 10MB
    disabled: !networkStatus.isOnline || isUploading
  });

  const clearFiles = () => {
    // Clean up object URLs
    uploadedFiles.forEach(file => {
      if (file.localPreviewUrl) {
        uploadService.revokeLocalPreviewUrl(file.localPreviewUrl);
      }
    });
    setUploadedFiles([]);
  };

  return (
    <div className="p-4 pb-20">
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Upload Invoices</h2>
        
        {!networkStatus.isOnline ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <div className="flex items-center space-x-2">
              <span className="text-yellow-600">⚠️</span>
              <span className="text-sm text-yellow-700">
                Upload is disabled while offline. Connect to internet to upload files.
              </span>
            </div>
          </div>
        ) : null}

        {!authService.isAuthenticated() ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="flex items-center space-x-2">
              <span className="text-blue-600">ℹ️</span>
              <span className="text-sm text-blue-700">
                Please sign in to upload and process invoices.
              </span>
            </div>
          </div>
        ) : null}
        
        <div 
          {...getRootProps()} 
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
            isDragActive 
              ? 'border-primary-500 bg-primary-50' 
              : networkStatus.isOnline && authService.isAuthenticated()
                ? 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
                : 'border-gray-200 bg-gray-50 cursor-not-allowed'
          }`}
        >
          <input {...getInputProps()} />
          
          <span className="text-4xl mb-4 block">
            {isUploading ? '⏳' : '📁'}
          </span>
          
          <p className="text-lg font-medium text-gray-700 mb-2">
            {isUploading 
              ? 'Uploading files...' 
              : isDragActive 
                ? 'Drop files here' 
                : networkStatus.isOnline && authService.isAuthenticated()
                  ? 'Drop files here or tap to browse'
                  : 'Upload unavailable'
            }
          </p>
          
          <p className="text-sm text-gray-500 mb-4">
            Supports PDF, JPG, PNG files up to 10MB
          </p>
          
          <button 
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              networkStatus.isOnline && authService.isAuthenticated() && !isUploading
                ? 'bg-primary-500 text-white hover:bg-primary-600' 
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
            disabled={!networkStatus.isOnline || !authService.isAuthenticated() || isUploading}
          >
            {isUploading ? 'Uploading...' : networkStatus.isOnline ? 'Choose Files' : 'Offline'}
          </button>
        </div>

        {/* File Rejections */}
        {fileRejections.length > 0 && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-red-800 mb-2">Some files were rejected:</h4>
            <ul className="text-sm text-red-700 space-y-1">
              {fileRejections.map((rejection, index) => (
                <li key={index}>
                  <strong>{rejection.file.name}</strong>: {rejection.errors.map(e => e.message).join(', ')}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Uploaded Files */}
        {uploadedFiles.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-gray-900">Uploaded Files</h3>
              <button 
                onClick={clearFiles}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Clear All
              </button>
            </div>
            
            <div className="space-y-3">
              {uploadedFiles.map((file) => (
                <div key={file.id} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {file.fileName}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      file.status === 'completed' ? 'bg-green-100 text-green-700' :
                      file.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                      file.status === 'error' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {file.status}
                    </span>
                  </div>
                  
                  {file.status !== 'error' && (
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-primary-500 h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${file.progress}%` }}
                      ></div>
                    </div>
                  )}
                  
                  {file.error && (
                    <p className="text-xs text-red-600 mt-1">{file.error}</p>
                  )}
                  
                  {file.jobId && (
                    <p className="text-xs text-gray-500 mt-1">Job ID: {file.jobId}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUpload;