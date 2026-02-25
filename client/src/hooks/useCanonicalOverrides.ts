import { useState, useCallback } from 'react';
import {
  fetchCanonicalOverrides,
  upsertCanonicalOverride,
  deleteCanonicalOverride,
} from '../api/canonicalOverrides';
import type { CanonicalOverride, CanonicalOverrideInput } from '../types/canonicalOverride';

export interface UseCanonicalOverridesReturn {
  overrides: CanonicalOverride[];
  isLoading: boolean;
  error: string | null;
  loadOverrides: () => Promise<void>;
  saveOverride: (canonicalName: string, input: CanonicalOverrideInput) => Promise<void>;
  removeOverride: (canonicalName: string) => Promise<void>;
  getOverride: (canonicalName: string) => CanonicalOverride | undefined;
}

export function useCanonicalOverrides(): UseCanonicalOverridesReturn {
  const [overrides, setOverrides] = useState<CanonicalOverride[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverrides = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchCanonicalOverrides();
      setOverrides(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load canonical overrides');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveOverride = useCallback(async (canonicalName: string, input: CanonicalOverrideInput) => {
    setError(null);
    try {
      await upsertCanonicalOverride(canonicalName, input);
      await loadOverrides();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save canonical override';
      setError(message);
      throw err;
    }
  }, [loadOverrides]);

  const removeOverride = useCallback(async (canonicalName: string) => {
    setError(null);
    try {
      await deleteCanonicalOverride(canonicalName);
      setOverrides((prev) => prev.filter((o) => o.canonical_name !== canonicalName));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete canonical override';
      setError(message);
      throw err;
    }
  }, []);

  const getOverride = useCallback(
    (canonicalName: string) => overrides.find((o) => o.canonical_name === canonicalName),
    [overrides]
  );

  return {
    overrides,
    isLoading,
    error,
    loadOverrides,
    saveOverride,
    removeOverride,
    getOverride,
  };
}
