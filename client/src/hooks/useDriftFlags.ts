import { useState, useCallback, useMemo } from 'react';
import {
  getDriftFlags,
  acceptDrift,
  dismissDrift,
  reopenDrift,
  bulkAcceptDrifts,
  bulkDismissDrifts,
} from '../api/manifest';
import type {
  DriftFlagWithContext,
  DriftSummary,
  DriftType,
  DriftFlagStatus,
} from '../types/manifest';

export type DriftView = 'pending' | 'dismissed';

export interface UseDriftFlagsReturn {
  flags: DriftFlagWithContext[];
  filtered: DriftFlagWithContext[];
  summary: DriftSummary | null;
  isLoading: boolean;
  error: string | null;
  view: DriftView;
  setView: (view: DriftView) => void;
  typeFilter: DriftType | '';
  setTypeFilter: (value: DriftType | '') => void;
  serviceFilter: string;
  setServiceFilter: (value: string) => void;
  selectedIds: Set<string>;
  toggleSelected: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  loadFlags: () => Promise<void>;
  accept: (id: string) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  reopen: (id: string) => Promise<void>;
  bulkAccept: () => Promise<void>;
  bulkDismiss: () => Promise<void>;
  clearError: () => void;
}

export function useDriftFlags(teamId: string | undefined): UseDriftFlagsReturn {
  const [flags, setFlags] = useState<DriftFlagWithContext[]>([]);
  const [summary, setSummary] = useState<DriftSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setViewState] = useState<DriftView>('pending');
  const [typeFilter, setTypeFilter] = useState<DriftType | ''>('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let result = flags;
    if (typeFilter) {
      result = result.filter((f) => f.drift_type === typeFilter);
    }
    if (serviceFilter) {
      result = result.filter((f) => f.service_id === serviceFilter);
    }
    return result;
  }, [flags, typeFilter, serviceFilter]);

  const loadFlags = useCallback(async () => {
    if (!teamId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getDriftFlags(teamId, {
        status: view as DriftFlagStatus,
        limit: 250,
      });
      setFlags(data.flags);
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load drift flags');
    } finally {
      setIsLoading(false);
    }
  }, [teamId, view]);

  const setView = useCallback((newView: DriftView) => {
    setViewState(newView);
    setSelectedIds(new Set());
  }, []);

  const accept = useCallback(
    async (id: string) => {
      if (!teamId) return;
      setError(null);
      try {
        await acceptDrift(teamId, id);
        await loadFlags();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to accept drift flag');
      }
    },
    [teamId, loadFlags]
  );

  const dismiss = useCallback(
    async (id: string) => {
      if (!teamId) return;
      setError(null);
      try {
        await dismissDrift(teamId, id);
        await loadFlags();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to dismiss drift flag');
      }
    },
    [teamId, loadFlags]
  );

  const reopen = useCallback(
    async (id: string) => {
      if (!teamId) return;
      setError(null);
      try {
        await reopenDrift(teamId, id);
        await loadFlags();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reopen drift flag');
      }
    },
    [teamId, loadFlags]
  );

  const bulkAccept = useCallback(async () => {
    if (!teamId || selectedIds.size === 0) return;
    setError(null);
    try {
      await bulkAcceptDrifts(teamId, Array.from(selectedIds));
      setSelectedIds(new Set());
      await loadFlags();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to bulk accept drift flags');
    }
  }, [teamId, selectedIds, loadFlags]);

  const bulkDismiss = useCallback(async () => {
    if (!teamId || selectedIds.size === 0) return;
    setError(null);
    try {
      await bulkDismissDrifts(teamId, Array.from(selectedIds));
      setSelectedIds(new Set());
      await loadFlags();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to bulk dismiss drift flags');
    }
  }, [teamId, selectedIds, loadFlags]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filtered.map((f) => f.id)));
  }, [filtered]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    flags,
    filtered,
    summary,
    isLoading,
    error,
    view,
    setView,
    typeFilter,
    setTypeFilter,
    serviceFilter,
    setServiceFilter,
    selectedIds,
    toggleSelected,
    selectAll,
    clearSelection,
    loadFlags,
    accept,
    dismiss,
    reopen,
    bulkAccept,
    bulkDismiss,
    clearError,
  };
}
