import { renderHook, act } from '@testing-library/react';
import { useCanonicalOverrides } from './useCanonicalOverrides';

jest.mock('../api/canonicalOverrides', () => ({
  fetchCanonicalOverrides: jest.fn(),
  upsertCanonicalOverride: jest.fn(),
  deleteCanonicalOverride: jest.fn(),
}));

import {
  fetchCanonicalOverrides,
  upsertCanonicalOverride,
  deleteCanonicalOverride,
} from '../api/canonicalOverrides';

const mockFetchCanonicalOverrides = fetchCanonicalOverrides as jest.Mock;
const mockUpsertCanonicalOverride = upsertCanonicalOverride as jest.Mock;
const mockDeleteCanonicalOverride = deleteCanonicalOverride as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchCanonicalOverrides.mockResolvedValue([]);
});

describe('useCanonicalOverrides', () => {
  it('loads overrides', async () => {
    const overrides = [
      { id: '1', canonical_name: 'PostgreSQL', contact_override: '{"email":"db@co.com"}', impact_override: 'Critical', created_at: '', updated_at: '', updated_by: null },
    ];
    mockFetchCanonicalOverrides.mockResolvedValue(overrides);

    const { result } = renderHook(() => useCanonicalOverrides());

    await act(async () => {
      await result.current.loadOverrides();
    });

    expect(result.current.overrides).toEqual(overrides);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('handles load error', async () => {
    mockFetchCanonicalOverrides.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useCanonicalOverrides());

    await act(async () => {
      await result.current.loadOverrides();
    });

    expect(result.current.error).toBe('Network error');
  });

  it('handles non-Error exception in loadOverrides', async () => {
    mockFetchCanonicalOverrides.mockRejectedValue('String error');

    const { result } = renderHook(() => useCanonicalOverrides());

    await act(async () => {
      await result.current.loadOverrides();
    });

    expect(result.current.error).toBe('Failed to load canonical overrides');
  });

  it('saves an override and reloads', async () => {
    const saved = { id: '1', canonical_name: 'PostgreSQL', impact_override: 'Critical' };
    mockUpsertCanonicalOverride.mockResolvedValue(saved);
    mockFetchCanonicalOverrides.mockResolvedValue([saved]);

    const { result } = renderHook(() => useCanonicalOverrides());

    await act(async () => {
      await result.current.saveOverride('PostgreSQL', { impact_override: 'Critical' });
    });

    expect(mockUpsertCanonicalOverride).toHaveBeenCalledWith('PostgreSQL', { impact_override: 'Critical' });
    expect(mockFetchCanonicalOverrides).toHaveBeenCalled();
  });

  it('handles saveOverride error', async () => {
    mockUpsertCanonicalOverride.mockRejectedValue(new Error('Forbidden'));

    const { result } = renderHook(() => useCanonicalOverrides());

    await act(async () => {
      await expect(
        result.current.saveOverride('PostgreSQL', { impact_override: 'test' })
      ).rejects.toThrow('Forbidden');
    });

    expect(result.current.error).toBe('Forbidden');
  });

  it('handles non-Error exception in saveOverride', async () => {
    mockUpsertCanonicalOverride.mockRejectedValue('String error');

    const { result } = renderHook(() => useCanonicalOverrides());

    await act(async () => {
      await expect(
        result.current.saveOverride('PostgreSQL', { impact_override: 'test' })
      ).rejects.toBe('String error');
    });

    expect(result.current.error).toBe('Failed to save canonical override');
  });

  it('removes an override optimistically', async () => {
    const overrides = [
      { id: '1', canonical_name: 'PostgreSQL', contact_override: null, impact_override: 'Critical', created_at: '', updated_at: '', updated_by: null },
      { id: '2', canonical_name: 'Redis', contact_override: null, impact_override: 'Low', created_at: '', updated_at: '', updated_by: null },
    ];
    mockFetchCanonicalOverrides.mockResolvedValue(overrides);
    mockDeleteCanonicalOverride.mockResolvedValue(undefined);

    const { result } = renderHook(() => useCanonicalOverrides());

    await act(async () => {
      await result.current.loadOverrides();
    });

    await act(async () => {
      await result.current.removeOverride('PostgreSQL');
    });

    expect(mockDeleteCanonicalOverride).toHaveBeenCalledWith('PostgreSQL');
    expect(result.current.overrides).toHaveLength(1);
    expect(result.current.overrides[0].canonical_name).toBe('Redis');
  });

  it('handles removeOverride error', async () => {
    mockDeleteCanonicalOverride.mockRejectedValue(new Error('Not found'));

    const { result } = renderHook(() => useCanonicalOverrides());

    await act(async () => {
      await expect(
        result.current.removeOverride('PostgreSQL')
      ).rejects.toThrow('Not found');
    });

    expect(result.current.error).toBe('Not found');
  });

  it('handles non-Error exception in removeOverride', async () => {
    mockDeleteCanonicalOverride.mockRejectedValue('String error');

    const { result } = renderHook(() => useCanonicalOverrides());

    await act(async () => {
      await expect(
        result.current.removeOverride('PostgreSQL')
      ).rejects.toBe('String error');
    });

    expect(result.current.error).toBe('Failed to delete canonical override');
  });

  it('getOverride returns matching override', async () => {
    const overrides = [
      { id: '1', canonical_name: 'PostgreSQL', contact_override: null, impact_override: 'Critical', created_at: '', updated_at: '', updated_by: null },
      { id: '2', canonical_name: 'Redis', contact_override: null, impact_override: 'Low', created_at: '', updated_at: '', updated_by: null },
    ];
    mockFetchCanonicalOverrides.mockResolvedValue(overrides);

    const { result } = renderHook(() => useCanonicalOverrides());

    await act(async () => {
      await result.current.loadOverrides();
    });

    expect(result.current.getOverride('PostgreSQL')).toEqual(overrides[0]);
    expect(result.current.getOverride('Redis')).toEqual(overrides[1]);
    expect(result.current.getOverride('Nonexistent')).toBeUndefined();
  });

  it('sets isLoading during loadOverrides', async () => {
    let resolvePromise: (value: unknown[]) => void;
    mockFetchCanonicalOverrides.mockReturnValue(
      new Promise((resolve) => { resolvePromise = resolve; })
    );

    const { result } = renderHook(() => useCanonicalOverrides());

    let loadPromise: Promise<void>;
    act(() => {
      loadPromise = result.current.loadOverrides();
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolvePromise!([]);
      await loadPromise!;
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('clears error before each operation', async () => {
    mockFetchCanonicalOverrides
      .mockRejectedValueOnce(new Error('First error'))
      .mockResolvedValueOnce([]);

    const { result } = renderHook(() => useCanonicalOverrides());

    await act(async () => {
      await result.current.loadOverrides();
    });
    expect(result.current.error).toBe('First error');

    await act(async () => {
      await result.current.loadOverrides();
    });
    expect(result.current.error).toBeNull();
  });
});
