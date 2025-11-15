import React from 'react';
import { CheckCircle, XCircle, Clock, Loader2, FileIcon, ImageIcon } from 'lucide-react';
import { BatchUploadProgress, UploadResult } from '../services/multiUploadApi';

interface MultiUploadProgressProps {
  progress: BatchUploadProgress | null;
  isUploading: boolean;
}

const MultiUploadProgress: React.FC<MultiUploadProgressProps> = ({ progress, isUploading }) => {
  if (!progress && !isUploading) return null;

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <ImageIcon className="w-4 h-4 text-green-600" />;
    }
    return <FileIcon className="w-4 h-4 text-red-600" />;
  };

  const getStatusIcon = (result: UploadResult) => {
    if (result.success) {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    } else {
      return <XCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
  };

  if (!progress) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
          <span className="text-blue-800 font-medium">Preparing uploads...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      {/* Overall Progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-800">
            Upload Progress
          </h3>
          <span className="text-sm text-gray-500">
            {progress.completed_uploads}/{progress.total_files} files
          </span>
        </div>
        
        <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress.progress_percentage}%` }}
          ></div>
        </div>
        
        <div className="flex justify-between text-sm text-gray-600">
          <span>{progress.progress_percentage}% complete</span>
          <span>
            ✅ {progress.successful_uploads} success • 
            ❌ {progress.failed_uploads} failed
          </span>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-blue-600">{progress.total_files}</div>
          <div className="text-xs text-gray-600">Total Files</div>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-green-600">{progress.successful_uploads}</div>
          <div className="text-xs text-gray-600">Successful</div>
        </div>
        <div className="bg-red-50 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-red-600">{progress.failed_uploads}</div>
          <div className="text-xs text-gray-600">Failed</div>
        </div>
        <div className="bg-yellow-50 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-yellow-600">
            {progress.total_files - progress.completed_uploads}
          </div>
          <div className="text-xs text-gray-600">Pending</div>
        </div>
      </div>

      {/* Individual File Status */}
      {progress.results.length > 0 && (
        <div>
          <h4 className="text-md font-medium text-gray-700 mb-3">File Status:</h4>
          <div className="max-h-48 overflow-y-auto space-y-2">
            {progress.results.map((result, index) => (
              <div key={index} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                {getFileIcon(result.file)}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-700 truncate">
                    {result.file.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatFileSize(result.file.size)} • {result.upload_time}ms
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {result.success && result.job_id && (
                    <span className="text-xs text-blue-600 font-mono bg-blue-50 px-2 py-1 rounded">
                      {result.job_id.split('_').pop()}
                    </span>
                  )}
                  {getStatusIcon(result)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Failed Uploads Details */}
      {progress.failed_uploads > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <h4 className="text-red-800 font-medium text-sm mb-2">Failed Uploads:</h4>
          <div className="space-y-1">
            {progress.results
              .filter(result => !result.success)
              .map((result, index) => (
                <div key={index} className="text-xs text-red-700">
                  <span className="font-medium">{result.file.name}:</span>{' '}
                  {result.error || 'Unknown error'}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Completion Message */}
      {progress.is_complete && (
        <div className={`border rounded-lg p-3 ${
          progress.failed_uploads === 0 
            ? 'bg-green-50 border-green-200' 
            : 'bg-yellow-50 border-yellow-200'
        }`}>
          <div className="flex items-center gap-2">
            {progress.failed_uploads === 0 ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <Clock className="w-5 h-5 text-yellow-600" />
            )}
            <span className={`font-medium ${
              progress.failed_uploads === 0 ? 'text-green-800' : 'text-yellow-800'
            }`}>
              {progress.failed_uploads === 0 
                ? '🎉 All files uploaded successfully!' 
                : `Upload complete: ${progress.successful_uploads} successful, ${progress.failed_uploads} failed`
              }
            </span>
          </div>
          {progress.successful_uploads > 0 && (
            <p className={`text-sm mt-1 ${
              progress.failed_uploads === 0 ? 'text-green-700' : 'text-yellow-700'
            }`}>
              Files are now being processed. Check the job status section below for progress.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default MultiUploadProgress;