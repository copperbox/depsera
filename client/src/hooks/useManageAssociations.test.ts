import { renderHook, act } from '@testing-library/react';
import { useManageAssociations } from './useManageAssociations';

jest.mock('../api/services');
jest.mock('../api/associations');

import { fetchServices } from '../api/services';
import {
  fetchAssociations,
  createAssociation,
  deleteAssociation,
} from '../api/associations';

const mockFetchServices = fetchServices as jest.MockedFunction<typeof fetchServices>;
const mockFetchAssociations = fetchAssociations as jest.MockedFunction<typeof fetchAssociations>;
const mockCreateAssociation = createAssociation as jest.MockedFunction<typeof createAssociation>;
const mockDeleteAssociation = deleteAssociation as jest.MockedFunction<typeof deleteAssociation>;

function makeService(overrides = {}) {
  return {
    id: 'svc-1',
    name: 'Service Alpha',
    team_id: 'team-1',
    health_endpoint: 'http://localhost:3000/health',
    metrics_endpoint: null,
    schema_config: null,
    is_active: 1,
    last_poll_success: 1,
    last_poll_error: null,
    poll_warnings: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    team: { id: 'team-1', name: 'Team One', key: null, description: null, created_at: '', updated_at: '' },
    health: {
      status: 'healthy' as const,
      healthy_reports: 1,
      warning_reports: 0,
      critical_reports: 0,
      total_reports: 1,
      dependent_count: 0,
      last_report: null,
    },
    dependencies: [
      {
        id: 'dep-1',
        service_id: 'svc-1',
        name: 'Redis',
        canonical_name: null,
        description: null,
        impact: null,
        contact: null,
        contact_override: null,
        impact_override: null,
        effective_contact: null,
        effective_impact: null,
        healthy: 1,
        health_state: 0 as const,
        health_code: null,
        latency_ms: 5,
        skipped: 0,
        last_checked: '2024-01-01T00:00:00Z',
        last_status_change: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      {
        id: 'dep-2',
        service_id: 'svc-1',
        name: 'PostgreSQL',
        canonical_name: null,
        description: null,
        impact: null,
        contact: null,
        contact_override: null,
        impact_override: null,
        effective_contact: null,
        effective_impact: null,
        healthy: 1,
        health_state: 0 as const,
        health_code: null,
        latency_ms: 10,
        skipped: 0,
        last_checked: '2024-01-01T00:00:00Z',
        last_status_change: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ],
    dependent_reports: [],
    ...overrides,
  };
}

function makeAssociation(overrides = {}) {
  return {
    id: 'assoc-1',
    dependency_id: 'dep-1',
    linked_service_id: 'svc-2',
    association_type: 'api_call' as const,
    created_at: '2024-01-01T00:00:00Z',
    linked_service: {
      id: 'svc-2',
      name: 'Service Beta',
      team_id: 'team-1',
      health_endpoint: 'http://localhost:3001/health',
      metrics_endpoint: null,
      schema_config: null,
      is_active: 1,
      last_poll_success: 1,
      last_poll_error: null,
      poll_warnings: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      team: { id: 'team-1', name: 'Team One', key: null, description: null, created_at: '', updated_at: '' },
      health: {
        status: 'healthy' as const,
        healthy_reports: 0,
        warning_reports: 0,
        critical_reports: 0,
        total_reports: 0,
        dependent_count: 0,
        last_report: null,
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  mockFetchServices.mockReset();
  mockFetchAssociations.mockReset();
  mockCreateAssociation.mockReset();
  mockDeleteAssociation.mockReset();
});

describe('useManageAssociations', () => {
  it('loads services on mount', async () => {
    const services = [makeService()];
    mockFetchServices.mockResolvedValue(services);

    const { result } = renderHook(() => useManageAssociations());

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockFetchServices).toHaveBeenCalled();
    expect(result.current.services).toEqual(services);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('handles fetch services error', async () => {
    mockFetchServices.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useManageAssociations());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.isLoading).toBe(false);
  });

  it('handles non-Error exception', async () => {
    mockFetchServices.mockRejectedValue('String error');

    const { result } = renderHook(() => useManageAssociations());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.error).toBe('Failed to load services');
  });

  it('toggles service expansion', async () => {
    mockFetchServices.mockResolvedValue([makeService()]);

    const { result } = renderHook(() => useManageAssociations());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.expandedServiceIds.has('svc-1')).toBe(false);

    act(() => {
      result.current.toggleService('svc-1');
    });

    expect(result.current.expandedServiceIds.has('svc-1')).toBe(true);

    act(() => {
      result.current.toggleService('svc-1');
    });

    expect(result.current.expandedServiceIds.has('svc-1')).toBe(false);
  });

  it('toggles dependency expansion and lazy-loads associations', async () => {
    const assocs = [makeAssociation()];
    mockFetchServices.mockResolvedValue([makeService()]);
    mockFetchAssociations.mockResolvedValue(assocs);

    const { result } = renderHook(() => useManageAssociations());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.expandedDependencyIds.has('dep-1')).toBe(false);

    await act(async () => {
      result.current.toggleDependency('dep-1');
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.expandedDependencyIds.has('dep-1')).toBe(true);
    expect(mockFetchAssociations).toHaveBeenCalledWith('dep-1');
    expect(result.current.associationCache.get('dep-1')).toEqual(assocs);
  });

  it('does not re-fetch associations if already cached', async () => {
    mockFetchServices.mockResolvedValue([makeService()]);
    mockFetchAssociations.mockResolvedValue([makeAssociation()]);

    const { result } = renderHook(() => useManageAssociations());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // First expand: fetches
    await act(async () => {
      result.current.toggleDependency('dep-1');
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockFetchAssociations).toHaveBeenCalledTimes(1);

    // Collapse
    act(() => {
      result.current.toggleDependency('dep-1');
    });

    // Re-expand: should not re-fetch (cached)
    await act(async () => {
      result.current.toggleDependency('dep-1');
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockFetchAssociations).toHaveBeenCalledTimes(1);
  });

  it('removes an association from the cache', async () => {
    const assocs = [
      makeAssociation(),
      makeAssociation({ id: 'assoc-2', linked_service_id: 'svc-3', linked_service: { ...makeAssociation().linked_service, id: 'svc-3', name: 'Service Gamma' } }),
    ];
    mockFetchServices.mockResolvedValue([makeService()]);
    mockFetchAssociations.mockResolvedValue(assocs);
    mockDeleteAssociation.mockResolvedValue(undefined);

    const { result } = renderHook(() => useManageAssociations());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      result.current.toggleDependency('dep-1');
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.associationCache.get('dep-1')).toHaveLength(2);

    await act(async () => {
      await result.current.removeAssociation('dep-1', 'svc-2');
    });

    expect(mockDeleteAssociation).toHaveBeenCalledWith('dep-1', 'svc-2');
    expect(result.current.associationCache.get('dep-1')).toHaveLength(1);
    expect(result.current.associationCache.get('dep-1')![0].linked_service_id).toBe('svc-3');
  });

  it('adds an association and refreshes cache', async () => {
    const newAssocs = [makeAssociation()];
    mockFetchServices.mockResolvedValue([makeService()]);
    mockFetchAssociations.mockResolvedValue(newAssocs);
    mockCreateAssociation.mockResolvedValue(makeAssociation() as never);

    const { result } = renderHook(() => useManageAssociations());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      await result.current.addAssociation('dep-1', {
        linked_service_id: 'svc-2',
        association_type: 'api_call',
      });
    });

    expect(mockCreateAssociation).toHaveBeenCalledWith('dep-1', {
      linked_service_id: 'svc-2',
      association_type: 'api_call',
    });
    expect(mockFetchAssociations).toHaveBeenCalledWith('dep-1');
  });

  it('filters services by search query on service name', async () => {
    const services = [
      makeService(),
      makeService({
        id: 'svc-2',
        name: 'Service Beta',
        dependencies: [
          {
            id: 'dep-3',
            service_id: 'svc-2',
            name: 'Kafka',
            canonical_name: null,
            description: null,
            impact: null,
            contact: null,
            contact_override: null,
            impact_override: null,
            effective_contact: null,
            effective_impact: null,
            healthy: 1,
            health_state: 0,
            health_code: null,
            latency_ms: 2,
            skipped: 0,
            last_checked: '2024-01-01T00:00:00Z',
            last_status_change: null,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
      }),
    ];
    mockFetchServices.mockResolvedValue(services);

    const { result } = renderHook(() => useManageAssociations());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.filteredServices).toHaveLength(2);

    act(() => {
      result.current.setSearchQuery('Beta');
    });

    expect(result.current.filteredServices).toHaveLength(1);
    expect(result.current.filteredServices[0].name).toBe('Service Beta');
  });

  it('filters services by search query on dependency name', async () => {
    mockFetchServices.mockResolvedValue([makeService()]);

    const { result } = renderHook(() => useManageAssociations());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    act(() => {
      result.current.setSearchQuery('Redis');
    });

    expect(result.current.filteredServices).toHaveLength(1);
    expect(result.current.filteredServices[0].dependencies).toHaveLength(1);
    expect(result.current.filteredServices[0].dependencies[0].name).toBe('Redis');
  });

  it('filters by linked status', async () => {
    mockFetchServices.mockResolvedValue([makeService()]);
    mockFetchAssociations
      .mockResolvedValueOnce([makeAssociation()]) // dep-1 has associations
      .mockResolvedValueOnce([]); // dep-2 has no associations

    const { result } = renderHook(() => useManageAssociations());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Load associations for both deps
    await act(async () => {
      result.current.toggleDependency('dep-1');
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      result.current.toggleDependency('dep-2');
      await new Promise((r) => setTimeout(r, 0));
    });

    // Filter linked
    act(() => {
      result.current.setStatusFilter('linked');
    });

    expect(result.current.filteredServices).toHaveLength(1);
    expect(result.current.filteredServices[0].dependencies).toHaveLength(1);
    expect(result.current.filteredServices[0].dependencies[0].id).toBe('dep-1');

    // Filter unlinked
    act(() => {
      result.current.setStatusFilter('unlinked');
    });

    expect(result.current.filteredServices).toHaveLength(1);
    expect(result.current.filteredServices[0].dependencies).toHaveLength(1);
    expect(result.current.filteredServices[0].dependencies[0].id).toBe('dep-2');
  });

  it('returns empty filtered services when no deps match search', async () => {
    mockFetchServices.mockResolvedValue([makeService()]);

    const { result } = renderHook(() => useManageAssociations());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    act(() => {
      result.current.setSearchQuery('NonExistent');
    });

    expect(result.current.filteredServices).toHaveLength(0);
  });

  it('includes unloaded deps when status filter is applied', async () => {
    mockFetchServices.mockResolvedValue([makeService()]);

    const { result } = renderHook(() => useManageAssociations());

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Set linked filter without loading any associations
    act(() => {
      result.current.setStatusFilter('linked');
    });

    // Both deps should still appear (not yet loaded, so included)
    expect(result.current.filteredServices).toHaveLength(1);
    expect(result.current.filteredServices[0].dependencies).toHaveLength(2);
  });
});
