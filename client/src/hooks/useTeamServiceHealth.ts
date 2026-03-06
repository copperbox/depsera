import { useState, useCallback, useMemo } from 'react';
import { fetchServices } from '../api/services';
import type { ServiceWithDependencies } from '../types/service';

export interface TeamServiceHealthStats {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  unknown: number;
  totalDependencies: number;
}

export interface UseTeamServiceHealthReturn {
  stats: TeamServiceHealthStats;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useTeamServiceHealth(teamId: string): UseTeamServiceHealthReturn {
  const [services, setServices] = useState<ServiceWithDependencies[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchServices(teamId);
      setServices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load service health');
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  const stats = useMemo((): TeamServiceHealthStats => {
    const healthy = services.filter(s => s.health.status === 'healthy').length;
    const warning = services.filter(s => s.health.status === 'warning').length;
    const critical = services.filter(s => s.health.status === 'critical').length;
    const unknown = services.length - healthy - warning - critical;
    const totalDependencies = services.reduce(
      (sum, s) => sum + (s.dependencies?.length ?? 0),
      0
    );

    return {
      total: services.length,
      healthy,
      warning,
      critical,
      unknown,
      totalDependencies,
    };
  }, [services]);

  return { stats, isLoading, error, reload };
}
