import { useState, useMemo, useCallback } from 'react';
import { fetchServices, fetchTeams } from '../api/services';
import type { Service, TeamWithCounts } from '../types/service';

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
    return services.filter((service) => {
      const matchesSearch = service.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesTeam = !teamFilter || service.team_id === teamFilter;
      return matchesSearch && matchesTeam;
    });
  }, [services, searchQuery, teamFilter]);

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
    loadData,
  };
}
