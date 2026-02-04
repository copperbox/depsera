import { renderHook, act } from '@testing-library/react';
import { useAliases } from './useAliases';

jest.mock('../api/aliases', () => ({
  fetchAliases: jest.fn(),
  createAlias: jest.fn(),
  updateAlias: jest.fn(),
  deleteAlias: jest.fn(),
  fetchCanonicalNames: jest.fn(),
}));

import {
  fetchAliases,
  createAlias,
  updateAlias,
  deleteAlias,
  fetchCanonicalNames,
} from './../api/aliases';

const mockFetchAliases = fetchAliases as jest.Mock;
const mockCreateAlias = createAlias as jest.Mock;
const mockUpdateAlias = updateAlias as jest.Mock;
const mockDeleteAlias = deleteAlias as jest.Mock;
const mockFetchCanonicalNames = fetchCanonicalNames as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchAliases.mockResolvedValue([]);
  mockFetchCanonicalNames.mockResolvedValue([]);
});

describe('useAliases', () => {
  it('loads aliases', async () => {
    const aliases = [{ id: '1', alias: 'pg', canonical_name: 'DB', created_at: '' }];
    mockFetchAliases.mockResolvedValue(aliases);

    const { result } = renderHook(() => useAliases());

    await act(async () => {
      await result.current.loadAliases();
    });

    expect(result.current.aliases).toEqual(aliases);
    expect(result.current.isLoading).toBe(false);
  });

  it('handles load error', async () => {
    mockFetchAliases.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAliases());

    await act(async () => {
      await result.current.loadAliases();
    });

    expect(result.current.error).toBe('Network error');
  });

  it('adds an alias and reloads', async () => {
    mockCreateAlias.mockResolvedValue({ id: '1', alias: 'pg', canonical_name: 'DB' });
    mockFetchAliases.mockResolvedValue([{ id: '1', alias: 'pg', canonical_name: 'DB' }]);

    const { result } = renderHook(() => useAliases());

    await act(async () => {
      await result.current.addAlias({ alias: 'pg', canonical_name: 'DB' });
    });

    expect(mockCreateAlias).toHaveBeenCalledWith({ alias: 'pg', canonical_name: 'DB' });
    expect(mockFetchAliases).toHaveBeenCalled();
  });

  it('edits an alias and reloads', async () => {
    mockUpdateAlias.mockResolvedValue({ id: '1', alias: 'pg', canonical_name: 'New' });
    mockFetchAliases.mockResolvedValue([]);

    const { result } = renderHook(() => useAliases());

    await act(async () => {
      await result.current.editAlias('1', 'New');
    });

    expect(mockUpdateAlias).toHaveBeenCalledWith('1', { canonical_name: 'New' });
  });

  it('removes an alias optimistically', async () => {
    mockFetchAliases.mockResolvedValue([
      { id: '1', alias: 'pg', canonical_name: 'DB', created_at: '' },
      { id: '2', alias: 'redis', canonical_name: 'Cache', created_at: '' },
    ]);
    mockDeleteAlias.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAliases());

    await act(async () => {
      await result.current.loadAliases();
    });

    await act(async () => {
      await result.current.removeAlias('1');
    });

    expect(result.current.aliases).toHaveLength(1);
    expect(result.current.aliases[0].id).toBe('2');
  });

  it('loads canonical names', async () => {
    mockFetchCanonicalNames.mockResolvedValue(['DB', 'Cache']);

    const { result } = renderHook(() => useAliases());

    await act(async () => {
      await result.current.loadCanonicalNames();
    });

    expect(result.current.canonicalNames).toEqual(['DB', 'Cache']);
  });

  it('handles non-Error exception in loadAliases', async () => {
    mockFetchAliases.mockRejectedValue('String error');

    const { result } = renderHook(() => useAliases());

    await act(async () => {
      await result.current.loadAliases();
    });

    expect(result.current.error).toBe('Failed to load aliases');
  });

  it('handles addAlias error', async () => {
    mockCreateAlias.mockRejectedValue(new Error('Create failed'));

    const { result } = renderHook(() => useAliases());

    await act(async () => {
      await expect(
        result.current.addAlias({ alias: 'pg', canonical_name: 'DB' })
      ).rejects.toThrow('Create failed');
    });

    expect(result.current.error).toBe('Create failed');
  });

  it('handles non-Error exception in addAlias', async () => {
    mockCreateAlias.mockRejectedValue('String error');

    const { result } = renderHook(() => useAliases());

    await act(async () => {
      await expect(
        result.current.addAlias({ alias: 'pg', canonical_name: 'DB' })
      ).rejects.toBe('String error');
    });

    expect(result.current.error).toBe('Failed to create alias');
  });

  it('handles editAlias error', async () => {
    mockUpdateAlias.mockRejectedValue(new Error('Update failed'));

    const { result } = renderHook(() => useAliases());

    await act(async () => {
      await expect(
        result.current.editAlias('1', 'New')
      ).rejects.toThrow('Update failed');
    });

    expect(result.current.error).toBe('Update failed');
  });

  it('handles non-Error exception in editAlias', async () => {
    mockUpdateAlias.mockRejectedValue('String error');

    const { result } = renderHook(() => useAliases());

    await act(async () => {
      await expect(
        result.current.editAlias('1', 'New')
      ).rejects.toBe('String error');
    });

    expect(result.current.error).toBe('Failed to update alias');
  });

  it('handles removeAlias error', async () => {
    mockDeleteAlias.mockRejectedValue(new Error('Delete failed'));

    const { result } = renderHook(() => useAliases());

    await act(async () => {
      await expect(
        result.current.removeAlias('1')
      ).rejects.toThrow('Delete failed');
    });

    expect(result.current.error).toBe('Delete failed');
  });

  it('handles non-Error exception in removeAlias', async () => {
    mockDeleteAlias.mockRejectedValue('String error');

    const { result } = renderHook(() => useAliases());

    await act(async () => {
      await expect(
        result.current.removeAlias('1')
      ).rejects.toBe('String error');
    });

    expect(result.current.error).toBe('Failed to delete alias');
  });

  it('handles loadCanonicalNames error silently', async () => {
    mockFetchCanonicalNames.mockRejectedValue(new Error('Fetch failed'));

    const { result } = renderHook(() => useAliases());

    await act(async () => {
      await result.current.loadCanonicalNames();
    });

    // Error is silently ignored
    expect(result.current.canonicalNames).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
