// API service for file upload and processing
import { auth } from '../config/firebase';

export interface ApiResponse {
  success: boolean;
  data?: Record<string, any>[];
  message?: string;
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
  console.log('=== Getting Authenticated Headers ===');
  const headers = new Headers(additionalHeaders);
  
  // Check authentication
  if (!auth.currentUser) {
    console.error('Authentication required but user is not authenticated');
    throw new Error('Authentication required');
  }

  // Get Firebase ID token
  console.log('Getting Firebase ID token...');
  const idToken = await auth.currentUser.getIdToken();
  console.log('ID token available:', !!idToken, idToken ? `(length: ${idToken.length})` : '');
  if (!idToken) {
    console.error('No ID token available');
    throw new Error('No ID token available');
  }

  // Use Google ID token directly for Netlify functions
  headers.set('Authorization', `Bearer ${idToken}`);
  console.log('=== Authenticated Headers Ready ===');
  return headers;
}

// Function to upload an invoice file using the new queue-based flow
export const uploadInvoice = async (file: File): Promise<{ backend_request_id: string }> => {
  console.log('=== UPLOADING INVOICE VIA QUEUE-BASED FLOW ===');
  console.log('File name:', file.name);
  console.log('File size:', file.size);
  console.log('File type:', file.type);
  
  try {
    // Get authenticated headers
    const headers = await getAuthenticatedHeaders();
    
    // Create form data
    const formData = new FormData();
    formData.append('file', file);
    
    // Upload via Netlify function (which handles queue integration)
    const uploadHeaders = new Headers(headers);
    // Don't set Content-Type for FormData - browser will set it automatically with boundary
    uploadHeaders.delete('Content-Type');
    
    const response = await fetch('/.netlify/functions/upload-invoice', {
      method: 'POST',
      headers: uploadHeaders,
      body: formData,
      credentials: 'include'
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Upload failed - Status:', response.status, 'Response:', errorText);
      throw new Error(`Upload failed! status: ${response.status}, body: ${errorText}`);
    }
    
    const result = await response.json();
    console.log('Upload response:', result);
    
    if (!result.job_id) {
      throw new Error('Invalid response - missing job_id');
    }
    
    // Return the job_id for status polling
    return { backend_request_id: result.job_id };
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
};

// Poll backend for job status/result using the new queue processor
export const getJobStatus = async (jobId: string): Promise<JobStatusResponse> => {
  console.log('=== POLLING JOB STATUS VIA QUEUE PROCESSOR ===');
  console.log('Job ID:', jobId);
  
  try {
    // Get authenticated headers
    const headers = await getAuthenticatedHeaders();
    
    const response = await fetch(`/.netlify/functions/api-status-queue?job_id=${jobId}`, {
      method: 'GET',
      headers: headers,
      credentials: 'include'
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Status check failed - Status:', response.status, 'Response:', errorText);
      throw new Error(`Failed to get job status: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    console.log('Status response:', result);
    
    return result;
  } catch (error) {
    console.error('Status polling error:', error);
    throw error;
  }
};