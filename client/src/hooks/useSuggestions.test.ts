import { renderHook, act } from '@testing-library/react';
import { useSuggestions } from './useSuggestions';

jest.mock('../api/associations');

import {
  fetchSuggestions,
  acceptSuggestion,
  dismissSuggestion,
} from './../api/associations';

const mockFetchSuggestions = fetchSuggestions as jest.MockedFunction<typeof fetchSuggestions>;
const mockAccept = acceptSuggestion as jest.MockedFunction<typeof acceptSuggestion>;
const mockDismiss = dismissSuggestion as jest.MockedFunction<typeof dismissSuggestion>;

function makeSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    dependency_id: 'd1',
    linked_service_id: 'ls1',
    association_type: 'api_call',
    is_auto_suggested: 1,
    confidence_score: 0.85,
    is_dismissed: 0,
    created_at: '2025-01-01',
    dependency_name: 'dep-1',
    service_name: 'Service A',
    linked_service_name: 'Service B',
    ...overrides,
  };
}

beforeEach(() => {
  mockFetchSuggestions.mockReset();
  mockAccept.mockReset();
  mockDismiss.mockReset();
});

describe('useSuggestions', () => {
  it('loads suggestions', async () => {
    const data = [makeSuggestion()];
    mockFetchSuggestions.mockResolvedValue(data as never[]);

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.loadSuggestions();
    });

    expect(result.current.suggestions).toHaveLength(1);
    expect(result.current.isLoading).toBe(false);
  });

  it('accepts a suggestion and removes it', async () => {
    mockFetchSuggestions.mockResolvedValue([makeSuggestion()] as never[]);
    mockAccept.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.loadSuggestions();
    });

    await act(async () => {
      await result.current.accept('s1');
    });

    expect(mockAccept).toHaveBeenCalledWith('s1');
    expect(result.current.suggestions).toHaveLength(0);
  });

  it('dismisses a suggestion and removes it', async () => {
    mockFetchSuggestions.mockResolvedValue([makeSuggestion()] as never[]);
    mockDismiss.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.loadSuggestions();
    });

    await act(async () => {
      await result.current.dismiss('s1');
    });

    expect(mockDismiss).toHaveBeenCalledWith('s1');
    expect(result.current.suggestions).toHaveLength(0);
  });

  it('filters by service name', async () => {
    mockFetchSuggestions.mockResolvedValue([
      makeSuggestion({ id: 's1', service_name: 'Service A' }),
      makeSuggestion({ id: 's2', service_name: 'Service B' }),
    ] as never[]);

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.loadSuggestions();
    });

    act(() => {
      result.current.setServiceFilter('Service A');
    });

    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0].id).toBe('s1');
  });

  it('handles selection toggle, selectAll, clearSelection', async () => {
    mockFetchSuggestions.mockResolvedValue([
      makeSuggestion({ id: 's1' }),
      makeSuggestion({ id: 's2' }),
    ] as never[]);

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.loadSuggestions();
    });

    act(() => {
      result.current.toggleSelected('s1');
    });
    expect(result.current.selectedIds.has('s1')).toBe(true);

    act(() => {
      result.current.selectAll();
    });
    expect(result.current.selectedIds.size).toBe(2);

    act(() => {
      result.current.clearSelection();
    });
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('bulk accepts selected suggestions', async () => {
    mockFetchSuggestions.mockResolvedValue([
      makeSuggestion({ id: 's1' }),
      makeSuggestion({ id: 's2' }),
    ] as never[]);
    mockAccept.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.loadSuggestions();
    });

    act(() => {
      result.current.selectAll();
    });

    await act(async () => {
      await result.current.bulkAccept();
    });

    expect(mockAccept).toHaveBeenCalledTimes(2);
    expect(result.current.suggestions).toHaveLength(0);
  });

  it('filters by team name (linked_service_name)', async () => {
    mockFetchSuggestions.mockResolvedValue([
      makeSuggestion({ id: 's1', linked_service_name: 'Team A' }),
      makeSuggestion({ id: 's2', linked_service_name: 'Team B' }),
    ] as never[]);

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.loadSuggestions();
    });

    act(() => {
      result.current.setTeamFilter('Team A');
    });

    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0].id).toBe('s1');
  });

  it('handles loadSuggestions error', async () => {
    mockFetchSuggestions.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.loadSuggestions();
    });

    expect(result.current.error).toBe('Network error');
  });

  it('handles non-Error exception in loadSuggestions', async () => {
    mockFetchSuggestions.mockRejectedValue('String error');

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.loadSuggestions();
    });

    expect(result.current.error).toBe('Failed to load suggestions');
  });

  it('handles accept error', async () => {
    mockFetchSuggestions.mockResolvedValue([makeSuggestion()] as never[]);
    mockAccept.mockRejectedValue(new Error('Accept failed'));

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.loadSuggestions();
    });

    await act(async () => {
      await result.current.accept('s1');
    });

    expect(result.current.error).toBe('Accept failed');
  });

  it('handles non-Error exception in accept', async () => {
    mockFetchSuggestions.mockResolvedValue([makeSuggestion()] as never[]);
    mockAccept.mockRejectedValue('String error');

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.loadSuggestions();
    });

    await act(async () => {
      await result.current.accept('s1');
    });

    expect(result.current.error).toBe('Failed to accept suggestion');
  });

  it('handles dismiss error', async () => {
    mockFetchSuggestions.mockResolvedValue([makeSuggestion()] as never[]);
    mockDismiss.mockRejectedValue(new Error('Dismiss failed'));

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.loadSuggestions();
    });

    await act(async () => {
      await result.current.dismiss('s1');
    });

    expect(result.current.error).toBe('Dismiss failed');
  });

  it('handles non-Error exception in dismiss', async () => {
    mockFetchSuggestions.mockResolvedValue([makeSuggestion()] as never[]);
    mockDismiss.mockRejectedValue('String error');

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.loadSuggestions();
    });

    await act(async () => {
      await result.current.dismiss('s1');
    });

    expect(result.current.error).toBe('Failed to dismiss suggestion');
  });

  it('handles bulkAccept error', async () => {
    mockFetchSuggestions.mockResolvedValue([makeSuggestion()] as never[]);
    mockAccept.mockRejectedValue(new Error('Bulk accept failed'));

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.loadSuggestions();
    });

    act(() => {
      result.current.selectAll();
    });

    await act(async () => {
      await result.current.bulkAccept();
    });

    expect(result.current.error).toBe('Bulk accept failed');
  });

  it('handles non-Error exception in bulkAccept', async () => {
    mockFetchSuggestions.mockResolvedValue([makeSuggestion()] as never[]);
    mockAccept.mockRejectedValue('String error');

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.loadSuggestions();
    });

    act(() => {
      result.current.selectAll();
    });

    await act(async () => {
      await result.current.bulkAccept();
    });

    expect(result.current.error).toBe('Failed to accept suggestions');
  });

  it('bulk dismisses selected suggestions', async () => {
    mockFetchSuggestions.mockResolvedValue([
      makeSuggestion({ id: 's1' }),
      makeSuggestion({ id: 's2' }),
    ] as never[]);
    mockDismiss.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.loadSuggestions();
    });

    act(() => {
      result.current.selectAll();
    });

    await act(async () => {
      await result.current.bulkDismiss();
    });

    expect(mockDismiss).toHaveBeenCalledTimes(2);
    expect(result.current.suggestions).toHaveLength(0);
  });

  it('handles bulkDismiss error', async () => {
    mockFetchSuggestions.mockResolvedValue([makeSuggestion()] as never[]);
    mockDismiss.mockRejectedValue(new Error('Bulk dismiss failed'));

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.loadSuggestions();
    });

    act(() => {
      result.current.selectAll();
    });

    await act(async () => {
      await result.current.bulkDismiss();
    });

    expect(result.current.error).toBe('Bulk dismiss failed');
  });

  it('handles non-Error exception in bulkDismiss', async () => {
    mockFetchSuggestions.mockResolvedValue([makeSuggestion()] as never[]);
    mockDismiss.mockRejectedValue('String error');

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.loadSuggestions();
    });

    act(() => {
      result.current.selectAll();
    });

    await act(async () => {
      await result.current.bulkDismiss();
    });

    expect(result.current.error).toBe('Failed to dismiss suggestions');
  });

  it('removes from selectedIds when accepting a selected suggestion', async () => {
    mockFetchSuggestions.mockResolvedValue([makeSuggestion()] as never[]);
    mockAccept.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.loadSuggestions();
    });

    act(() => {
      result.current.toggleSelected('s1');
    });
    expect(result.current.selectedIds.has('s1')).toBe(true);

    await act(async () => {
      await result.current.accept('s1');
    });

    expect(result.current.selectedIds.has('s1')).toBe(false);
  });

  it('removes from selectedIds when dismissing a selected suggestion', async () => {
    mockFetchSuggestions.mockResolvedValue([makeSuggestion()] as never[]);
    mockDismiss.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.loadSuggestions();
    });

    act(() => {
      result.current.toggleSelected('s1');
    });
    expect(result.current.selectedIds.has('s1')).toBe(true);

    await act(async () => {
      await result.current.dismiss('s1');
    });

    expect(result.current.selectedIds.has('s1')).toBe(false);
  });

  it('toggles off a selected item', async () => {
    mockFetchSuggestions.mockResolvedValue([makeSuggestion()] as never[]);

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.loadSuggestions();
    });

    act(() => {
      result.current.toggleSelected('s1');
    });
    expect(result.current.selectedIds.has('s1')).toBe(true);

    act(() => {
      result.current.toggleSelected('s1');
    });
    expect(result.current.selectedIds.has('s1')).toBe(false);
  });
});
