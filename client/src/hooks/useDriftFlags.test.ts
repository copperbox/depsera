import { renderHook, act } from '@testing-library/react';
import { useDriftFlags } from './useDriftFlags';

jest.mock('../api/manifest');

import {
  getDriftFlags,
  acceptDrift,
  dismissDrift,
  reopenDrift,
  bulkAcceptDrifts,
  bulkDismissDrifts,
} from '../api/manifest';

const mockGetDriftFlags = getDriftFlags as jest.MockedFunction<typeof getDriftFlags>;
const mockAcceptDrift = acceptDrift as jest.MockedFunction<typeof acceptDrift>;
const mockDismissDrift = dismissDrift as jest.MockedFunction<typeof dismissDrift>;
const mockReopenDrift = reopenDrift as jest.MockedFunction<typeof reopenDrift>;
const mockBulkAccept = bulkAcceptDrifts as jest.MockedFunction<typeof bulkAcceptDrifts>;
const mockBulkDismiss = bulkDismissDrifts as jest.MockedFunction<typeof bulkDismissDrifts>;

function makeFlag(overrides: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    team_id: 't1',
    service_id: 's1',
    drift_type: 'field_change',
    field_name: 'name',
    manifest_value: 'New Name',
    current_value: 'Old Name',
    status: 'pending',
    first_detected_at: '2025-01-01',
    last_detected_at: '2025-01-01',
    resolved_at: null,
    resolved_by: null,
    sync_history_id: null,
    created_at: '2025-01-01',
    service_name: 'Service A',
    manifest_key: 'svc-a',
    resolved_by_name: null,
    ...overrides,
  };
}

const emptySummary = { pending_count: 0, dismissed_count: 0, field_change_pending: 0, service_removal_pending: 0 };

beforeEach(() => {
  mockGetDriftFlags.mockReset();
  mockAcceptDrift.mockReset();
  mockDismissDrift.mockReset();
  mockReopenDrift.mockReset();
  mockBulkAccept.mockReset();
  mockBulkDismiss.mockReset();
});

describe('useDriftFlags', () => {
  it('loads drift flags', async () => {
    const flags = [makeFlag()];
    const summary = { pending_count: 1, dismissed_count: 0, field_change_pending: 1, service_removal_pending: 0 };
    mockGetDriftFlags.mockResolvedValue({ flags, summary, total: 1 } as never);

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.loadFlags();
    });

    expect(result.current.flags).toHaveLength(1);
    expect(result.current.summary).toEqual(summary);
    expect(result.current.isLoading).toBe(false);
  });

  it('loads with pending status by default', async () => {
    mockGetDriftFlags.mockResolvedValue({ flags: [], summary: emptySummary, total: 0 } as never);

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.loadFlags();
    });

    expect(mockGetDriftFlags).toHaveBeenCalledWith('t1', { status: 'pending', limit: 250 });
  });

  it('handles load error', async () => {
    mockGetDriftFlags.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.loadFlags();
    });

    expect(result.current.error).toBe('Network error');
  });

  it('handles non-Error exception in load', async () => {
    mockGetDriftFlags.mockRejectedValue('String error');

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.loadFlags();
    });

    expect(result.current.error).toBe('Failed to load drift flags');
  });

  it('does nothing when teamId is undefined', async () => {
    const { result } = renderHook(() => useDriftFlags(undefined));

    await act(async () => {
      await result.current.loadFlags();
    });

    expect(mockGetDriftFlags).not.toHaveBeenCalled();
  });

  it('switches view and clears selection', async () => {
    mockGetDriftFlags.mockResolvedValue({ flags: [makeFlag()], summary: emptySummary, total: 1 } as never);

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.loadFlags();
    });

    act(() => {
      result.current.toggleSelected('d1');
    });
    expect(result.current.selectedIds.size).toBe(1);

    act(() => {
      result.current.setView('dismissed');
    });
    expect(result.current.view).toBe('dismissed');
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('filters by drift type', async () => {
    mockGetDriftFlags.mockResolvedValue({
      flags: [
        makeFlag({ id: 'd1', drift_type: 'field_change' }),
        makeFlag({ id: 'd2', drift_type: 'service_removal' }),
      ],
      summary: emptySummary,
      total: 2,
    } as never);

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.loadFlags();
    });

    act(() => {
      result.current.setTypeFilter('field_change');
    });

    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0].id).toBe('d1');
  });

  it('filters by service id', async () => {
    mockGetDriftFlags.mockResolvedValue({
      flags: [
        makeFlag({ id: 'd1', service_id: 's1' }),
        makeFlag({ id: 'd2', service_id: 's2' }),
      ],
      summary: emptySummary,
      total: 2,
    } as never);

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.loadFlags();
    });

    act(() => {
      result.current.setServiceFilter('s1');
    });

    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0].id).toBe('d1');
  });

  it('handles selection toggle, selectAll, clearSelection', async () => {
    mockGetDriftFlags.mockResolvedValue({
      flags: [makeFlag({ id: 'd1' }), makeFlag({ id: 'd2' })],
      summary: emptySummary,
      total: 2,
    } as never);

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.loadFlags();
    });

    act(() => {
      result.current.toggleSelected('d1');
    });
    expect(result.current.selectedIds.has('d1')).toBe(true);

    act(() => {
      result.current.toggleSelected('d1');
    });
    expect(result.current.selectedIds.has('d1')).toBe(false);

    act(() => {
      result.current.selectAll();
    });
    expect(result.current.selectedIds.size).toBe(2);

    act(() => {
      result.current.clearSelection();
    });
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('accepts a drift flag and reloads', async () => {
    mockGetDriftFlags.mockResolvedValue({ flags: [makeFlag()], summary: emptySummary, total: 1 } as never);
    mockAcceptDrift.mockResolvedValue(makeFlag({ status: 'accepted' }) as never);

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.loadFlags();
    });

    // On reload after accept, return empty (flag moved to accepted)
    mockGetDriftFlags.mockResolvedValue({ flags: [], summary: emptySummary, total: 0 } as never);

    await act(async () => {
      await result.current.accept('d1');
    });

    expect(mockAcceptDrift).toHaveBeenCalledWith('t1', 'd1');
    expect(mockGetDriftFlags).toHaveBeenCalledTimes(2);
  });

  it('handles accept error', async () => {
    mockAcceptDrift.mockRejectedValue(new Error('SSRF blocked'));

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.accept('d1');
    });

    expect(result.current.error).toBe('SSRF blocked');
  });

  it('handles non-Error exception in accept', async () => {
    mockAcceptDrift.mockRejectedValue('String error');

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.accept('d1');
    });

    expect(result.current.error).toBe('Failed to accept drift flag');
  });

  it('dismisses a drift flag and reloads', async () => {
    mockGetDriftFlags.mockResolvedValue({ flags: [makeFlag()], summary: emptySummary, total: 1 } as never);
    mockDismissDrift.mockResolvedValue(makeFlag({ status: 'dismissed' }) as never);

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.loadFlags();
    });

    mockGetDriftFlags.mockResolvedValue({ flags: [], summary: emptySummary, total: 0 } as never);

    await act(async () => {
      await result.current.dismiss('d1');
    });

    expect(mockDismissDrift).toHaveBeenCalledWith('t1', 'd1');
  });

  it('handles dismiss error', async () => {
    mockDismissDrift.mockRejectedValue(new Error('Dismiss failed'));

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.dismiss('d1');
    });

    expect(result.current.error).toBe('Dismiss failed');
  });

  it('handles non-Error exception in dismiss', async () => {
    mockDismissDrift.mockRejectedValue('String error');

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.dismiss('d1');
    });

    expect(result.current.error).toBe('Failed to dismiss drift flag');
  });

  it('reopens a drift flag and reloads', async () => {
    mockGetDriftFlags.mockResolvedValue({ flags: [], summary: emptySummary, total: 0 } as never);
    mockReopenDrift.mockResolvedValue(makeFlag({ status: 'pending' }) as never);

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.reopen('d1');
    });

    expect(mockReopenDrift).toHaveBeenCalledWith('t1', 'd1');
  });

  it('handles reopen error', async () => {
    mockReopenDrift.mockRejectedValue(new Error('Only dismissed flags can be reopened'));

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.reopen('d1');
    });

    expect(result.current.error).toBe('Only dismissed flags can be reopened');
  });

  it('handles non-Error exception in reopen', async () => {
    mockReopenDrift.mockRejectedValue('String error');

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.reopen('d1');
    });

    expect(result.current.error).toBe('Failed to reopen drift flag');
  });

  it('bulk accepts and clears selection', async () => {
    mockGetDriftFlags.mockResolvedValue({
      flags: [makeFlag({ id: 'd1' }), makeFlag({ id: 'd2' })],
      summary: emptySummary,
      total: 2,
    } as never);
    mockBulkAccept.mockResolvedValue({ succeeded: 2, failed: 0, errors: [] } as never);

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.loadFlags();
    });

    act(() => {
      result.current.selectAll();
    });
    expect(result.current.selectedIds.size).toBe(2);

    mockGetDriftFlags.mockResolvedValue({ flags: [], summary: emptySummary, total: 0 } as never);

    await act(async () => {
      await result.current.bulkAccept();
    });

    expect(mockBulkAccept).toHaveBeenCalledWith('t1', ['d1', 'd2']);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('does nothing for bulk accept with empty selection', async () => {
    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.bulkAccept();
    });

    expect(mockBulkAccept).not.toHaveBeenCalled();
  });

  it('handles bulk accept error', async () => {
    mockGetDriftFlags.mockResolvedValue({ flags: [makeFlag()], summary: emptySummary, total: 1 } as never);
    mockBulkAccept.mockRejectedValue(new Error('Bulk accept failed'));

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.loadFlags();
    });

    act(() => {
      result.current.selectAll();
    });

    await act(async () => {
      await result.current.bulkAccept();
    });

    expect(result.current.error).toBe('Bulk accept failed');
  });

  it('handles non-Error exception in bulk accept', async () => {
    mockGetDriftFlags.mockResolvedValue({ flags: [makeFlag()], summary: emptySummary, total: 1 } as never);
    mockBulkAccept.mockRejectedValue('String error');

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.loadFlags();
    });

    act(() => {
      result.current.selectAll();
    });

    await act(async () => {
      await result.current.bulkAccept();
    });

    expect(result.current.error).toBe('Failed to bulk accept drift flags');
  });

  it('bulk dismisses and clears selection', async () => {
    mockGetDriftFlags.mockResolvedValue({
      flags: [makeFlag({ id: 'd1' }), makeFlag({ id: 'd2' })],
      summary: emptySummary,
      total: 2,
    } as never);
    mockBulkDismiss.mockResolvedValue({ succeeded: 2, failed: 0, errors: [] } as never);

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.loadFlags();
    });

    act(() => {
      result.current.selectAll();
    });

    mockGetDriftFlags.mockResolvedValue({ flags: [], summary: emptySummary, total: 0 } as never);

    await act(async () => {
      await result.current.bulkDismiss();
    });

    expect(mockBulkDismiss).toHaveBeenCalledWith('t1', ['d1', 'd2']);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('handles bulk dismiss error', async () => {
    mockGetDriftFlags.mockResolvedValue({ flags: [makeFlag()], summary: emptySummary, total: 1 } as never);
    mockBulkDismiss.mockRejectedValue(new Error('Bulk dismiss failed'));

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.loadFlags();
    });

    act(() => {
      result.current.selectAll();
    });

    await act(async () => {
      await result.current.bulkDismiss();
    });

    expect(result.current.error).toBe('Bulk dismiss failed');
  });

  it('handles non-Error exception in bulk dismiss', async () => {
    mockGetDriftFlags.mockResolvedValue({ flags: [makeFlag()], summary: emptySummary, total: 1 } as never);
    mockBulkDismiss.mockRejectedValue('String error');

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.loadFlags();
    });

    act(() => {
      result.current.selectAll();
    });

    await act(async () => {
      await result.current.bulkDismiss();
    });

    expect(result.current.error).toBe('Failed to bulk dismiss drift flags');
  });

  it('clears error', async () => {
    mockGetDriftFlags.mockRejectedValue(new Error('Error'));

    const { result } = renderHook(() => useDriftFlags('t1'));

    await act(async () => {
      await result.current.loadFlags();
    });
    expect(result.current.error).toBe('Error');

    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeNull();
  });
});
