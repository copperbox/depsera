import { useState, useMemo, useCallback } from 'react';
import { fetchServices, fetchTeams } from '../api/services';
import type { Service, TeamWithCounts, HealthStatus } from '../types/service';

export type SortColumn = 'name' | 'team' | 'status';
export type SortDirection = 'asc' | 'desc';

const STATUS_SEVERITY: Record<HealthStatus, number> = {
  critical: 0,
  warning: 1,
  healthy: 2,
  unknown: 3,
  skipped: 4,
};

export interface UseServicesListReturn {
  services: Service[];
  teams: TeamWithCounts[];
  filteredServices: Service[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  teamFilter: string;
  setTeamFilter: (teamId: string) => void;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  toggleSort: (column: SortColumn) => void;
  loadData: (isBackgroundRefresh?: boolean) => Promise<void>;
}

export function useServicesList(): UseServicesListReturn {
  const [services, setServices] = useState<Service[]>([]);
  const [teams, setTeams] = useState<TeamWithCounts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const toggleSort = useCallback((column: SortColumn) => {
    setSortColumn((prev) => {
      if (prev === column) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortDirection('asc');
      }
      return column;
    });
  }, []);

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
      setError(err instanceof Error ? err.message : 'Failed to load services');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const filteredServices = useMemo(() => {
    const filtered = services.filter((service) => {
      const matchesSearch = service.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesTeam = !teamFilter || service.team_id === teamFilter;
      return matchesSearch && matchesTeam;
    });

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'team':
          cmp = a.team.name.localeCompare(b.team.name);
          break;
        case 'status':
          cmp = STATUS_SEVERITY[a.health.status] - STATUS_SEVERITY[b.health.status];
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [services, searchQuery, teamFilter, sortColumn, sortDirection]);

  return {
    services,
    teams,
    filteredServices,
    isLoading,
    isRefreshing,
    error,
    searchQuery,
    setSearchQuery,
    teamFilter,
    setTeamFilter,
    sortColumn,
    sortDirection,
    toggleSort,
    loadData,
  };
}
