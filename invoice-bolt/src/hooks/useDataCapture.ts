import { useCallback, useEffect, useRef } from 'react';
import { auth } from '../config/firebase';

export interface DataCaptureOptions {
  captureIntervalMs?: number;
  silentMode?: boolean;
  enableVisibilityCapture?: boolean;
  enableUnloadCapture?: boolean;
  maxRetries?: number;
}

export interface CaptureEvent {
  timestamp: string;
  eventType: 'initial' | 'edit' | 'final' | 'periodic' | 'visibility' | 'unload';
  data: any;
  userEmail?: string;
  sessionId: string;
  changeCount: number;
  isModified: boolean;
}

export const useDataCapture = (
  originalData: any,
  currentData: any,
  options: DataCaptureOptions = {}
) => {
  const {
    captureIntervalMs = 30000, // 30 seconds
    silentMode = true,
    enableVisibilityCapture = true,
    enableUnloadCapture = true,
    maxRetries = 3
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

  // Silent API call to capture data
  const captureDataSilently = useCallback(async (event: CaptureEvent) => {
    try {
      console.log('🔍 Attempting data capture:', event.eventType);
      
      // Get authentication token
      const user = auth.currentUser;
      if (!user) {
        console.warn('⚠️ User not authenticated for data capture');
        return false;
      }
      
      const idToken = await user.getIdToken();
      if (!idToken) {
        console.warn('⚠️ No authentication token for data capture');
        return false;
      }

      console.log('✅ Authentication token found, proceeding with capture');

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

      console.log('📡 Data capture response:', response.status, response.statusText);

      if (response.ok) {
        console.log(`✅ Data captured successfully: ${event.eventType}`);
        retryCount.current = 0;
        return true;
      } else {
        const errorText = await response.text();
        console.error(`❌ Capture failed: ${response.status} - ${errorText}`);
        throw new Error(`Capture failed: ${response.status}`);
      }
    } catch (error) {
      console.error('💥 Data capture error:', error);
      
      // Queue for retry if within retry limit
      if (retryCount.current < maxRetries) {
        captureQueue.current.push(event);
        retryCount.current++;
      }
      return false;
    }
  }, [silentMode, maxRetries]);

  // Process capture queue (retry mechanism)
  const processCaptureQueue = useCallback(async () => {
    if (captureQueue.current.length === 0) return;

    const queuedEvents = [...captureQueue.current];
    captureQueue.current = [];

    for (const event of queuedEvents) {
      await captureDataSilently(event);
      // Small delay between retries
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }, [captureDataSilently]);

  // Create capture event
  const createCaptureEvent = useCallback((
    eventType: CaptureEvent['eventType'],
    data: any
  ): CaptureEvent => {
    const isModified = isDataModified(originalData, data);
    
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
      isModified
    };
  }, [originalData, isDataModified]);

  // Generate data diff for analysis
  const generateDataDiff = useCallback((original: any, current: any) => {
    if (!original || !current) return null;

    try {
      const diff: any = {
        added: [],
        modified: [],
        removed: [],
        metadata: {
          originalRowCount: original.rows?.length || 0,
          currentRowCount: current.rows?.length || 0,
          columnsChanged: JSON.stringify(original.headers || []) !== JSON.stringify(current.headers || [])
        }
      };

      // Compare headers
      if (original.headers && current.headers) {
        if (JSON.stringify(original.headers) !== JSON.stringify(current.headers)) {
          diff.modified.push({
            field: 'headers',
            from: original.headers,
            to: current.headers
          });
        }
      }

      // Compare rows
      if (original.rows && current.rows) {
        const originalRows = original.rows;
        const currentRows = current.rows;

        // Find modified rows
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
                to: currentRow,
                changedCells: findChangedCells(originalRow, currentRow)
              });
            }
          }
        }
      }

      return diff;
    } catch (error) {
      console.error('Error generating diff:', error);
      return { error: 'Failed to generate diff' };
    }
  }, []);

  // Find changed cells in a row
  const findChangedCells = (originalRow: any[], currentRow: any[]) => {
    const changes: any[] = [];
    const maxLength = Math.max(originalRow.length, currentRow.length);

    for (let i = 0; i < maxLength; i++) {
      if (originalRow[i] !== currentRow[i]) {
        changes.push({
          column: i,
          from: originalRow[i],
          to: currentRow[i]
        });
      }
    }

    return changes;
  };

  // Capture initial data
  const captureInitial = useCallback(async () => {
    console.log('🎯 captureInitial called with originalData:', !!originalData);
    if (!originalData) return;

    const event = createCaptureEvent('initial', originalData);
    await captureDataSilently(event);
    lastCaptureData.current = originalData;
  }, [originalData, createCaptureEvent, captureDataSilently]);

  // Capture current state
  const captureEdit = useCallback(async () => {
    console.log('✏️ captureEdit called with currentData:', !!currentData);
    if (!currentData) return;

    // Only capture if data has actually changed
    if (JSON.stringify(lastCaptureData.current) === JSON.stringify(currentData)) {
      return;
    }

    changeCount.current++;
    const event = createCaptureEvent('edit', currentData);
    await captureDataSilently(event);
    lastCaptureData.current = currentData;
  }, [currentData, createCaptureEvent, captureDataSilently]);

  // Capture final state
  const captureFinal = useCallback(async () => {
    if (!currentData) return;

    const event = createCaptureEvent('final', currentData);
    await captureDataSilently(event);
  }, [currentData, createCaptureEvent, captureDataSilently]);

  // Periodic capture
  const capturePeriodicSilent = useCallback(async () => {
    if (!currentData) return;

    // Only capture if there's been changes since last capture
    if (JSON.stringify(lastCaptureData.current) !== JSON.stringify(currentData)) {
      const event = createCaptureEvent('periodic', currentData);
      await captureDataSilently(event);
      lastCaptureData.current = currentData;
    }
  }, [currentData, createCaptureEvent, captureDataSilently]);

  // Set up event listeners
  useEffect(() => {
    // Capture initial data when component mounts
    if (originalData) {
      captureInitial();
    }
  }, [originalData, captureInitial]);

  // Capture edits when current data changes
  useEffect(() => {
    if (currentData && isDataModified(originalData, currentData)) {
      captureEdit();
    }
  }, [currentData, originalData, captureEdit, isDataModified]);

  // Set up periodic capture
  useEffect(() => {
    const interval = setInterval(capturePeriodicSilent, captureIntervalMs);
    return () => clearInterval(interval);
  }, [capturePeriodicSilent, captureIntervalMs]);

  // Set up visibility change capture
  useEffect(() => {
    if (!enableVisibilityCapture) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && currentData) {
        const event = createCaptureEvent('visibility', currentData);
        captureDataSilently(event);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enableVisibilityCapture, currentData, createCaptureEvent, captureDataSilently]);

  // Set up unload capture
  useEffect(() => {
    if (!enableUnloadCapture) return;

    const handleBeforeUnload = () => {
      if (currentData) {
        const event = createCaptureEvent('unload', currentData);
        
        // Use sendBeacon for reliable unload capture
        const payload = JSON.stringify(event);
        
        if (navigator.sendBeacon) {
          const API_BASE_URL = 'https://queue-processor-545188726513.asia-south1.run.app';
          navigator.sendBeacon(`${API_BASE_URL}/capture-data-state-beacon`, payload);
        } else {
          // Fallback for browsers without sendBeacon
          captureDataSilently(event);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enableUnloadCapture, currentData, createCaptureEvent, captureDataSilently]);

  // Process retry queue periodically
  useEffect(() => {
    const queueProcessor = setInterval(processCaptureQueue, 10000); // Every 10 seconds
    return () => clearInterval(queueProcessor);
  }, [processCaptureQueue]);

  return {
    captureInitial,
    captureEdit,
    captureFinal,
    sessionId: sessionId.current,
    changeCount: changeCount.current,
    isModified: isDataModified(originalData, currentData),
    queuedCaptures: captureQueue.current.length
  };
};