import { useState, useEffect, useCallback } from 'react';
import type { ActiveFailure } from '../types';
import { fetchFailures } from '../api/control';
import { usePolling } from './usePolling';

interface UseFailuresResult {
  failures: ActiveFailure[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useFailures(pollInterval: number = 2000): UseFailuresResult {
  const [failures, setFailures] = useState<ActiveFailure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchFailures();
      setFailures(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch failures'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  usePolling(refresh, { interval: pollInterval, enabled: !loading });

  return { failures, loading, error, refresh };
}
