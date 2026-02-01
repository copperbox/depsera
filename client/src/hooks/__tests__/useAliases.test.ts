import { renderHook, act } from '@testing-library/react';
import { useAliases } from '../useAliases';

jest.mock('../../api/aliases', () => ({
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
} from '../../api/aliases';

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
});
