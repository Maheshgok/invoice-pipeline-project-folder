import { useCallback, useEffect, useRef } from 'react';
import { auth } from '../config/firebase';

export interface DataCaptureOptions {
  captureIntervalMs?: number;
  silentMode?: boolean;
  enableVisibilityCapture?: boolean;
  enableUnloadCapture?: boolean;
  enableLocalStorage?: boolean;
  maxRetries?: number;
  jobId?: string;
  jobMetadata?: any;
}

export interface CaptureEvent {
  timestamp: string;
  eventType: 'initial' | 'edit' | 'final' | 'periodic' | 'visibility' | 'unload';
  data: any;
  userEmail?: string;
  sessionId: string;
  changeCount: number;
  isModified: boolean;
  jobId?: string;
  jobMetadata?: any;
}

export const useDataCaptureWithFallback = (
  originalData: any,
  currentData: any,
  options: DataCaptureOptions = {}
) => {
  const {
    captureIntervalMs = 30000,
    silentMode = true,
    enableVisibilityCapture = true,
    enableUnloadCapture = true,
    enableLocalStorage = true,
    maxRetries = 3,
    jobId,
    jobMetadata
  } = options;

  const sessionId = useRef(generateSessionId());
  const changeCount = useRef(0);
  const lastCaptureData = useRef<any>(null);
  const captureQueue = useRef<CaptureEvent[]>([]);
  const retryCount = useRef(0);

  // Generate unique session ID
  function generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Check if data has been modified
  const isDataModified = useCallback((original: any, current: any): boolean => {
    if (!original || !current) return false;
    return JSON.stringify(original) !== JSON.stringify(current);
  }, []);

  // Store data locally as fallback
  const storeLocallyAsFallback = useCallback((event: CaptureEvent) => {
    if (!enableLocalStorage) return;
    
    try {
      const storageKey = `data_capture_${sessionId.current}`;
      const existingData = JSON.parse(localStorage.getItem(storageKey) || '[]');
      existingData.push({
        ...event,
        stored_at: new Date().toISOString(),
        method: 'localStorage_fallback'
      });
      
      // Keep only last 10 events to avoid storage bloat
      if (existingData.length > 10) {
        existingData.splice(0, existingData.length - 10);
      }
      
      localStorage.setItem(storageKey, JSON.stringify(existingData));
      if (!silentMode) {
        console.log(`📦 Data stored locally as fallback: ${event.eventType}`);
      }
    } catch (error) {
      if (!silentMode) {
        console.error('Failed to store data locally:', error);
      }
    }
  }, [enableLocalStorage]);

  // Enhanced API call with fallback storage
  const captureDataWithFallback = useCallback(async (event: CaptureEvent) => {
    let success = false;
    
    try {
      if (!silentMode) {
        console.log(`🔍 Attempting data capture: ${event.eventType}`);
      }
      
      // Try to get authentication token
      const user = auth.currentUser;
      if (!user) {
        console.warn(`⚠️ User not authenticated for data capture, using fallback storage`);
        storeLocallyAsFallback(event);
        return true; // Consider fallback storage as success
      }
      
      const idToken = await user.getIdToken();
      if (!idToken) {
        console.warn(`⚠️ No authentication token for data capture, using fallback storage`);
        storeLocallyAsFallback(event);
        return true; // Consider fallback storage as success
      }

      if (!silentMode) {
        console.log(`✅ Authentication token found, proceeding with API capture`);
      }

      // Prepare capture payload
      const capturePayload = {
        ...event,
        userAgent: navigator.userAgent,
        url: window.location.href,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      };

      const API_BASE_URL = 'https://queue-processor-545188726513.asia-south1.run.app';

      const response = await fetch(`${API_BASE_URL}/capture-data-state`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(capturePayload)
      });

      if (!silentMode) {
        console.log(`📡 Data capture API response: ${response.status} ${response.statusText}`);
      }

      if (response.ok) {
        if (!silentMode) {
          console.log(`✅ Data captured successfully via API: ${event.eventType}`);
        }
        retryCount.current = 0;
        success = true;
      } else {
        const errorText = await response.text();
        if (!silentMode) {
          console.error(`❌ API capture failed: ${response.status} - ${errorText}`);
        }
        throw new Error(`Capture failed: ${response.status}`);
      }
    } catch (error) {
      if (!silentMode) {
        console.error(`💥 API capture error for ${event.eventType}:`, error);
      }
      
      // Use fallback storage when API fails
      storeLocallyAsFallback(event);
      success = true; // Consider fallback as success to avoid retries
    }

    // Queue for retry if API failed and we haven't exceeded retry limit
    if (!success && retryCount.current < maxRetries) {
      captureQueue.current.push(event);
      retryCount.current++;
      if (!silentMode) {
        console.log(`🔄 Queued for retry: ${event.eventType} (attempt ${retryCount.current})`);
      }
    }

    return success;
  }, [storeLocallyAsFallback, maxRetries, silentMode]);

  // Create capture event
  const createCaptureEvent = useCallback((
    eventType: CaptureEvent['eventType'],
    data: any
  ): CaptureEvent => {
    const isModified = isDataModified(originalData, data);
    
    if (eventType === 'edit') {
      changeCount.current++;
    }
    
    return {
      timestamp: new Date().toISOString(),
      eventType,
      data: {
        original: originalData,
        current: data,
        diff: isModified ? generateDataDiff(originalData, data) : null
      },
      sessionId: sessionId.current,
      changeCount: changeCount.current,
      isModified,
      jobId: jobId || undefined,
      jobMetadata: jobMetadata || undefined
    };
  }, [originalData, isDataModified, jobId, jobMetadata]);

  // Generate data diff for analysis
  const generateDataDiff = useCallback((original: any, current: any) => {
    if (!original || !current) return null;

    try {
      const diff = {
        added: [] as any[],
        removed: [] as any[],
        modified: [] as any[]
      };

      // Simple row comparison for tabular data
      if (original.rows && current.rows) {
        const originalRows = original.rows;
        const currentRows = current.rows;

        for (let i = 0; i < Math.max(originalRows.length, currentRows.length); i++) {
          const originalRow = originalRows[i];
          const currentRow = currentRows[i];

          if (!originalRow && currentRow) {
            diff.added.push({ index: i, data: currentRow });
          } else if (originalRow && !currentRow) {
            diff.removed.push({ index: i, data: originalRow });
          } else if (originalRow && currentRow) {
            if (JSON.stringify(originalRow) !== JSON.stringify(currentRow)) {
              diff.modified.push({
                index: i,
                from: originalRow,
                to: currentRow
              });
            }
          }
        }
      }

      return diff;
    } catch (error) {
      console.error('Error generating data diff:', error);
      return null;
    }
  }, []);

  // Process retry queue
  const processCaptureQueue = useCallback(async () => {
    if (captureQueue.current.length === 0) return;

    console.log(`🔄 Processing ${captureQueue.current.length} queued captures`);
    const queue = [...captureQueue.current];
    captureQueue.current = [];

    for (const event of queue) {
      await captureDataWithFallback(event);
    }
  }, [captureDataWithFallback]);

  // Capture functions
  const captureInitial = useCallback(async () => {
    console.log(`🎯 captureInitial called with originalData:`, !!originalData);
    if (!originalData) return;

    const event = createCaptureEvent('initial', originalData);
    await captureDataWithFallback(event);
    lastCaptureData.current = originalData;
  }, [originalData, createCaptureEvent, captureDataWithFallback]);

  const captureEdit = useCallback(async () => {
    console.log(`✏️ captureEdit called with currentData:`, !!currentData);
    if (!currentData) return;

    // Only capture if data has actually changed
    if (JSON.stringify(lastCaptureData.current) === JSON.stringify(currentData)) {
      console.log(`⏭️ Skipping edit capture - no changes detected`);
      return;
    }

    const event = createCaptureEvent('edit', currentData);
    await captureDataWithFallback(event);
    lastCaptureData.current = currentData;
  }, [currentData, createCaptureEvent, captureDataWithFallback]);

  const captureFinal = useCallback(async () => {
    console.log(`🏁 captureFinal called with currentData:`, !!currentData);
    if (!currentData) return;

    const event = createCaptureEvent('final', currentData);
    await captureDataWithFallback(event);
  }, [currentData, createCaptureEvent, captureDataWithFallback]);

  // Auto-capture when original data first becomes available
  useEffect(() => {
    if (originalData && !lastCaptureData.current) {
      console.log(`🚀 Auto-triggering initial capture`);
      captureInitial();
    }
  }, [originalData, captureInitial]);

  // Periodic capture
  useEffect(() => {
    if (!captureIntervalMs || !currentData) return;

    const interval = setInterval(() => {
      console.log(`⏰ Periodic capture triggered`);
      const event = createCaptureEvent('periodic', currentData);
      captureDataWithFallback(event);
    }, captureIntervalMs);

    return () => clearInterval(interval);
  }, [captureIntervalMs, currentData, createCaptureEvent, captureDataWithFallback]);

  // Visibility change capture
  useEffect(() => {
    if (!enableVisibilityCapture) return;

    const handleVisibilityChange = () => {
      if (!currentData) return;
      
      console.log(`👁️ Visibility change capture: ${document.hidden ? 'hidden' : 'visible'}`);
      const event = createCaptureEvent('visibility', currentData);
      captureDataWithFallback(event);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enableVisibilityCapture, currentData, createCaptureEvent, captureDataWithFallback]);

  // Page unload capture
  useEffect(() => {
    if (!enableUnloadCapture) return;

    const handleBeforeUnload = () => {
      if (!currentData) return;
      
      console.log(`🚪 Page unload capture triggered`);
      const event = createCaptureEvent('unload', currentData);
      
      // Try beacon API first, fallback to localStorage
      try {
        const payload = JSON.stringify({
          ...event,
          userAgent: navigator.userAgent,
          url: window.location.href,
          method: 'beacon'
        });

        const API_BASE_URL = 'https://queue-processor-545188726513.asia-south1.run.app';
        if (navigator.sendBeacon) {
          navigator.sendBeacon(`${API_BASE_URL}/capture-data-state-beacon`, payload);
          console.log(`📡 Beacon capture sent`);
        }
      } catch (error) {
        console.error('Beacon capture failed:', error);
      }
      
      // Always store locally as additional backup
      storeLocallyAsFallback(event);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enableUnloadCapture, currentData, createCaptureEvent, storeLocallyAsFallback]);

  // Process retry queue periodically
  useEffect(() => {
    const queueProcessor = setInterval(processCaptureQueue, 10000); // Every 10 seconds
    return () => clearInterval(queueProcessor);
  }, [processCaptureQueue]);

  // Function to get stored local data (for debugging or manual sync)
  const getLocalStoredData = useCallback(() => {
    if (!enableLocalStorage) return [];
    
    try {
      const storageKey = `data_capture_${sessionId.current}`;
      return JSON.parse(localStorage.getItem(storageKey) || '[]');
    } catch (error) {
      console.error('Failed to get local stored data:', error);
      return [];
    }
  }, [enableLocalStorage]);

  return {
    captureInitial,
    captureEdit,
    captureFinal,
    sessionId: sessionId.current,
    changeCount: changeCount.current,
    isModified: isDataModified(originalData, currentData),
    queuedCaptures: captureQueue.current.length,
    getLocalStoredData
  };
};