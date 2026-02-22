import { useState, useCallback } from 'react';
import {
  fetchAlertChannels,
  createAlertChannel,
  updateAlertChannel,
  deleteAlertChannel,
  testAlertChannel,
} from '../api/alerts';
import type {
  AlertChannel,
  CreateAlertChannelInput,
  UpdateAlertChannelInput,
} from '../types/alert';

export interface UseAlertChannelsReturn {
  channels: AlertChannel[];
  isLoading: boolean;
  error: string | null;
  actionInProgress: string | null;
  testResult: { channelId: string; success: boolean; error: string | null } | null;
  loadChannels: () => Promise<void>;
  handleCreate: (input: CreateAlertChannelInput) => Promise<boolean>;
  handleUpdate: (channelId: string, input: UpdateAlertChannelInput) => Promise<boolean>;
  handleDelete: (channelId: string) => Promise<void>;
  handleToggleActive: (channel: AlertChannel) => Promise<void>;
  handleTest: (channelId: string) => Promise<void>;
  clearTestResult: () => void;
  clearError: () => void;
}

export function useAlertChannels(teamId: string | undefined): UseAlertChannelsReturn {
  const [channels, setChannels] = useState<AlertChannel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    channelId: string;
    success: boolean;
    error: string | null;
  } | null>(null);

  const loadChannels = useCallback(async () => {
    if (!teamId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAlertChannels(teamId);
      setChannels(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alert channels');
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  const handleCreate = useCallback(
    async (input: CreateAlertChannelInput): Promise<boolean> => {
      if (!teamId) return false;
      setActionInProgress('creating');
      setError(null);
      try {
        await createAlertChannel(teamId, input);
        await loadChannels();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create channel');
        return false;
      } finally {
        setActionInProgress(null);
      }
    },
    [teamId, loadChannels]
  );

  const handleUpdate = useCallback(
    async (channelId: string, input: UpdateAlertChannelInput): Promise<boolean> => {
      if (!teamId) return false;
      setActionInProgress(channelId);
      setError(null);
      try {
        await updateAlertChannel(teamId, channelId, input);
        await loadChannels();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update channel');
        return false;
      } finally {
        setActionInProgress(null);
      }
    },
    [teamId, loadChannels]
  );

  const handleDelete = useCallback(
    async (channelId: string) => {
      if (!teamId) return;
      setActionInProgress(channelId);
      setError(null);
      try {
        await deleteAlertChannel(teamId, channelId);
        await loadChannels();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete channel');
      } finally {
        setActionInProgress(null);
      }
    },
    [teamId, loadChannels]
  );

  const handleToggleActive = useCallback(
    async (channel: AlertChannel) => {
      if (!teamId) return;
      setActionInProgress(channel.id);
      setError(null);
      try {
        await updateAlertChannel(teamId, channel.id, {
          is_active: !channel.is_active,
        });
        await loadChannels();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to toggle channel');
      } finally {
        setActionInProgress(null);
      }
    },
    [teamId, loadChannels]
  );

  const handleTest = useCallback(
    async (channelId: string) => {
      if (!teamId) return;
      setActionInProgress(`test-${channelId}`);
      setTestResult(null);
      try {
        const result = await testAlertChannel(teamId, channelId);
        setTestResult({ channelId, success: result.success, error: result.error });
      } catch (err) {
        setTestResult({
          channelId,
          success: false,
          error: err instanceof Error ? err.message : 'Test failed',
        });
      } finally {
        setActionInProgress(null);
      }
    },
    [teamId]
  );

  const clearTestResult = useCallback(() => setTestResult(null), []);
  const clearError = useCallback(() => setError(null), []);

  return {
    channels,
    isLoading,
    error,
    actionInProgress,
    testResult,
    loadChannels,
    handleCreate,
    handleUpdate,
    handleDelete,
    handleToggleActive,
    handleTest,
    clearTestResult,
    clearError,
  };
}
