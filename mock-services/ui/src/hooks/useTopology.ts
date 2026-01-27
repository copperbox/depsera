import { useState, useEffect, useCallback } from 'react';
import type { Topology } from '../types';
import { fetchTopology } from '../api/control';

interface UseTopologyResult {
  topology: Topology | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useTopology(): UseTopologyResult {
  const [topology, setTopology] = useState<Topology | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchTopology();
      setTopology(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch topology'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { topology, loading, error, refresh };
}
