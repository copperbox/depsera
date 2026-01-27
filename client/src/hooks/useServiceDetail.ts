import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchService, fetchTeams, deleteService } from '../api/services';
import type { ServiceWithDependencies, TeamWithCounts } from '../types/service';

export interface UseServiceDetailReturn {
  service: ServiceWithDependencies | null;
  teams: TeamWithCounts[];
  isLoading: boolean;
  error: string | null;
  isDeleting: boolean;
  isPolling: boolean;
  loadService: () => Promise<void>;
  handleDelete: () => Promise<void>;
  handlePoll: () => Promise<void>;
  setError: (error: string | null) => void;
}

export function useServiceDetail(id: string | undefined): UseServiceDetailReturn {
  const navigate = useNavigate();
  const [service, setService] = useState<ServiceWithDependencies | null>(null);
  const [teams, setTeams] = useState<TeamWithCounts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  const loadService = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const [serviceData, teamsData] = await Promise.all([
        fetchService(id),
        fetchTeams(),
      ]);
      setService(serviceData);
      setTeams(teamsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load service');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const handleDelete = useCallback(async () => {
    if (!id) return;
    setIsDeleting(true);
    try {
      await deleteService(id);
      navigate('/services');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete service');
    } finally {
      setIsDeleting(false);
    }
  }, [id, navigate]);

  const handlePoll = useCallback(async () => {
    if (!id) return;
    setIsPolling(true);
    try {
      const serviceData = await fetchService(id);
      setService(serviceData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh service');
    } finally {
      setIsPolling(false);
    }
  }, [id]);

  return {
    service,
    teams,
    isLoading,
    error,
    isDeleting,
    isPolling,
    loadService,
    handleDelete,
    handlePoll,
    setError,
  };
}
