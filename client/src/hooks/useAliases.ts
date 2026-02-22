import { useState, useCallback } from 'react';
import {
  fetchAliases,
  createAlias,
  updateAlias,
  deleteAlias,
  fetchCanonicalNames,
} from '../api/aliases';
import type { DependencyAlias, CreateAliasInput } from '../types/alias';

export interface UseAliasesReturn {
  aliases: DependencyAlias[];
  canonicalNames: string[];
  isLoading: boolean;
  error: string | null;
  loadAliases: () => Promise<void>;
  loadCanonicalNames: () => Promise<void>;
  addAlias: (input: CreateAliasInput) => Promise<void>;
  editAlias: (id: string, canonicalName: string) => Promise<void>;
  removeAlias: (id: string) => Promise<void>;
}

export function useAliases(): UseAliasesReturn {
  const [aliases, setAliases] = useState<DependencyAlias[]>([]);
  const [canonicalNames, setCanonicalNames] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAliases = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAliases();
      setAliases(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load aliases');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadCanonicalNames = useCallback(async () => {
    try {
      const names = await fetchCanonicalNames();
      setCanonicalNames(names);
    } catch {
      // non-critical
    }
  }, []);

  const addAlias = useCallback(async (input: CreateAliasInput) => {
    setError(null);
    try {
      await createAlias(input);
      await loadAliases();
      await loadCanonicalNames();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create alias';
      setError(message);
      throw err;
    }
  }, [loadAliases, loadCanonicalNames]);

  const editAlias = useCallback(async (id: string, canonicalName: string) => {
    setError(null);
    try {
      await updateAlias(id, { canonical_name: canonicalName });
      await loadAliases();
      await loadCanonicalNames();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update alias';
      setError(message);
      throw err;
    }
  }, [loadAliases, loadCanonicalNames]);

  const removeAlias = useCallback(async (id: string) => {
    setError(null);
    try {
      await deleteAlias(id);
      setAliases((prev) => prev.filter((a) => a.id !== id));
      await loadCanonicalNames();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete alias';
      setError(message);
      throw err;
    }
  }, [loadCanonicalNames]);

  return {
    aliases,
    canonicalNames,
    isLoading,
    error,
    loadAliases,
    loadCanonicalNames,
    addAlias,
    editAlias,
    removeAlias,
  };
}
