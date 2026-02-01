import { useState, useCallback, useMemo } from 'react';
import { fetchSuggestions, acceptSuggestion, dismissSuggestion } from '../api/associations';
import type { AssociationSuggestion } from '../types/association';

export interface UseSuggestionsReturn {
  suggestions: AssociationSuggestion[];
  filtered: AssociationSuggestion[];
  isLoading: boolean;
  error: string | null;
  selectedIds: Set<string>;
  serviceFilter: string;
  teamFilter: string;
  setServiceFilter: (value: string) => void;
  setTeamFilter: (value: string) => void;
  toggleSelected: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  loadSuggestions: () => Promise<void>;
  accept: (id: string) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  bulkAccept: () => Promise<void>;
  bulkDismiss: () => Promise<void>;
}

export function useSuggestions(): UseSuggestionsReturn {
  const [suggestions, setSuggestions] = useState<AssociationSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [serviceFilter, setServiceFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');

  const filtered = useMemo(() => {
    let result = suggestions;
    if (serviceFilter) {
      result = result.filter((s) => s.service_name === serviceFilter);
    }
    if (teamFilter) {
      result = result.filter((s) => s.linked_service_name === teamFilter);
    }
    return result;
  }, [suggestions, serviceFilter, teamFilter]);

  const loadSuggestions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchSuggestions();
      setSuggestions(data);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load suggestions');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const accept = useCallback(async (id: string) => {
    setError(null);
    try {
      await acceptSuggestion(id);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept suggestion');
    }
  }, []);

  const dismiss = useCallback(async (id: string) => {
    setError(null);
    try {
      await dismissSuggestion(id);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss suggestion');
    }
  }, []);

  const bulkAccept = useCallback(async () => {
    setError(null);
    try {
      await Promise.all(Array.from(selectedIds).map(acceptSuggestion));
      setSuggestions((prev) => prev.filter((s) => !selectedIds.has(s.id)));
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept suggestions');
    }
  }, [selectedIds]);

  const bulkDismiss = useCallback(async () => {
    setError(null);
    try {
      await Promise.all(Array.from(selectedIds).map(dismissSuggestion));
      setSuggestions((prev) => prev.filter((s) => !selectedIds.has(s.id)));
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dismiss suggestions');
    }
  }, [selectedIds]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filtered.map((s) => s.id)));
  }, [filtered]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    suggestions,
    filtered,
    isLoading,
    error,
    selectedIds,
    serviceFilter,
    teamFilter,
    setServiceFilter,
    setTeamFilter,
    toggleSelected,
    selectAll,
    clearSelection,
    loadSuggestions,
    accept,
    dismiss,
    bulkAccept,
    bulkDismiss,
  };
}
