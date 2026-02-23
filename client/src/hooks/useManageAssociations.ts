import { useState, useCallback, useMemo, useEffect } from 'react';
import { fetchServices } from '../api/services';
import { fetchAssociations, createAssociation, deleteAssociation } from '../api/associations';
import type { ServiceWithDependencies } from '../types/service';
import type { Association, CreateAssociationInput } from '../types/association';

export type StatusFilter = 'all' | 'linked' | 'unlinked';

export interface UseManageAssociationsReturn {
  services: ServiceWithDependencies[];
  filteredServices: ServiceWithDependencies[];
  isLoading: boolean;
  error: string | null;
  expandedServiceIds: Set<string>;
  expandedDependencyIds: Set<string>;
  toggleService: (serviceId: string) => void;
  toggleDependency: (dependencyId: string) => void;
  associationCache: Map<string, Association[]>;
  addAssociation: (dependencyId: string, input: CreateAssociationInput) => Promise<void>;
  removeAssociation: (dependencyId: string, serviceId: string) => Promise<void>;
  refreshAssociations: (dependencyId: string) => Promise<void>;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (filter: StatusFilter) => void;
}

export function useManageAssociations(): UseManageAssociationsReturn {
  const [services, setServices] = useState<ServiceWithDependencies[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedServiceIds, setExpandedServiceIds] = useState<Set<string>>(new Set());
  const [expandedDependencyIds, setExpandedDependencyIds] = useState<Set<string>>(new Set());
  const [associationCache, setAssociationCache] = useState<Map<string, Association[]>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchServices();
        if (!cancelled) {
          setServices(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load services');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const loadAssociationsForDep = useCallback(async (dependencyId: string) => {
    try {
      const data = await fetchAssociations(dependencyId);
      setAssociationCache((prev) => {
        const next = new Map(prev);
        next.set(dependencyId, data);
        return next;
      });
    } catch (err) {
      console.error('Failed to load associations for dependency:', dependencyId, err);
    }
  }, []);

  const toggleService = useCallback((serviceId: string) => {
    setExpandedServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(serviceId)) {
        next.delete(serviceId);
      } else {
        next.add(serviceId);
      }
      return next;
    });
  }, []);

  const toggleDependency = useCallback((dependencyId: string) => {
    setExpandedDependencyIds((prev) => {
      const next = new Set(prev);
      if (next.has(dependencyId)) {
        next.delete(dependencyId);
      } else {
        next.add(dependencyId);
        // Lazy-load associations when expanding for the first time
        if (!associationCache.has(dependencyId)) {
          loadAssociationsForDep(dependencyId);
        }
      }
      return next;
    });
  }, [associationCache, loadAssociationsForDep]);

  const addAssociation = useCallback(async (dependencyId: string, input: CreateAssociationInput) => {
    await createAssociation(dependencyId, input);
    await loadAssociationsForDep(dependencyId);
  }, [loadAssociationsForDep]);

  const removeAssociation = useCallback(async (dependencyId: string, serviceId: string) => {
    await deleteAssociation(dependencyId, serviceId);
    setAssociationCache((prev) => {
      const next = new Map(prev);
      const current = next.get(dependencyId);
      if (current) {
        next.set(dependencyId, current.filter((a) => a.linked_service_id !== serviceId));
      }
      return next;
    });
  }, []);

  const filteredServices = useMemo(() => {
    const query = searchQuery.toLowerCase();

    return services
      .map((service) => {
        // Filter dependencies by search query
        const filteredDeps = service.dependencies.filter((dep) => {
          const matchesSearch =
            !query ||
            dep.name.toLowerCase().includes(query) ||
            service.name.toLowerCase().includes(query);

          if (!matchesSearch) return false;

          if (statusFilter === 'all') return true;

          const assocs = associationCache.get(dep.id);
          // If not loaded yet, include it (will load on expand)
          if (assocs === undefined) return true;

          if (statusFilter === 'linked') return assocs.length > 0;
          if (statusFilter === 'unlinked') return assocs.length === 0;

          return true;
        });

        if (filteredDeps.length === 0) return null;

        return {
          ...service,
          dependencies: filteredDeps,
        };
      })
      .filter((s): s is ServiceWithDependencies => s !== null);
  }, [services, searchQuery, statusFilter, associationCache]);

  return {
    services,
    filteredServices,
    isLoading,
    error,
    expandedServiceIds,
    expandedDependencyIds,
    toggleService,
    toggleDependency,
    associationCache,
    addAssociation,
    removeAssociation,
    refreshAssociations: loadAssociationsForDep,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
  };
}
