import { renderHook, act } from '@testing-library/react';
import { useSyncHistory } from './useSyncHistory';

jest.mock('../api/manifest');

import { getSyncHistory } from '../api/manifest';

const mockGetSyncHistory = getSyncHistory as jest.MockedFunction<typeof getSyncHistory>;

function makeHistoryEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'h1',
    team_id: 't1',
    trigger_type: 'manual',
    triggered_by: 'u1',
    manifest_url: 'https://example.com/manifest.json',
    status: 'success',
    summary: null,
    errors: null,
    warnings: null,
    duration_ms: 500,
    created_at: '2025-01-01',
    ...overrides,
  };
}

beforeEach(() => {
  mockGetSyncHistory.mockReset();
});

describe('useSyncHistory', () => {
  it('loads history', async () => {
    const history = [makeHistoryEntry()];
    mockGetSyncHistory.mockResolvedValue({ history, total: 1 } as never);

    const { result } = renderHook(() => useSyncHistory('t1'));

    await act(async () => {
      await result.current.loadHistory();
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.total).toBe(1);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasMore).toBe(false);
  });

  it('requests with limit 20 and offset 0', async () => {
    mockGetSyncHistory.mockResolvedValue({ history: [], total: 0 } as never);

    const { result } = renderHook(() => useSyncHistory('t1'));

    await act(async () => {
      await result.current.loadHistory();
    });

    expect(mockGetSyncHistory).toHaveBeenCalledWith('t1', { limit: 20, offset: 0 });
  });

  it('handles load error', async () => {
    mockGetSyncHistory.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSyncHistory('t1'));

    await act(async () => {
      await result.current.loadHistory();
    });

    expect(result.current.error).toBe('Network error');
  });

  it('handles non-Error exception in load', async () => {
    mockGetSyncHistory.mockRejectedValue('String error');

    const { result } = renderHook(() => useSyncHistory('t1'));

    await act(async () => {
      await result.current.loadHistory();
    });

    expect(result.current.error).toBe('Failed to load sync history');
  });

  it('does nothing when teamId is undefined', async () => {
    const { result } = renderHook(() => useSyncHistory(undefined));

    await act(async () => {
      await result.current.loadHistory();
    });

    expect(mockGetSyncHistory).not.toHaveBeenCalled();
  });

  it('calculates hasMore correctly', async () => {
    // 5 total but only 5 loaded = no more
    const history = Array.from({ length: 5 }, (_, i) => makeHistoryEntry({ id: `h${i}` }));
    mockGetSyncHistory.mockResolvedValue({ history, total: 5 } as never);

    const { result } = renderHook(() => useSyncHistory('t1'));

    await act(async () => {
      await result.current.loadHistory();
    });

    expect(result.current.hasMore).toBe(false);
  });

  it('reports hasMore when more entries exist', async () => {
    const history = Array.from({ length: 20 }, (_, i) => makeHistoryEntry({ id: `h${i}` }));
    mockGetSyncHistory.mockResolvedValue({ history, total: 50 } as never);

    const { result } = renderHook(() => useSyncHistory('t1'));

    await act(async () => {
      await result.current.loadHistory();
    });

    expect(result.current.hasMore).toBe(true);
  });

  it('loads more entries and appends', async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => makeHistoryEntry({ id: `h${i}` }));
    mockGetSyncHistory.mockResolvedValue({ history: page1, total: 30 } as never);

    const { result } = renderHook(() => useSyncHistory('t1'));

    await act(async () => {
      await result.current.loadHistory();
    });

    expect(result.current.history).toHaveLength(20);
    expect(result.current.hasMore).toBe(true);

    const page2 = Array.from({ length: 10 }, (_, i) => makeHistoryEntry({ id: `h${20 + i}` }));
    mockGetSyncHistory.mockResolvedValue({ history: page2, total: 30 } as never);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.history).toHaveLength(30);
    expect(result.current.hasMore).toBe(false);
    expect(mockGetSyncHistory).toHaveBeenLastCalledWith('t1', { limit: 20, offset: 20 });
  });

  it('does not load more when no more entries', async () => {
    const history = [makeHistoryEntry()];
    mockGetSyncHistory.mockResolvedValue({ history, total: 1 } as never);

    const { result } = renderHook(() => useSyncHistory('t1'));

    await act(async () => {
      await result.current.loadHistory();
    });

    mockGetSyncHistory.mockReset();

    await act(async () => {
      await result.current.loadMore();
    });

    expect(mockGetSyncHistory).not.toHaveBeenCalled();
  });

  it('handles loadMore error', async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => makeHistoryEntry({ id: `h${i}` }));
    mockGetSyncHistory.mockResolvedValue({ history: page1, total: 30 } as never);

    const { result } = renderHook(() => useSyncHistory('t1'));

    await act(async () => {
      await result.current.loadHistory();
    });

    mockGetSyncHistory.mockRejectedValue(new Error('Load more failed'));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.error).toBe('Load more failed');
    // Original data preserved
    expect(result.current.history).toHaveLength(20);
  });

  it('handles non-Error exception in loadMore', async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => makeHistoryEntry({ id: `h${i}` }));
    mockGetSyncHistory.mockResolvedValue({ history: page1, total: 30 } as never);

    const { result } = renderHook(() => useSyncHistory('t1'));

    await act(async () => {
      await result.current.loadHistory();
    });

    mockGetSyncHistory.mockRejectedValue('String error');

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.error).toBe('Failed to load more sync history');
  });

  it('resets offset when loadHistory is called again', async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => makeHistoryEntry({ id: `h${i}` }));
    mockGetSyncHistory.mockResolvedValue({ history: page1, total: 30 } as never);

    const { result } = renderHook(() => useSyncHistory('t1'));

    await act(async () => {
      await result.current.loadHistory();
    });

    // Load more to advance offset
    const page2 = Array.from({ length: 10 }, (_, i) => makeHistoryEntry({ id: `h${20 + i}` }));
    mockGetSyncHistory.mockResolvedValue({ history: page2, total: 30 } as never);

    await act(async () => {
      await result.current.loadMore();
    });

    // Now reload from beginning
    const freshPage = [makeHistoryEntry({ id: 'fresh1' })];
    mockGetSyncHistory.mockResolvedValue({ history: freshPage, total: 1 } as never);

    await act(async () => {
      await result.current.loadHistory();
    });

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].id).toBe('fresh1');
    expect(mockGetSyncHistory).toHaveBeenLastCalledWith('t1', { limit: 20, offset: 0 });
  });

  it('clears error', async () => {
    mockGetSyncHistory.mockRejectedValue(new Error('Error'));

    const { result } = renderHook(() => useSyncHistory('t1'));

    await act(async () => {
      await result.current.loadHistory();
    });
    expect(result.current.error).toBe('Error');

    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeNull();
  });
});
