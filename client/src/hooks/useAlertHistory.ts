import { useState, useCallback } from 'react';
import { fetchAlertHistory } from '../api/alerts';
import type { AlertHistoryEntry, AlertStatus } from '../types/alert';

export interface UseAlertHistoryReturn {
  entries: AlertHistoryEntry[];
  isLoading: boolean;
  error: string | null;
  statusFilter: AlertStatus | '';
  setStatusFilter: (status: AlertStatus | '') => void;
  loadHistory: () => Promise<void>;
  clearError: () => void;
}

export function useAlertHistory(teamId: string | undefined): UseAlertHistoryReturn {
  const [entries, setEntries] = useState<AlertHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<AlertStatus | ''>('');

  const loadHistory = useCallback(async () => {
    if (!teamId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAlertHistory(teamId, {
        limit: 50,
        status: statusFilter || undefined,
      });
      setEntries(data.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alert history');
    } finally {
      setIsLoading(false);
    }
  }, [teamId, statusFilter]);

  const clearError = useCallback(() => setError(null), []);

  return {
    entries,
    isLoading,
    error,
    statusFilter,
    setStatusFilter,
    loadHistory,
    clearError,
  };
}
