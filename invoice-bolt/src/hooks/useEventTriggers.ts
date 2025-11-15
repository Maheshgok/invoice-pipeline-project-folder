import { useCallback, useRef, useEffect } from 'react';

export interface EventTriggerOptions {
  debounceMs?: number;
  throttleMs?: number;
  delayMs?: number;
  maxRetries?: number;
}

export const useEventTriggers = () => {
  const timeoutRefs = useRef<Map<string, number>>(new Map());
  const lastCallTimes = useRef<Map<string, number>>(new Map());

  // Cleanup function
  const cleanup = useCallback(() => {
    timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
    timeoutRefs.current.clear();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Debounced execution - waits for pause in calls
  const debounce = useCallback(<T extends any[]>(
    key: string,
    callback: (...args: T) => void | Promise<void>,
    delay: number = 1000
  ) => {
    return (...args: T) => {
      // Clear existing timeout
      const existingTimeout = timeoutRefs.current.get(key);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Set new timeout
      const newTimeout = setTimeout(async () => {
        try {
          await callback(...args);
        } catch (error) {
          console.error(`Debounced callback error for ${key}:`, error);
        } finally {
          timeoutRefs.current.delete(key);
        }
      }, delay);

      timeoutRefs.current.set(key, newTimeout);
    };
  }, []);

  // Throttled execution - limits frequency of calls
  const throttle = useCallback(<T extends any[]>(
    key: string,
    callback: (...args: T) => void | Promise<void>,
    delay: number = 1000
  ) => {
    return (...args: T) => {
      const now = Date.now();
      const lastCall = lastCallTimes.current.get(key) || 0;

      if (now - lastCall >= delay) {
        lastCallTimes.current.set(key, now);
        const result = callback(...args);
        if (result && typeof result.catch === 'function') {
          result.catch((error: unknown) => {
            console.error(`Throttled callback error for ${key}:`, error);
          });
        }
      }
    };
  }, []);

  // Delayed execution - executes after specified delay
  const delayed = useCallback(<T extends any[]>(
    key: string,
    callback: (...args: T) => void | Promise<void>,
    delay: number = 1000,
    cancelPrevious: boolean = true
  ) => {
    return (...args: T) => {
      // Clear existing timeout if requested
      if (cancelPrevious) {
        const existingTimeout = timeoutRefs.current.get(key);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }
      }

      // Set new timeout
      const newTimeout = setTimeout(async () => {
        try {
          await callback(...args);
        } catch (error) {
          console.error(`Delayed callback error for ${key}:`, error);
        } finally {
          timeoutRefs.current.delete(key);
        }
      }, delay);

      timeoutRefs.current.set(key, newTimeout);
    };
  }, []);

  // Cancel specific delayed execution
  const cancel = useCallback((key: string) => {
    const timeout = timeoutRefs.current.get(key);
    if (timeout) {
      clearTimeout(timeout);
      timeoutRefs.current.delete(key);
      return true;
    }
    return false;
  }, []);

  // Check if delayed execution is pending
  const isPending = useCallback((key: string) => {
    return timeoutRefs.current.has(key);
  }, []);

  return {
    debounce,
    throttle,
    delayed,
    cancel,
    isPending,
    cleanup
  };
};

// Specific hook for auto-save functionality
export const useAutoSave = <T>(
  data: T,
  saveCallback: (data: T) => Promise<void>,
  options: {
    debounceMs?: number;
    enabled?: boolean;
    onSaveStart?: () => void;
    onSaveComplete?: () => void;
    onSaveError?: (error: Error) => void;
  } = {}
) => {
  const { debounce } = useEventTriggers();
  const {
    debounceMs = 2000,
    enabled = true,
    onSaveStart,
    onSaveComplete,
    onSaveError
  } = options;

  const debouncedSave = debounce(
    'auto-save',
    async (dataToSave: T) => {
      if (!enabled || !dataToSave) return;

      try {
        onSaveStart?.();
        await saveCallback(dataToSave);
        onSaveComplete?.();
      } catch (error) {
        onSaveError?.(error as Error);
      }
    },
    debounceMs
  );

  useEffect(() => {
    if (enabled && data) {
      debouncedSave(data);
    }
  }, [data, debouncedSave, enabled]);

  return { debouncedSave };
};

// Hook for handling page unload events with data backup
export const usePageUnloadBackup = (
  backupCallback: () => Promise<void>,
  options: {
    enabled?: boolean;
    warningMessage?: string;
  } = {}
) => {
  const { enabled = true, warningMessage = 'You have unsaved changes. Are you sure you want to leave?' } = options;

  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Trigger backup (this should be fast/synchronous or use sendBeacon)
      backupCallback().catch(console.error);
      
      // Show warning to user
      event.preventDefault();
      event.returnValue = warningMessage;
      return warningMessage;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Page is being hidden (tab switch, minimize, etc.)
        backupCallback().catch(console.error);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [backupCallback, enabled, warningMessage]);
};