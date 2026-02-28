import { useState, useCallback, useRef } from 'react';
import { getSyncHistory } from '../api/manifest';
import type { ManifestSyncHistoryEntry } from '../types/manifest';

const PAGE_SIZE = 20;

export interface UseSyncHistoryReturn {
  history: ManifestSyncHistoryEntry[];
  total: number;
  isLoading: boolean;
  hasMore: boolean;
  error: string | null;
  loadHistory: () => Promise<void>;
  loadMore: () => Promise<void>;
  clearError: () => void;
}

export function useSyncHistory(teamId: string | undefined): UseSyncHistoryReturn {
  const [history, setHistory] = useState<ManifestSyncHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);

  const hasMore = history.length < total;

  const loadHistory = useCallback(async () => {
    if (!teamId) return;
    setIsLoading(true);
    setError(null);
    offsetRef.current = 0;
    try {
      const data = await getSyncHistory(teamId, { limit: PAGE_SIZE, offset: 0 });
      setHistory(data.history);
      setTotal(data.total);
      offsetRef.current = data.history.length;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sync history');
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  const loadMore = useCallback(async () => {
    if (!teamId || isLoading || !hasMore) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getSyncHistory(teamId, {
        limit: PAGE_SIZE,
        offset: offsetRef.current,
      });
      setHistory((prev) => [...prev, ...data.history]);
      setTotal(data.total);
      offsetRef.current += data.history.length;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more sync history');
    } finally {
      setIsLoading(false);
    }
  }, [teamId, isLoading, hasMore]);

  const clearError = useCallback(() => setError(null), []);

  return {
    history,
    total,
    isLoading,
    hasMore,
    error,
    loadHistory,
    loadMore,
    clearError,
  };
}
