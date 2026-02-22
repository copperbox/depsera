import { renderHook, act } from '@testing-library/react';
import { useAlertHistory } from './useAlertHistory';

jest.mock('../api/alerts');
import { fetchAlertHistory } from '../api/alerts';

const mockFetchHistory = fetchAlertHistory as jest.MockedFunction<typeof fetchAlertHistory>;

const mockEntry = {
  id: 'h1',
  alert_channel_id: 'ch1',
  service_id: 's1',
  dependency_id: 'd1',
  event_type: 'status_change',
  payload: JSON.stringify({ serviceName: 'API', dependencyName: 'postgres' }),
  sent_at: '2024-01-01T12:00:00Z',
  status: 'sent' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useAlertHistory', () => {
  it('starts with empty state', () => {
    const { result } = renderHook(() => useAlertHistory('t1'));

    expect(result.current.entries).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.statusFilter).toBe('');
  });

  it('loads history successfully', async () => {
    mockFetchHistory.mockResolvedValue({
      entries: [mockEntry],
      limit: 50,
      offset: 0,
    });

    const { result } = renderHook(() => useAlertHistory('t1'));

    await act(async () => {
      await result.current.loadHistory();
    });

    expect(mockFetchHistory).toHaveBeenCalledWith('t1', {
      limit: 50,
      status: undefined,
    });
    expect(result.current.entries).toEqual([mockEntry]);
    expect(result.current.isLoading).toBe(false);
  });

  it('handles load error', async () => {
    mockFetchHistory.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAlertHistory('t1'));

    await act(async () => {
      await result.current.loadHistory();
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.entries).toEqual([]);
  });

  it('handles non-Error load failure', async () => {
    mockFetchHistory.mockRejectedValue('unexpected');

    const { result } = renderHook(() => useAlertHistory('t1'));

    await act(async () => {
      await result.current.loadHistory();
    });

    expect(result.current.error).toBe('Failed to load alert history');
  });

  it('does not load when teamId is undefined', async () => {
    const { result } = renderHook(() => useAlertHistory(undefined));

    await act(async () => {
      await result.current.loadHistory();
    });

    expect(mockFetchHistory).not.toHaveBeenCalled();
  });

  it('updates status filter', () => {
    const { result } = renderHook(() => useAlertHistory('t1'));

    act(() => {
      result.current.setStatusFilter('failed');
    });

    expect(result.current.statusFilter).toBe('failed');
  });

  it('passes status filter to fetch', async () => {
    mockFetchHistory.mockResolvedValue({
      entries: [],
      limit: 50,
      offset: 0,
    });

    const { result } = renderHook(() => useAlertHistory('t1'));

    act(() => {
      result.current.setStatusFilter('sent');
    });

    await act(async () => {
      await result.current.loadHistory();
    });

    expect(mockFetchHistory).toHaveBeenCalledWith('t1', {
      limit: 50,
      status: 'sent',
    });
  });

  it('clears error', async () => {
    mockFetchHistory.mockRejectedValue(new Error('err'));

    const { result } = renderHook(() => useAlertHistory('t1'));

    await act(async () => {
      await result.current.loadHistory();
    });

    expect(result.current.error).toBe('err');

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });
});
