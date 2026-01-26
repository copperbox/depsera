import { useState, useEffect, useRef, useCallback } from 'react';

export const INTERVAL_OPTIONS = [
  { value: 10000, label: '10s' },
  { value: 20000, label: '20s' },
  { value: 30000, label: '30s' },
  { value: 60000, label: '1m' },
] as const;

const DEFAULT_INTERVAL = 30000;

export interface UsePollingOptions {
  /** Unique key prefix for localStorage (e.g., 'dashboard', 'services') */
  storageKey: string;
  /** Callback function to execute on each poll */
  onPoll: () => void;
}

export interface UsePollingReturn {
  /** Whether polling is currently enabled */
  isPollingEnabled: boolean;
  /** Current polling interval in milliseconds */
  pollingInterval: number;
  /** Toggle polling on/off */
  togglePolling: () => void;
  /** Handle interval change from a select element */
  handleIntervalChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}

/**
 * Custom hook for managing polling with localStorage persistence
 * @param options - Configuration options for polling
 * @returns Polling state and control functions
 */
export function usePolling({ storageKey, onPoll }: UsePollingOptions): UsePollingReturn {
  const POLLING_ENABLED_KEY = `${storageKey}-auto-refresh`;
  const POLLING_INTERVAL_KEY = `${storageKey}-refresh-interval`;

  const [isPollingEnabled, setIsPollingEnabled] = useState(() => {
    const stored = localStorage.getItem(POLLING_ENABLED_KEY);
    return stored === 'true';
  });

  const [pollingInterval, setPollingInterval] = useState(() => {
    const stored = localStorage.getItem(POLLING_INTERVAL_KEY);
    return stored ? parseInt(stored, 10) : DEFAULT_INTERVAL;
  });

  const pollingIntervalRef = useRef<number | null>(null);
  const onPollRef = useRef(onPoll);

  // Keep onPoll ref up to date
  useEffect(() => {
    onPollRef.current = onPoll;
  }, [onPoll]);

  // Polling effect
  useEffect(() => {
    if (isPollingEnabled) {
      pollingIntervalRef.current = window.setInterval(() => {
        onPollRef.current();
      }, pollingInterval);
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isPollingEnabled, pollingInterval]);

  const togglePolling = useCallback(() => {
    const newValue = !isPollingEnabled;
    setIsPollingEnabled(newValue);
    localStorage.setItem(POLLING_ENABLED_KEY, String(newValue));
  }, [isPollingEnabled, POLLING_ENABLED_KEY]);

  const handleIntervalChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const newInterval = parseInt(e.target.value, 10);
    setPollingInterval(newInterval);
    localStorage.setItem(POLLING_INTERVAL_KEY, String(newInterval));
  }, [POLLING_INTERVAL_KEY]);

  return {
    isPollingEnabled,
    pollingInterval,
    togglePolling,
    handleIntervalChange,
  };
}
