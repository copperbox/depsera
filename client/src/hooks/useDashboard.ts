import { useState, useMemo, useCallback } from 'react';
import { fetchServices, fetchTeams } from '../api/services';
import type { Service, TeamWithCounts } from '../types/service';

export interface DashboardStats {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
}

export interface TeamHealthSummary {
  team: TeamWithCounts;
  healthy: number;
  warning: number;
  critical: number;
  total: number;
}

export interface UseDashboardReturn {
  services: Service[];
  teams: TeamWithCounts[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  stats: DashboardStats;
  servicesWithIssues: Service[];
  recentActivity: Service[];
  teamHealthSummary: TeamHealthSummary[];
  loadData: (isBackgroundRefresh?: boolean) => Promise<void>;
}

export function useDashboard(): UseDashboardReturn {
  const [services, setServices] = useState<Service[]>([]);
  const [teams, setTeams] = useState<TeamWithCounts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);
    try {
      const [servicesData, teamsData] = await Promise.all([
        fetchServices(),
        fetchTeams(),
      ]);
      setServices(servicesData);
      setTeams(teamsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Calculate summary statistics
  const stats = useMemo((): DashboardStats => {
    const healthyCount = services.filter(s => s.health.status === 'healthy').length;
    const warningCount = services.filter(s => s.health.status === 'warning').length;
    const criticalCount = services.filter(s => s.health.status === 'critical').length;

    return {
      total: services.length,
      healthy: healthyCount,
      warning: warningCount,
      critical: criticalCount,
    };
  }, [services]);

  // Services with issues (warning or critical)
  const servicesWithIssues = useMemo(() => {
    return services
      .filter(s => s.health.status === 'warning' || s.health.status === 'critical')
      .sort((a, b) => {
        // Sort critical first, then warning
        if (a.health.status === 'critical' && b.health.status !== 'critical') return -1;
        if (a.health.status !== 'critical' && b.health.status === 'critical') return 1;
        return 0;
      })
      .slice(0, 5);
  }, [services]);

  // Recent activity (services with recent reports, sorted by last_report)
  const recentActivity = useMemo(() => {
    return services
      .filter(s => s.health.last_report)
      .sort((a, b) => {
        const dateA = new Date(a.health.last_report!).getTime();
        const dateB = new Date(b.health.last_report!).getTime();
        return dateB - dateA;
      })
      .slice(0, 5);
  }, [services]);

  // Team health summary
  const teamHealthSummary = useMemo((): TeamHealthSummary[] => {
    return teams.map(team => {
      const teamServices = services.filter(s => s.team_id === team.id);
      return {
        team,
        healthy: teamServices.filter(s => s.health.status === 'healthy').length,
        warning: teamServices.filter(s => s.health.status === 'warning').length,
        critical: teamServices.filter(s => s.health.status === 'critical').length,
        total: teamServices.length,
      };
    }).filter(t => t.total > 0); // Only show teams with services
  }, [services, teams]);

  return {
    services,
    teams,
    isLoading,
    isRefreshing,
    error,
    stats,
    servicesWithIssues,
    recentActivity,
    teamHealthSummary,
    loadData,
  };
}
