import { renderHook, act, waitFor } from '@testing-library/react';
import { useDashboard } from './useDashboard';

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
    team_id: 't1',
    health: { status: 'healthy', last_report: '2024-01-15T10:00:00Z' },
  },
  {
    id: 's2',
    name: 'Service B',
    team_id: 't1',
    health: { status: 'warning', last_report: '2024-01-15T09:00:00Z' },
  },
  {
    id: 's3',
    name: 'Service C',
    team_id: 't2',
    health: { status: 'critical', last_report: '2024-01-15T08:00:00Z' },
  },
  {
    id: 's4',
    name: 'Service D',
    team_id: 't2',
    health: { status: 'healthy', last_report: null },
  },
];

const mockTeams = [
  { id: 't1', name: 'Team A', service_count: 2, member_count: 3 },
  { id: 't2', name: 'Team B', service_count: 2, member_count: 2 },
  { id: 't3', name: 'Team C', service_count: 0, member_count: 1 },
];

beforeEach(() => {
  mockFetch.mockReset();
});

describe('useDashboard', () => {
  it('starts in loading state', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useDashboard());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.services).toEqual([]);
    expect(result.current.teams).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('loads services and teams data', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    const { result } = renderHook(() => useDashboard());

    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.services).toEqual(mockServices);
    expect(result.current.teams).toEqual(mockTeams);
    expect(result.current.error).toBeNull();
  });

  it('handles load error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useDashboard());

    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe('Network error');
  });

  it('handles non-Error exception', async () => {
    mockFetch.mockRejectedValueOnce('String error');

    const { result } = renderHook(() => useDashboard());

    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.error).toBe('Failed to load dashboard data');
  });

  it('calculates stats correctly', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    const { result } = renderHook(() => useDashboard());

    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.stats).toEqual({
      total: 4,
      healthy: 2,
      warning: 1,
      critical: 1,
    });
  });

  it('returns services with issues sorted by severity', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    const { result } = renderHook(() => useDashboard());

    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.servicesWithIssues).toHaveLength(2);
    expect(result.current.servicesWithIssues[0].health.status).toBe('critical');
    expect(result.current.servicesWithIssues[1].health.status).toBe('warning');
  });

  it('returns recent activity sorted by last_report', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    const { result } = renderHook(() => useDashboard());

    await act(async () => {
      await result.current.loadData();
    });

    // Only services with last_report, sorted descending
    expect(result.current.recentActivity).toHaveLength(3);
    expect(result.current.recentActivity[0].id).toBe('s1'); // Most recent
    expect(result.current.recentActivity[1].id).toBe('s2');
    expect(result.current.recentActivity[2].id).toBe('s3');
  });

  it('calculates team health summary', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    const { result } = renderHook(() => useDashboard());

    await act(async () => {
      await result.current.loadData();
    });

    // Only teams with services (t1 and t2)
    expect(result.current.teamHealthSummary).toHaveLength(2);

    const team1Summary = result.current.teamHealthSummary.find((t) => t.team.id === 't1');
    expect(team1Summary).toEqual({
      team: mockTeams[0],
      healthy: 1,
      warning: 1,
      critical: 0,
      total: 2,
    });

    const team2Summary = result.current.teamHealthSummary.find((t) => t.team.id === 't2');
    expect(team2Summary).toEqual({
      team: mockTeams[1],
      healthy: 1,
      warning: 0,
      critical: 1,
      total: 2,
    });
  });

  it('supports background refresh', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams))
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    const { result } = renderHook(() => useDashboard());

    // Initial load
    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.isLoading).toBe(false);

    // Background refresh - just verify it completes without setting isLoading
    await act(async () => {
      await result.current.loadData(true);
    });

    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });
});
