import { renderHook, act } from '@testing-library/react';
import { useTeamServiceHealth } from './useTeamServiceHealth';

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
  {
    id: 's1',
    name: 'Service A',
    health: { status: 'healthy', healthy_reports: 5, warning_reports: 0, critical_reports: 0, total_reports: 5, dependent_count: 2 },
    dependencies: [{ id: 'd1' }, { id: 'd2' }],
  },
  {
    id: 's2',
    name: 'Service B',
    health: { status: 'warning', healthy_reports: 3, warning_reports: 2, critical_reports: 0, total_reports: 5, dependent_count: 1 },
    dependencies: [{ id: 'd3' }],
  },
  {
    id: 's3',
    name: 'Service C',
    health: { status: 'critical', healthy_reports: 1, warning_reports: 1, critical_reports: 3, total_reports: 5, dependent_count: 0 },
    dependencies: [],
  },
  {
    id: 's4',
    name: 'Service D',
    health: { status: 'unknown', healthy_reports: 0, warning_reports: 0, critical_reports: 0, total_reports: 0, dependent_count: 0 },
    dependencies: [{ id: 'd4' }, { id: 'd5' }, { id: 'd6' }],
  },
];

beforeEach(() => {
  mockFetch.mockReset();
});

describe('useTeamServiceHealth', () => {
  it('starts in loading state', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useTeamServiceHealth('t1'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.stats).toEqual({
      total: 0,
      healthy: 0,
      warning: 0,
      critical: 0,
      unknown: 0,
      totalDependencies: 0,
    });
  });

  it('computes health stats and dependency count after loading', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockServices));

    const { result } = renderHook(() => useTeamServiceHealth('t1'));

    await act(async () => {
      await result.current.reload();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/services?team_id=t1'),
      expect.any(Object)
    );
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.stats).toEqual({
      total: 4,
      healthy: 1,
      warning: 1,
      critical: 1,
      unknown: 1,
      totalDependencies: 6,
    });
  });

  it('handles fetch errors', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'Not found' }, 404));

    const { result } = renderHook(() => useTeamServiceHealth('t1'));

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeTruthy();
  });

  it('handles network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    const { result } = renderHook(() => useTeamServiceHealth('t1'));

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe('Network failure');
  });

  it('handles services with no dependencies array', async () => {
    const servicesNoDeps = [
      {
        id: 's1',
        name: 'Service A',
        health: { status: 'healthy', healthy_reports: 5, warning_reports: 0, critical_reports: 0, total_reports: 5, dependent_count: 0 },
      },
    ];
    mockFetch.mockResolvedValueOnce(jsonResponse(servicesNoDeps));

    const { result } = renderHook(() => useTeamServiceHealth('t1'));

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.stats.totalDependencies).toBe(0);
  });

  it('reloads data on subsequent calls', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockServices));

    const { result } = renderHook(() => useTeamServiceHealth('t1'));

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.stats.total).toBe(4);

    const updatedServices = [mockServices[0]];
    mockFetch.mockResolvedValueOnce(jsonResponse(updatedServices));

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.stats.total).toBe(1);
    expect(result.current.stats.healthy).toBe(1);
  });
});
