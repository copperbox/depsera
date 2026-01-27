import { useState, useEffect, useCallback } from 'react';
import type { Scenario } from '../types';
import { fetchScenarios } from '../api/control';

interface UseScenariosResult {
  scenarios: Scenario[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useScenarios(): UseScenariosResult {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchScenarios();
      setScenarios(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch scenarios'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { scenarios, loading, error, refresh };
}
