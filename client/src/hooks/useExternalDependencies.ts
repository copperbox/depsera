import { useState, useCallback } from 'react';
import { fetchExternalDependencies } from '../api/catalog';
import type { ExternalDependencyEntry } from '../types/catalog';

export interface UseExternalDependenciesReturn {
  entries: ExternalDependencyEntry[];
  isLoading: boolean;
  error: string | null;
  load: () => Promise<void>;
}

export function useExternalDependencies(): UseExternalDependenciesReturn {
  const [entries, setEntries] = useState<ExternalDependencyEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchExternalDependencies();
      setEntries(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load external dependencies',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { entries, isLoading, error, load };
}
