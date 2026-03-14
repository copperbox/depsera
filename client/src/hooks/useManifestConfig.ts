import { useState, useCallback } from 'react';
import {
  getManifestConfig,
  updateManifestConfig,
  removeManifestConfig,
  triggerConfigSync,
} from '../api/manifest';
import type {
  TeamManifestConfig,
  ManifestConfigInput,
  ManifestSyncResult,
} from '../types/manifest';

export interface UseManifestConfigReturn {
  config: TeamManifestConfig | null;
  isLoading: boolean;
  error: string | null;
  isSaving: boolean;
  isSyncing: boolean;
  syncResult: ManifestSyncResult | null;
  loadConfig: () => Promise<void>;
  saveConfig: (input: Partial<ManifestConfigInput>) => Promise<boolean>;
  removeConfig: () => Promise<boolean>;
  toggleEnabled: () => Promise<boolean>;
  triggerSync: () => Promise<ManifestSyncResult | null>;
  clearError: () => void;
  clearSyncResult: () => void;
}

export function useManifestConfig(
  teamId: string | undefined,
  configId: string | undefined
): UseManifestConfigReturn {
  const [config, setConfig] = useState<TeamManifestConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<ManifestSyncResult | null>(null);

  const loadConfig = useCallback(async () => {
    if (!teamId || !configId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getManifestConfig(teamId, configId);
      setConfig(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load manifest config');
    } finally {
      setIsLoading(false);
    }
  }, [teamId, configId]);

  const saveConfig = useCallback(
    async (input: Partial<ManifestConfigInput>): Promise<boolean> => {
      if (!teamId || !configId) return false;
      setIsSaving(true);
      setError(null);
      try {
        const updated = await updateManifestConfig(teamId, configId, input);
        setConfig(updated);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save manifest config');
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [teamId, configId]
  );

  const removeConfigAction = useCallback(async (): Promise<boolean> => {
    if (!teamId || !configId) return false;
    setIsSaving(true);
    setError(null);
    try {
      await removeManifestConfig(teamId, configId);
      setConfig(null);
      setSyncResult(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove manifest config');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [teamId, configId]);

  const toggleEnabled = useCallback(async (): Promise<boolean> => {
    if (!teamId || !configId || !config) return false;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateManifestConfig(teamId, configId, {
        is_enabled: !config.is_enabled,
      });
      setConfig(updated);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle manifest');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [teamId, configId, config]);

  const triggerSyncAction = useCallback(async (): Promise<ManifestSyncResult | null> => {
    if (!teamId || !configId) return null;
    setIsSyncing(true);
    setError(null);
    setSyncResult(null);
    try {
      const result = await triggerConfigSync(teamId, configId);
      setSyncResult(result);
      // Reload config to get updated sync status
      await loadConfig();
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger sync');
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [teamId, configId, loadConfig]);

  const clearError = useCallback(() => setError(null), []);
  const clearSyncResult = useCallback(() => setSyncResult(null), []);

  return {
    config,
    isLoading,
    error,
    isSaving,
    isSyncing,
    syncResult,
    loadConfig,
    saveConfig,
    removeConfig: removeConfigAction,
    toggleEnabled,
    triggerSync: triggerSyncAction,
    clearError,
    clearSyncResult,
  };
}
