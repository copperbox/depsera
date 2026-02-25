import { useState, useMemo, useCallback } from 'react';
import { fetchServices, fetchTeams } from '../api/services';
import { fetchRecentActivity, fetchUnstableDependencies } from '../api/activity';
import type { Service, TeamWithCounts } from '../types/service';
import type { StatusChangeActivity, UnstableDependency } from '../types/activity';

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
  recentActivity: StatusChangeActivity[];
  unstableDependencies: UnstableDependency[];
  teamHealthSummary: TeamHealthSummary[];
  loadData: (isBackgroundRefresh?: boolean) => Promise<void>;
}

export function useDashboard(): UseDashboardReturn {
  const [services, setServices] = useState<Service[]>([]);
  const [teams, setTeams] = useState<TeamWithCounts[]>([]);
  const [recentActivity, setRecentActivity] = useState<StatusChangeActivity[]>([]);
  const [unstableDependencies, setUnstableDependencies] = useState<UnstableDependency[]>([]);
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
      const [servicesData, teamsData, activityData, unstableData] = await Promise.all([
        fetchServices(),
        fetchTeams(),
        fetchRecentActivity(5),
        fetchUnstableDependencies(24, 5),
      ]);
      setServices(servicesData);
      setTeams(teamsData);
      setRecentActivity(activityData);
      setUnstableDependencies(unstableData);
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
    unstableDependencies,
    teamHealthSummary,
    loadData,
  };
}
