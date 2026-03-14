import { useState, useCallback } from 'react';
import {
  getManifestConfigs,
  createManifestConfig,
} from '../api/manifest';
import type {
  TeamManifestConfig,
  ManifestConfigInput,
} from '../types/manifest';

export interface UseManifestConfigsReturn {
  configs: TeamManifestConfig[];
  isLoading: boolean;
  error: string | null;
  isCreating: boolean;
  loadConfigs: () => Promise<void>;
  createConfig: (input: ManifestConfigInput) => Promise<TeamManifestConfig | null>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

export function useManifestConfigs(teamId: string | undefined): UseManifestConfigsReturn {
  const [configs, setConfigs] = useState<TeamManifestConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const loadConfigs = useCallback(async () => {
    if (!teamId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getManifestConfigs(teamId);
      setConfigs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load manifest configs');
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  const createConfig = useCallback(
    async (input: ManifestConfigInput): Promise<TeamManifestConfig | null> => {
      if (!teamId) return null;
      setIsCreating(true);
      setError(null);
      try {
        const config = await createManifestConfig(teamId, input);
        // Reload to get fresh list
        await loadConfigs();
        return config;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create manifest config');
        return null;
      } finally {
        setIsCreating(false);
      }
    },
    [teamId, loadConfigs]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    configs,
    isLoading,
    error,
    isCreating,
    loadConfigs,
    createConfig,
    refresh: loadConfigs,
    clearError,
  };
}
