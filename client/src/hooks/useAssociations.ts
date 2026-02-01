import { useState, useCallback } from 'react';
import {
  fetchAssociations,
  createAssociation,
  deleteAssociation,
} from '../api/associations';
import type { Association, CreateAssociationInput } from '../types/association';

export interface UseAssociationsReturn {
  associations: Association[];
  isLoading: boolean;
  error: string | null;
  loadAssociations: () => Promise<void>;
  addAssociation: (input: CreateAssociationInput) => Promise<void>;
  removeAssociation: (serviceId: string) => Promise<void>;
}

export function useAssociations(dependencyId: string | undefined): UseAssociationsReturn {
  const [associations, setAssociations] = useState<Association[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAssociations = useCallback(async () => {
    if (!dependencyId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAssociations(dependencyId);
      setAssociations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load associations');
    } finally {
      setIsLoading(false);
    }
  }, [dependencyId]);

  const addAssociation = useCallback(
    async (input: CreateAssociationInput) => {
      if (!dependencyId) return;
      setError(null);
      try {
        await createAssociation(dependencyId, input);
        await loadAssociations();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create association');
        throw err;
      }
    },
    [dependencyId, loadAssociations],
  );

  const removeAssociation = useCallback(
    async (serviceId: string) => {
      if (!dependencyId) return;
      setError(null);
      try {
        await deleteAssociation(dependencyId, serviceId);
        setAssociations((prev) => prev.filter((a) => a.linked_service_id !== serviceId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete association');
        throw err;
      }
    },
    [dependencyId],
  );

  return { associations, isLoading, error, loadAssociations, addAssociation, removeAssociation };
}
