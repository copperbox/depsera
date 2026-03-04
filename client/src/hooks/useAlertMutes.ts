import { useState, useCallback } from 'react';
import { fetchAlertMutes, createAlertMute, deleteAlertMute } from '../api/alertMutes';
import type { AlertMute, CreateAlertMuteInput } from '../types/alert';

export interface UseAlertMutesReturn {
  mutes: AlertMute[];
  total: number;
  isLoading: boolean;
  isCreating: boolean;
  error: string | null;
  loadMutes: () => Promise<void>;
  handleCreate: (input: CreateAlertMuteInput) => Promise<boolean>;
  handleDelete: (muteId: string) => Promise<boolean>;
  clearError: () => void;
}

export function useAlertMutes(teamId: string | undefined): UseAlertMutesReturn {
  const [mutes, setMutes] = useState<AlertMute[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMutes = useCallback(async () => {
    if (!teamId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAlertMutes(teamId);
      setMutes(data.mutes);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alert mutes');
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  const handleCreate = useCallback(
    async (input: CreateAlertMuteInput): Promise<boolean> => {
      if (!teamId) return false;
      setIsCreating(true);
      setError(null);
      try {
        await createAlertMute(teamId, input);
        await loadMutes();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create alert mute');
        return false;
      } finally {
        setIsCreating(false);
      }
    },
    [teamId, loadMutes]
  );

  const handleDelete = useCallback(
    async (muteId: string): Promise<boolean> => {
      if (!teamId) return false;
      setError(null);
      try {
        await deleteAlertMute(teamId, muteId);
        await loadMutes();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete alert mute');
        return false;
      }
    },
    [teamId, loadMutes]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    mutes,
    total,
    isLoading,
    isCreating,
    error,
    loadMutes,
    handleCreate,
    handleDelete,
    clearError,
  };
}
