/**
 * Firestore Realtime Listener Service
 * Provides ACTUAL realtime updates using Firestore onSnapshot listeners
 */

import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../config/firebase';

export interface JobResult {
  job_id: string;
  user_email: string;
  bucket_path: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
  completed_at?: string;
  retry_count: number;
  result?: {
    extracted_data: any;
    processing_time: string;
    model_used: string;
  };
  error?: string;
}

export interface BatchProgress {
  jobIds: string[];
  completedJobs: JobResult[];
  pendingJobs: string[];
  failedJobs: JobResult[];
  isComplete: boolean;
  totalProcessed: number;
}

class FirestoreService {
  private useFirestoreListeners = true; // Can be toggled for fallback

  /**
   * Listen to multiple job updates in realtime using Firestore onSnapshot
   * Falls back to API polling if Firestore fails
   * @param jobIds Array of job IDs to monitor
   * @param onUpdate Callback when any job updates
   * @param userEmail User email for filtering
   * @returns Unsubscribe function
   */
  async listenToJobBatch(
    jobIds: string[], 
    onUpdate: (progress: BatchProgress) => void,
    userEmail: string
  ): Promise<() => void> {
    console.log(`🔄 Starting job monitoring for ${jobIds.length} jobs:`, jobIds);
    
    // Check if user is authenticated for Firestore access
    const user = auth.currentUser;
    if (!user) {
      console.warn('⚠️ User not authenticated, using API polling only');
      return await this.setupApiPolling(jobIds, onUpdate, userEmail);
    }

    if (this.useFirestoreListeners) {
      console.log('🔥 Attempting Firestore realtime listeners first...');
      try {
        return await this.setupFirestoreListeners(jobIds, onUpdate, userEmail);
      } catch (error) {
        console.error('❌ Firestore listeners failed, falling back to API polling:', error);
        this.useFirestoreListeners = false; // Disable for this session
        return await this.setupApiPolling(jobIds, onUpdate, userEmail);
      }
    } else {
      console.log('🚀 Using API polling (Firestore listeners disabled)');
      return await this.setupApiPolling(jobIds, onUpdate, userEmail);
    }
  }

  /**
   * Setup real Firestore onSnapshot listeners
   */
  private async setupFirestoreListeners(
    jobIds: string[], 
    onUpdate: (progress: BatchProgress) => void,
    userEmail: string
  ): Promise<() => void> {
    
    const batchProgress: BatchProgress = {
      jobIds: [...jobIds],
      completedJobs: [],
      pendingJobs: [...jobIds],
      failedJobs: [],
      isComplete: false,
      totalProcessed: 0
    };

    const unsubscribers: (() => void)[] = [];
    let hasReceivedUpdates = false;

    // Timeout fallback to API polling if no Firestore updates received in 10 seconds
    const fallbackTimeout = setTimeout(() => {
      if (!hasReceivedUpdates && batchProgress.pendingJobs.length > 0) {
        console.warn(`⏰ No Firestore updates received in 10s, falling back to API polling for remaining ${batchProgress.pendingJobs.length} jobs`);
        
        // Clean up Firestore listeners
        unsubscribers.forEach(unsubscribe => unsubscribe());
        
        // Start API polling for remaining jobs
        this.setupApiPolling(batchProgress.pendingJobs, onUpdate, userEmail);
      }
    }, 10000);

    // Create individual listeners for each job document
    for (const jobId of jobIds) {
      try {
        console.log(`🎯 Setting up realtime listener for job: ${jobId}`);
        
        // Reference to the job document in Firestore
        const jobDocRef = doc(db, 'invoice_results', jobId);
        
        // Set up real-time listener using onSnapshot
        const unsubscribe = onSnapshot(jobDocRef, (docSnapshot) => {
          console.log(`🔍 Firestore snapshot for job ${jobId}:`, docSnapshot.exists());
          
          if (docSnapshot.exists()) {
            const jobData = docSnapshot.data();
            hasReceivedUpdates = true; // Mark that we're receiving Firestore updates
            
            console.log(`📡 Firestore update for job ${jobId}:`, {
              status: jobData.status,
              vendor_name: jobData.vendor_name,
              total_amount: jobData.total_amount,
              hasResult: !!jobData.result,
              allKeys: Object.keys(jobData)
            });
            
            // Remove from pending if status changed
            const pendingIndex = batchProgress.pendingJobs.indexOf(jobId);
            
            if (jobData.status === 'completed') {
              // Add to completed jobs
              const jobResult: JobResult = {
                job_id: jobId,
                user_email: jobData.user_email || userEmail,
                bucket_path: jobData.bucket_path || '',
                status: 'completed',
                created_at: jobData.created_at || '',
                updated_at: jobData.updated_at || '',
                completed_at: jobData.completed_at || new Date().toISOString(),
                retry_count: jobData.retry_count || 0,
                // Fix: Backend stores the extracted data fields directly at document level
                result: {
                  extracted_data: {
                    vendor_name: jobData.vendor_name,
                    invoice_number: jobData.invoice_number,
                    invoice_date: jobData.invoice_date,
                    total_amount: jobData.total_amount,
                    tax_amount: jobData.tax_details?.total_gst || 0,
                    net_amount: jobData.total_amount - (jobData.tax_details?.total_gst || 0),
                    description: jobData.items?.[0]?.description || ''
                  },
                  processing_time: jobData.processing_time || '',
                  model_used: jobData.model_used || ''
                }
              };
              
              // Check if already in completed jobs
              const alreadyCompleted = batchProgress.completedJobs.find(j => j.job_id === jobId);
              if (!alreadyCompleted) {
                batchProgress.completedJobs.push(jobResult);
                console.log(`✅ Job ${jobId} completed and added to results!`);
                console.log(`📊 Converted data:`, {
                  vendor_name: jobResult.result?.extracted_data?.vendor_name,
                  total_amount: jobResult.result?.extracted_data?.total_amount,
                  invoice_number: jobResult.result?.extracted_data?.invoice_number
                });
              }
              
              // Remove from pending
              if (pendingIndex > -1) {
                batchProgress.pendingJobs.splice(pendingIndex, 1);
              }
              
            } else if (jobData.status === 'failed') {
              // Add to failed jobs
              const jobResult: JobResult = {
                job_id: jobId,
                user_email: jobData.user_email || userEmail,
                bucket_path: jobData.bucket_path || '',
                status: 'failed',
                created_at: jobData.created_at || '',
                updated_at: jobData.updated_at || '',
                retry_count: jobData.retry_count || 0,
                error: jobData.error_message || 'Unknown error'
              };
              
              // Check if already in failed jobs
              const alreadyFailed = batchProgress.failedJobs.find(j => j.job_id === jobId);
              if (!alreadyFailed) {
                batchProgress.failedJobs.push(jobResult);
                console.log(`❌ Job ${jobId} failed:`, jobData.error_message);
              }
              
              // Remove from pending
              if (pendingIndex > -1) {
                batchProgress.pendingJobs.splice(pendingIndex, 1);
              }
            }
            
            // Update progress
            batchProgress.totalProcessed = batchProgress.completedJobs.length + batchProgress.failedJobs.length;
            batchProgress.isComplete = batchProgress.pendingJobs.length === 0;
            
            console.log(`📈 Realtime batch progress: ${batchProgress.totalProcessed}/${batchProgress.jobIds.length} (${batchProgress.completedJobs.length} completed, ${batchProgress.failedJobs.length} failed, ${batchProgress.pendingJobs.length} pending)`);
            
            // Notify caller with updated progress
            onUpdate({ ...batchProgress });
            
            if (batchProgress.isComplete) {
              console.log(`🏁 All jobs completed via realtime listeners! Final status: ${batchProgress.completedJobs.length} completed, ${batchProgress.failedJobs.length} failed`);
            }
            
          } else {
            console.warn(`⚠️ Job document ${jobId} not found in Firestore`);
          }
        }, (error) => {
          console.error(`💥 Firestore listener error for job ${jobId}:`, error);
          console.log(`🔄 Attempting to fall back to API polling for this job...`);
          
          // Remove failed listener and add to API polling fallback
          const pendingIndex = batchProgress.pendingJobs.indexOf(jobId);
          if (pendingIndex > -1) {
            // Don't remove from pending, let the fallback system handle it
            console.log(`⚡ Job ${jobId} will be handled by API polling fallback`);
          }
        });
        
        unsubscribers.push(unsubscribe);
        
      } catch (error) {
        console.error(`💥 Error setting up listener for job ${jobId}:`, error);
      }
    }
    
    // Return combined unsubscribe function
    const unsubscribeAll = () => {
      console.log(`🛑 Stopping ${unsubscribers.length} Firestore listeners`);
      clearTimeout(fallbackTimeout); // Clear the fallback timeout
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
    
    return unsubscribeAll;
  }

  /**
   * Fallback API polling approach
   */
  private async setupApiPolling(
    jobIds: string[], 
    onUpdate: (progress: BatchProgress) => void,
    userEmail: string
  ): Promise<() => void> {
    console.log(`🔄 Starting API polling fallback for ${jobIds.length} jobs:`, jobIds);
    
    const batchProgress: BatchProgress = {
      jobIds: [...jobIds],
      completedJobs: [],
      pendingJobs: [...jobIds],
      failedJobs: [],
      isComplete: false,
      totalProcessed: 0
    };

    const pollInterval = 2000; // 2 seconds
    let isActive = true;
    
    const pollJobs = async () => {
      if (!isActive) return;
      
      try {
        console.log(`📡 Polling ${batchProgress.pendingJobs.length} pending jobs...`);
        
        const updatedJobs: JobResult[] = [];
        const stillPending: string[] = [];
        
        for (const jobId of batchProgress.pendingJobs) {
          try {
            const response = await fetch(`https://queue-processor-545188726513.asia-south1.run.app/get-job-status/${jobId}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${await this.getIdToken()}`
              }
            });
            
            if (response.ok) {
              const jobData = await response.json();
              console.log(`📊 Job ${jobId} status: ${jobData.status}`);
              
              if (jobData.status === 'completed') {
                const jobResult: JobResult = {
                  job_id: jobId,
                  user_email: userEmail,
                  bucket_path: jobData.bucket_path || '',
                  status: 'completed',
                  created_at: jobData.created_at || '',
                  updated_at: jobData.updated_at || '',
                  completed_at: jobData.completed_at || new Date().toISOString(),
                  retry_count: jobData.retry_count || 0,
                  result: jobData.result
                };
                updatedJobs.push(jobResult);
              } else if (jobData.status === 'failed') {
                const jobResult: JobResult = {
                  job_id: jobId,
                  user_email: userEmail,
                  bucket_path: jobData.bucket_path || '',
                  status: 'failed',
                  created_at: jobData.created_at || '',
                  updated_at: jobData.updated_at || '',
                  retry_count: jobData.retry_count || 0,
                  error: jobData.error_message || 'Unknown error'
                };
                updatedJobs.push(jobResult);
              } else {
                stillPending.push(jobId);
              }
            } else {
              stillPending.push(jobId);
            }
          } catch (error) {
            console.warn(`💥 Error checking job ${jobId}:`, error);
            stillPending.push(jobId);
          }
        }
        
        // Update batch progress
        const newCompletedJobs = updatedJobs.filter(j => j.status === 'completed');
        const newFailedJobs = updatedJobs.filter(j => j.status === 'failed');
        
        batchProgress.completedJobs.push(...newCompletedJobs);
        batchProgress.failedJobs.push(...newFailedJobs);
        batchProgress.pendingJobs = stillPending;
        batchProgress.totalProcessed = batchProgress.completedJobs.length + batchProgress.failedJobs.length;
        batchProgress.isComplete = batchProgress.pendingJobs.length === 0;
        
        onUpdate({ ...batchProgress });
        
        if (!batchProgress.isComplete && isActive) {
          setTimeout(pollJobs, pollInterval);
        }
        
      } catch (error) {
        console.error('💥 Error in job polling:', error);
        if (isActive) {
          setTimeout(pollJobs, pollInterval * 2);
        }
      }
    };
    
    pollJobs();
    
    return () => {
      isActive = false;
      console.log(`🛑 Stopped API polling fallback`);
    };
  }

  /**
   * Get authentication token
   */
  private async getIdToken(): Promise<string | null> {
    try {
      const user = auth.currentUser;
      if (!user) {
        return null;
      }
      return await user.getIdToken();
    } catch (error) {
      console.error('Error getting ID token:', error);
      return null;
    }
  }
}

export const firestoreService = new FirestoreService();