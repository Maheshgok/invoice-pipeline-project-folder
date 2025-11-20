import { useState, useEffect, useRef } from 'react';
import { firestoreService, BatchProgress, JobResult } from '../services/firestoreService';

interface UseJobBatchListenerParams {
  jobIds: string[];
  userEmail: string;
  enabled?: boolean;
}

interface UseJobBatchListenerResult {
  progress: BatchProgress | null;
  completedJobs: JobResult[];
  failedJobs: JobResult[];
  isComplete: boolean;
  isListening: boolean;
  totalProcessed: number;
  totalJobs: number;
}

/**
 * Custom hook for realtime job batch monitoring
 * Replaces the polling approach with proper listener pattern
 */
export const useJobBatchListener = ({
  jobIds,
  userEmail,
  enabled = true
}: UseJobBatchListenerParams): UseJobBatchListenerResult => {
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [isListening, setIsListening] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled || jobIds.length === 0) {
      console.log('🚫 Job batch listener disabled or no jobs to monitor');
      return;
    }

    console.log(`🎯 Starting job batch listener for ${jobIds.length} jobs:`, jobIds);
    setIsListening(true);

    let mounted = true;

    const startListener = async () => {
      try {
        const unsubscribe = await firestoreService.listenToJobBatch(
          jobIds,
          (newProgress) => {
            if (mounted) {
              console.log('📊 Received progress update:', {
                completed: newProgress.completedJobs.length,
                failed: newProgress.failedJobs.length,
                pending: newProgress.pendingJobs.length,
                total: newProgress.jobIds.length
              });
              setProgress(newProgress);
              
              if (newProgress.isComplete) {
                console.log('🎉 All jobs completed! Stopping listener.');
                setIsListening(false);
              }
            }
          },
          userEmail
        );

        if (mounted) {
          unsubscribeRef.current = unsubscribe;
        } else {
          // Component unmounted before listener started
          unsubscribe();
        }
      } catch (error) {
        console.error('💥 Error starting job batch listener:', error);
        if (mounted) {
          setIsListening(false);
        }
      }
    };

    startListener();

    return () => {
      mounted = false;
      if (unsubscribeRef.current) {
        console.log('🧹 Cleaning up job batch listener');
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      setIsListening(false);
    };
  }, [jobIds.join(','), userEmail, enabled]); // Dependencies

  return {
    progress,
    completedJobs: progress?.completedJobs || [],
    failedJobs: progress?.failedJobs || [],
    isComplete: progress?.isComplete || false,
    isListening,
    totalProcessed: progress?.totalProcessed || 0,
    totalJobs: jobIds.length
  };
};