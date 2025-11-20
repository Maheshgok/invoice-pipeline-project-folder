import React from 'react';
import { CheckCircle, AlertCircle, Clock, Loader2 } from 'lucide-react';

interface JobStatusPanelProps {
  status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed' | 'partially_completed';
  progress?: number; // 0.0 to 1.0
  jobId?: string;
  error?: string | null;
}

const JobStatusPanel: React.FC<JobStatusPanelProps> = ({ 
  status, 
  progress = 0, 
  jobId, 
  error 
}) => {
  const getStatusIcon = () => {
    switch (status) {
      case 'pending':
        return <Clock className="w-5 h-5 text-blue-600" />;
      case 'processing':
        return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'partially_completed':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case 'pending':
        return 'Job queued for processing...';
      case 'processing':
        return 'Processing invoice with AI...';
      case 'completed':
        return 'Invoice processing completed!';
      case 'partially_completed':
        return 'Some files uploaded successfully, others failed';
      case 'failed':
        return 'Processing failed';
      default:
        return '';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'pending':
        return 'border-blue-200 bg-blue-50';
      case 'processing':
        return 'border-blue-200 bg-blue-50';
      case 'completed':
        return 'border-green-200 bg-green-50';
      case 'partially_completed':
        return 'border-yellow-200 bg-yellow-50';
      case 'failed':
        return 'border-red-200 bg-red-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  const progressPercentage = Math.round(progress * 100);

  return (
    <div className={`mb-6 p-4 border rounded-lg ${getStatusColor()}`}>
      <div className="flex items-center gap-3 mb-3">
        {getStatusIcon()}
        <div className="flex-1">
          <p className="font-medium text-gray-900">{getStatusMessage()}</p>
          {jobId && (
            <p className="text-sm text-gray-600">Job ID: {jobId}</p>
          )}
        </div>
        {(status === 'processing' || status === 'pending') && (
          <span className="text-sm font-medium text-gray-700">
            {progressPercentage}%
          </span>
        )}
      </div>

      {/* Progress Bar */}
      {(status === 'processing' || status === 'pending') && (
        <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-2 p-2 bg-red-100 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Processing Steps */}
      {status === 'processing' && (
        <div className="mt-2 text-xs text-gray-600">
          <div className="space-y-1">
            <div className={`flex items-center gap-2 ${progress >= 0.1 ? 'text-green-600' : ''}`}>
              <div className={`w-2 h-2 rounded-full ${progress >= 0.1 ? 'bg-green-500' : 'bg-gray-300'}`} />
              Job queued
            </div>
            <div className={`flex items-center gap-2 ${progress >= 0.3 ? 'text-green-600' : ''}`}>
              <div className={`w-2 h-2 rounded-full ${progress >= 0.3 ? 'bg-green-500' : 'bg-gray-300'}`} />
              File downloaded from storage
            </div>
            <div className={`flex items-center gap-2 ${progress >= 0.8 ? 'text-green-600' : ''}`}>
              <div className={`w-2 h-2 rounded-full ${progress >= 0.8 ? 'bg-green-500' : 'bg-gray-300'}`} />
              AI processing complete
            </div>
            <div className={`flex items-center gap-2 ${progress >= 1.0 ? 'text-green-600' : ''}`}>
              <div className={`w-2 h-2 rounded-full ${progress >= 1.0 ? 'bg-green-500' : 'bg-gray-300'}`} />
              Results saved
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobStatusPanel;
