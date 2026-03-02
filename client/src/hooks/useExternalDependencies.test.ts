import { renderHook, act } from '@testing-library/react';
import { useExternalDependencies } from './useExternalDependencies';

jest.mock('../api/catalog', () => ({
  fetchExternalDependencies: jest.fn(),
}));

import { fetchExternalDependencies } from '../api/catalog';

const mockFetch = fetchExternalDependencies as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue([]);
});

describe('useExternalDependencies', () => {
  it('loads entries', async () => {
    const data = [
      {
        canonical_name: 'postgresql',
        description: 'Primary DB',
        teams: [{ id: 't1', name: 'Team Alpha', key: 'team-alpha' }],
        aliases: ['pg'],
        usage_count: 3,
      },
    ];
    mockFetch.mockResolvedValue(data);

    const { result } = renderHook(() => useExternalDependencies());

    await act(async () => {
      await result.current.load();
    });

    expect(result.current.entries).toEqual(data);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('handles load error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useExternalDependencies());

    await act(async () => {
      await result.current.load();
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.entries).toEqual([]);
  });

  it('handles non-Error exception', async () => {
    mockFetch.mockRejectedValue('String error');

    const { result } = renderHook(() => useExternalDependencies());

    await act(async () => {
      await result.current.load();
    });

    expect(result.current.error).toBe('Failed to load external dependencies');
  });

  it('sets isLoading during fetch', async () => {
    let resolve: (value: unknown[]) => void;
    mockFetch.mockReturnValue(
      new Promise<unknown[]>((r) => {
        resolve = r;
      }),
    );

    const { result } = renderHook(() => useExternalDependencies());

    let loadPromise: Promise<void>;
    act(() => {
      loadPromise = result.current.load();
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolve!([]);
      await loadPromise;
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('clears previous error on reload', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Fail'));

    const { result } = renderHook(() => useExternalDependencies());

    await act(async () => {
      await result.current.load();
    });

    expect(result.current.error).toBe('Fail');

    mockFetch.mockResolvedValueOnce([]);

    await act(async () => {
      await result.current.load();
    });

    expect(result.current.error).toBeNull();
  });
});
