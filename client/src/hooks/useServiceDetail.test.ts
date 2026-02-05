import { renderHook, act } from '@testing-library/react';
import { useServiceDetail } from './useServiceDetail';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockService = {
  id: 's1',
  name: 'Test Service',
  team_id: 't1',
  health: { status: 'healthy' },
  dependencies: [],
};

const mockTeams = [
  { id: 't1', name: 'Team A', service_count: 1 },
];

beforeEach(() => {
  mockFetch.mockReset();
  mockNavigate.mockReset();
});

describe('useServiceDetail', () => {
  it('starts in loading state', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useServiceDetail('s1'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.service).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('does not load when id is undefined', async () => {
    const { result } = renderHook(() => useServiceDetail(undefined));

    await act(async () => {
      await result.current.loadService();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('loads service and teams', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockService))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    const { result } = renderHook(() => useServiceDetail('s1'));

    await act(async () => {
      await result.current.loadService();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.service).toEqual(mockService);
    expect(result.current.teams).toEqual(mockTeams);
    expect(result.current.error).toBeNull();
  });

  it('handles load error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useServiceDetail('s1'));

    await act(async () => {
      await result.current.loadService();
    });

    expect(result.current.error).toBe('Network error');
  });

  it('handles non-Error exception on load', async () => {
    mockFetch.mockRejectedValueOnce('String error');

    const { result } = renderHook(() => useServiceDetail('s1'));

    await act(async () => {
      await result.current.loadService();
    });

    expect(result.current.error).toBe('Failed to load service');
  });

  it('deletes service and navigates', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204, json: () => Promise.resolve({}) });

    const { result } = renderHook(() => useServiceDetail('s1'));

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/services/s1', {
      method: 'DELETE',
      credentials: 'include',
    });
    expect(mockNavigate).toHaveBeenCalledWith('/services');
  });

  it('does not delete when id is undefined', async () => {
    const { result } = renderHook(() => useServiceDetail(undefined));

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles delete error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Delete failed' }),
    });

    const { result } = renderHook(() => useServiceDetail('s1'));

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(result.current.error).toBe('Delete failed');
    expect(result.current.isDeleting).toBe(false);
  });

  it('handles non-Error delete exception', async () => {
    mockFetch.mockRejectedValueOnce('String error');

    const { result } = renderHook(() => useServiceDetail('s1'));

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(result.current.error).toBe('Failed to delete service');
  });

  it('polls service for updates', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockService));

    const { result } = renderHook(() => useServiceDetail('s1'));

    await act(async () => {
      await result.current.handlePoll();
    });

    expect(result.current.isPolling).toBe(false);
    expect(result.current.service).toEqual(mockService);
  });

  it('does not poll when id is undefined', async () => {
    const { result } = renderHook(() => useServiceDetail(undefined));

    await act(async () => {
      await result.current.handlePoll();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles poll error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Poll failed'));

    const { result } = renderHook(() => useServiceDetail('s1'));

    await act(async () => {
      await result.current.handlePoll();
    });

    expect(result.current.error).toBe('Poll failed');
  });

  it('handles non-Error poll exception', async () => {
    mockFetch.mockRejectedValueOnce('String error');

    const { result } = renderHook(() => useServiceDetail('s1'));

    await act(async () => {
      await result.current.handlePoll();
    });

    expect(result.current.error).toBe('Failed to refresh service');
  });

  it('allows setting error externally', () => {
    const { result } = renderHook(() => useServiceDetail('s1'));

    act(() => {
      result.current.setError('Custom error');
    });

    expect(result.current.error).toBe('Custom error');

    act(() => {
      result.current.setError(null);
    });

    expect(result.current.error).toBeNull();
  });
});
