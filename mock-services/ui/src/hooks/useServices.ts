import { useState, useEffect, useCallback } from 'react';
import type { Service } from '../types';
import { fetchServices } from '../api/control';
import { usePolling } from './usePolling';

interface UseServicesResult {
  services: Service[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useServices(pollInterval: number = 2000): UseServicesResult {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchServices();
      setServices(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch services'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  usePolling(refresh, { interval: pollInterval, enabled: !loading });

  return { services, loading, error, refresh };
}
