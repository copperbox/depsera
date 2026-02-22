import { renderHook, act } from '@testing-library/react';
import { useAlertRules } from './useAlertRules';

jest.mock('../api/alerts');
import { fetchAlertRules, updateAlertRules } from '../api/alerts';

const mockFetchRules = fetchAlertRules as jest.MockedFunction<typeof fetchAlertRules>;
const mockUpdateRules = updateAlertRules as jest.MockedFunction<typeof updateAlertRules>;

const mockRule = {
  id: 'r1',
  team_id: 't1',
  severity_filter: 'critical' as const,
  is_active: 1,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useAlertRules', () => {
  it('starts with empty state', () => {
    const { result } = renderHook(() => useAlertRules('t1'));

    expect(result.current.rules).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isSaving).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.saveSuccess).toBe(false);
  });

  it('loads rules successfully', async () => {
    mockFetchRules.mockResolvedValue([mockRule]);

    const { result } = renderHook(() => useAlertRules('t1'));

    await act(async () => {
      await result.current.loadRules();
    });

    expect(mockFetchRules).toHaveBeenCalledWith('t1');
    expect(result.current.rules).toEqual([mockRule]);
    expect(result.current.isLoading).toBe(false);
  });

  it('handles load error', async () => {
    mockFetchRules.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAlertRules('t1'));

    await act(async () => {
      await result.current.loadRules();
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.rules).toEqual([]);
  });

  it('handles non-Error load failure', async () => {
    mockFetchRules.mockRejectedValue('unexpected');

    const { result } = renderHook(() => useAlertRules('t1'));

    await act(async () => {
      await result.current.loadRules();
    });

    expect(result.current.error).toBe('Failed to load alert rules');
  });

  it('saves rules successfully', async () => {
    mockFetchRules.mockResolvedValue([mockRule]);
    mockUpdateRules.mockResolvedValue(mockRule);

    const { result } = renderHook(() => useAlertRules('t1'));

    let success: boolean;
    await act(async () => {
      success = await result.current.handleSave({
        severity_filter: 'critical',
        is_active: true,
      });
    });

    expect(success!).toBe(true);
    expect(mockUpdateRules).toHaveBeenCalledWith('t1', {
      severity_filter: 'critical',
      is_active: true,
    });
    expect(result.current.saveSuccess).toBe(true);
    expect(result.current.isSaving).toBe(false);
  });

  it('handles save error', async () => {
    mockUpdateRules.mockRejectedValue(new Error('Save failed'));

    const { result } = renderHook(() => useAlertRules('t1'));

    let success: boolean;
    await act(async () => {
      success = await result.current.handleSave({
        severity_filter: 'all',
      });
    });

    expect(success!).toBe(false);
    expect(result.current.error).toBe('Save failed');
    expect(result.current.saveSuccess).toBe(false);
  });

  it('returns false when teamId is undefined', async () => {
    const { result } = renderHook(() => useAlertRules(undefined));

    let success: boolean;
    await act(async () => {
      success = await result.current.handleSave({
        severity_filter: 'all',
      });
    });

    expect(success!).toBe(false);
    expect(mockUpdateRules).not.toHaveBeenCalled();
  });

  it('does not load when teamId is undefined', async () => {
    const { result } = renderHook(() => useAlertRules(undefined));

    await act(async () => {
      await result.current.loadRules();
    });

    expect(mockFetchRules).not.toHaveBeenCalled();
  });

  it('clears error', async () => {
    mockFetchRules.mockRejectedValue(new Error('err'));

    const { result } = renderHook(() => useAlertRules('t1'));

    await act(async () => {
      await result.current.loadRules();
    });

    expect(result.current.error).toBe('err');

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it('clears save success', async () => {
    mockFetchRules.mockResolvedValue([mockRule]);
    mockUpdateRules.mockResolvedValue(mockRule);

    const { result } = renderHook(() => useAlertRules('t1'));

    await act(async () => {
      await result.current.handleSave({ severity_filter: 'all' });
    });

    expect(result.current.saveSuccess).toBe(true);

    act(() => {
      result.current.clearSaveSuccess();
    });

    expect(result.current.saveSuccess).toBe(false);
  });
});
