import { renderHook, act } from '@testing-library/react';
import { useServicesList } from './useServicesList';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockServices = [
  { id: 's1', name: 'Alpha Service', team_id: 't1', health: { status: 'healthy' } },
  { id: 's2', name: 'Beta Service', team_id: 't1', health: { status: 'warning' } },
  { id: 's3', name: 'Gamma Service', team_id: 't2', health: { status: 'critical' } },
];

const mockTeams = [
  { id: 't1', name: 'Team A', service_count: 2 },
  { id: 't2', name: 'Team B', service_count: 1 },
];

beforeEach(() => {
  mockFetch.mockReset();
});

describe('useServicesList', () => {
  it('starts in loading state', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useServicesList());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.services).toEqual([]);
    expect(result.current.teams).toEqual([]);
  });

  it('loads services and teams', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    const { result } = renderHook(() => useServicesList());

    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.services).toEqual(mockServices);
    expect(result.current.teams).toEqual(mockTeams);
    expect(result.current.filteredServices).toEqual(mockServices);
  });

  it('handles load error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useServicesList());

    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.error).toBe('Network error');
  });

  it('handles non-Error exception', async () => {
    mockFetch.mockRejectedValueOnce('String error');

    const { result } = renderHook(() => useServicesList());

    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.error).toBe('Failed to load services');
  });

  it('filters by search query', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    const { result } = renderHook(() => useServicesList());

    await act(async () => {
      await result.current.loadData();
    });

    act(() => {
      result.current.setSearchQuery('alpha');
    });

    expect(result.current.filteredServices).toHaveLength(1);
    expect(result.current.filteredServices[0].name).toBe('Alpha Service');
  });

  it('filters by search query case-insensitively', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    const { result } = renderHook(() => useServicesList());

    await act(async () => {
      await result.current.loadData();
    });

    act(() => {
      result.current.setSearchQuery('BETA');
    });

    expect(result.current.filteredServices).toHaveLength(1);
    expect(result.current.filteredServices[0].name).toBe('Beta Service');
  });

  it('filters by team', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    const { result } = renderHook(() => useServicesList());

    await act(async () => {
      await result.current.loadData();
    });

    act(() => {
      result.current.setTeamFilter('t2');
    });

    expect(result.current.filteredServices).toHaveLength(1);
    expect(result.current.filteredServices[0].name).toBe('Gamma Service');
  });

  it('combines search and team filters', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    const { result } = renderHook(() => useServicesList());

    await act(async () => {
      await result.current.loadData();
    });

    act(() => {
      result.current.setSearchQuery('service');
      result.current.setTeamFilter('t1');
    });

    expect(result.current.filteredServices).toHaveLength(2);
    expect(result.current.filteredServices.every((s) => s.team_id === 't1')).toBe(true);
  });

  it('supports background refresh', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams))
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    const { result } = renderHook(() => useServicesList());

    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.isLoading).toBe(false);

    // Background refresh - verify it completes without setting isLoading
    await act(async () => {
      await result.current.loadData(true);
    });

    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });
});
