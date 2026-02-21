import { useState, useCallback } from 'react';
import { fetchAlertRules, updateAlertRules } from '../api/alerts';
import type { AlertRule, UpdateAlertRuleInput } from '../types/alert';

export interface UseAlertRulesReturn {
  rules: AlertRule[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  saveSuccess: boolean;
  loadRules: () => Promise<void>;
  handleSave: (input: UpdateAlertRuleInput) => Promise<boolean>;
  clearError: () => void;
  clearSaveSuccess: () => void;
}

export function useAlertRules(teamId: string | undefined): UseAlertRulesReturn {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadRules = useCallback(async () => {
    if (!teamId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAlertRules(teamId);
      setRules(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load alert rules');
    } finally {
      setIsLoading(false);
    }
  }, [teamId]);

  const handleSave = useCallback(
    async (input: UpdateAlertRuleInput): Promise<boolean> => {
      if (!teamId) return false;
      setIsSaving(true);
      setError(null);
      setSaveSuccess(false);
      try {
        await updateAlertRules(teamId, input);
        await loadRules();
        setSaveSuccess(true);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save alert rules');
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [teamId, loadRules]
  );

  const clearError = useCallback(() => setError(null), []);
  const clearSaveSuccess = useCallback(() => setSaveSuccess(false), []);

  return {
    rules,
    isLoading,
    isSaving,
    error,
    saveSuccess,
    loadRules,
    handleSave,
    clearError,
    clearSaveSuccess,
  };
}
