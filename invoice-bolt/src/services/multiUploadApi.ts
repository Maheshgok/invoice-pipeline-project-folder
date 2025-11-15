// Enhanced API service for multiple concurrent file uploads
import { auth } from '../config/firebase';

export interface UploadResult {
  file: File;
  job_id: string;
  success: boolean;
  error?: string;
  upload_time: number;
}

export interface BatchUploadProgress {
  total_files: number;
  completed_uploads: number;
  successful_uploads: number;
  failed_uploads: number;
  progress_percentage: number;
  results: UploadResult[];
  is_complete: boolean;
}

export interface JobStatusResponse {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0.0 to 1.0
  created_at?: string;
  updated_at?: string;
  error_message?: string;
  result?: any;
}

// Get authenticated headers with Firebase ID token
async function getAuthenticatedHeaders(additionalHeaders: Record<string, string> = {}): Promise<Headers> {
  const headers = new Headers(additionalHeaders);
  
  // Check if user is authenticated
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Authentication required');
  }

  console.log('Getting token for user:', currentUser.email);
  console.log('User has getIdToken method:', typeof currentUser.getIdToken === 'function');

  // Get Firebase ID token directly from Firebase auth current user
  let idToken;
  try {
    // Force token refresh to ensure we have a valid token
    idToken = await currentUser.getIdToken(true);
    console.log('Token retrieved successfully, length:', idToken ? idToken.length : 0);
    console.log('Token starts with:', idToken ? idToken.substring(0, 20) + '...' : 'null');
  } catch (error) {
    console.error('Failed to get token:', error);
    throw new Error(`Failed to get authentication token: ${error}`);
  }

  if (!idToken) {
    throw new Error('No ID token available');
  }

  headers.set('Authorization', `Bearer ${idToken}`);
  return headers;
}

// Upload a single file
async function uploadSingleFile(file: File, fileIndex: number): Promise<UploadResult> {
  const startTime = Date.now();
  
  try {
    console.log(`🚀 Starting upload ${fileIndex + 1}: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
    
    // Get authenticated headers
    const headers = await getAuthenticatedHeaders();
    
    // Create form data
    const formData = new FormData();
    formData.append('file', file);
    
    // Upload via Netlify function
    const uploadHeaders = new Headers(headers);
    uploadHeaders.delete('Content-Type'); // Let browser set boundary for FormData
    
    const response = await fetch('/.netlify/functions/upload-invoice', {
      method: 'POST',
      headers: uploadHeaders,
      body: formData,
      credentials: 'include'
    });
    
    const uploadTime = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Upload ${fileIndex + 1} failed: ${response.status} - ${errorText}`);
      return {
        file,
        job_id: '',
        success: false,
        error: `Upload failed: ${response.status} - ${errorText}`,
        upload_time: uploadTime
      };
    }
    
    const result = await response.json();
    
    if (!result.job_id) {
      return {
        file,
        job_id: '',
        success: false,
        error: 'Invalid response - missing job_id',
        upload_time: uploadTime
      };
    }
    
    console.log(`✅ Upload ${fileIndex + 1} successful: ${result.job_id} (${uploadTime}ms)`);
    return {
      file,
      job_id: result.job_id,
      success: true,
      upload_time: uploadTime
    };
    
  } catch (error) {
    const uploadTime = Date.now() - startTime;
    console.error(`💥 Upload ${fileIndex + 1} exception:`, error);
    return {
      file,
      job_id: '',
      success: false,
      error: error instanceof Error ? error.message : String(error),
      upload_time: uploadTime
    };
  }
}

// Upload multiple files concurrently with progress tracking
export const uploadMultipleFiles = async (
  files: File[], 
  options: {
    maxConcurrent?: number;
    onProgress?: (progress: BatchUploadProgress) => void;
    batchDelay?: number; // Delay between batches in ms
  } = {}
): Promise<BatchUploadProgress> => {
  
  const maxConcurrent = Math.min(options.maxConcurrent || 10, 20); // Limit to max 20 concurrent
  const onProgress = options.onProgress;
  const batchDelay = options.batchDelay || 100; // 100ms delay between batches
  
  console.log(`🎯 Starting batch upload: ${files.length} files, max ${maxConcurrent} concurrent`);
  
  // Validate files
  const validFiles = files.filter(file => {
    const isValid = file.type.startsWith('image/') || 
                   file.type === 'application/pdf' || 
                   file.name.toLowerCase().endsWith('.pdf');
    if (!isValid) {
      console.warn(`⚠️ Skipping invalid file type: ${file.name} (${file.type})`);
    }
    return isValid;
  });
  
  if (validFiles.length !== files.length) {
    console.warn(`⚠️ ${files.length - validFiles.length} files skipped due to invalid type`);
  }
  
  if (validFiles.length === 0) {
    return {
      total_files: 0,
      completed_uploads: 0,
      successful_uploads: 0,
      failed_uploads: 0,
      progress_percentage: 100,
      results: [],
      is_complete: true
    };
  }
  
  // Initialize progress
  let progress: BatchUploadProgress = {
    total_files: validFiles.length,
    completed_uploads: 0,
    successful_uploads: 0,
    failed_uploads: 0,
    progress_percentage: 0,
    results: [],
    is_complete: false
  };
  
  // Report initial progress
  onProgress?.(progress);
  
  // Process files in batches to avoid overwhelming the server
  const results: UploadResult[] = [];
  
  for (let i = 0; i < validFiles.length; i += maxConcurrent) {
    const batch = validFiles.slice(i, i + maxConcurrent);
    console.log(`📦 Processing batch ${Math.floor(i / maxConcurrent) + 1}: files ${i + 1}-${i + batch.length}`);
    
    // Upload batch concurrently
    const batchPromises = batch.map((file, index) => 
      uploadSingleFile(file, i + index)
    );
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Update progress
    progress = {
      total_files: validFiles.length,
      completed_uploads: results.length,
      successful_uploads: results.filter(r => r.success).length,
      failed_uploads: results.filter(r => !r.success).length,
      progress_percentage: Math.round((results.length / validFiles.length) * 100),
      results: [...results],
      is_complete: results.length === validFiles.length
    };
    
    // Report progress
    onProgress?.(progress);
    
    // Add delay between batches (except for the last batch)
    if (i + maxConcurrent < validFiles.length) {
      console.log(`⏳ Waiting ${batchDelay}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, batchDelay));
    }
  }
  
  // Final progress update
  progress.is_complete = true;
  onProgress?.(progress);
  
  console.log(`🎉 Batch upload complete: ${progress.successful_uploads}/${progress.total_files} successful`);
  
  // Log summary
  if (progress.failed_uploads > 0) {
    console.log('❌ Failed uploads:');
    results.filter(r => !r.success).forEach((result, index) => {
      console.log(`  ${index + 1}. ${result.file.name}: ${result.error}`);
    });
  }
  
  if (progress.successful_uploads > 0) {
    const uploadTimes = results.filter(r => r.success).map(r => r.upload_time);
    const avgTime = uploadTimes.reduce((a, b) => a + b, 0) / uploadTimes.length;
    console.log(`📊 Average upload time: ${avgTime.toFixed(0)}ms`);
    console.log(`📊 Fastest: ${Math.min(...uploadTimes)}ms, Slowest: ${Math.max(...uploadTimes)}ms`);
  }
  
  return progress;
};

// Get job status (existing function)
export const getJobStatus = async (jobId: string): Promise<JobStatusResponse> => {
  console.log('=== POLLING JOB STATUS VIA QUEUE PROCESSOR ===');
  console.log('Job ID:', jobId);
  
  try {
    const headers = await getAuthenticatedHeaders();
    
    const response = await fetch(`/.netlify/functions/api-status-queue?job_id=${jobId}`, {
      method: 'GET',
      headers,
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`Status check failed: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('Job status response:', result);
    
    return {
      job_id: jobId,
      status: result.status || 'pending',
      progress: result.progress || 0,
      created_at: result.created_at,
      updated_at: result.updated_at,
      error_message: result.error_message,
      result: result.result
    };
  } catch (error) {
    console.error('Job status error:', error);
    throw error;
  }
};

// Legacy single file upload for backward compatibility
export const uploadInvoice = async (file: File): Promise<{ backend_request_id: string }> => {
  console.log('⚠️ Using legacy single file upload - consider using uploadMultipleFiles');
  const result = await uploadSingleFile(file, 0);
  if (!result.success) {
    throw new Error(result.error || 'Upload failed');
  }
  return { backend_request_id: result.job_id };
};