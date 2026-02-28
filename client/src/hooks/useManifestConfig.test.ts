import { renderHook, act } from '@testing-library/react';
import { useManifestConfig } from './useManifestConfig';

jest.mock('../api/manifest');

import {
  getManifestConfig,
  saveManifestConfig,
  removeManifestConfig,
  triggerSync,
} from '../api/manifest';

const mockGetConfig = getManifestConfig as jest.MockedFunction<typeof getManifestConfig>;
const mockSaveConfig = saveManifestConfig as jest.MockedFunction<typeof saveManifestConfig>;
const mockRemoveConfig = removeManifestConfig as jest.MockedFunction<typeof removeManifestConfig>;
const mockTriggerSync = triggerSync as jest.MockedFunction<typeof triggerSync>;

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    team_id: 't1',
    manifest_url: 'https://example.com/manifest.json',
    is_enabled: 1,
    sync_policy: null,
    last_sync_at: null,
    last_sync_status: null,
    last_sync_error: null,
    last_sync_summary: null,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
    ...overrides,
  };
}

beforeEach(() => {
  mockGetConfig.mockReset();
  mockSaveConfig.mockReset();
  mockRemoveConfig.mockReset();
  mockTriggerSync.mockReset();
});

describe('useManifestConfig', () => {
  it('loads config', async () => {
    const config = makeConfig();
    mockGetConfig.mockResolvedValue(config as never);

    const { result } = renderHook(() => useManifestConfig('t1'));

    await act(async () => {
      await result.current.loadConfig();
    });

    expect(result.current.config).toEqual(config);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('returns null config when none exists', async () => {
    mockGetConfig.mockResolvedValue(null);

    const { result } = renderHook(() => useManifestConfig('t1'));

    await act(async () => {
      await result.current.loadConfig();
    });

    expect(result.current.config).toBeNull();
  });

  it('handles load error', async () => {
    mockGetConfig.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useManifestConfig('t1'));

    await act(async () => {
      await result.current.loadConfig();
    });

    expect(result.current.error).toBe('Network error');
  });

  it('handles non-Error exception in load', async () => {
    mockGetConfig.mockRejectedValue('String error');

    const { result } = renderHook(() => useManifestConfig('t1'));

    await act(async () => {
      await result.current.loadConfig();
    });

    expect(result.current.error).toBe('Failed to load manifest config');
  });

  it('does nothing when teamId is undefined', async () => {
    const { result } = renderHook(() => useManifestConfig(undefined));

    await act(async () => {
      await result.current.loadConfig();
    });

    expect(mockGetConfig).not.toHaveBeenCalled();
  });

  it('saves config', async () => {
    const input = { manifest_url: 'https://example.com/manifest.json' };
    const updated = makeConfig();
    mockSaveConfig.mockResolvedValue(updated as never);

    const { result } = renderHook(() => useManifestConfig('t1'));

    let success: boolean;
    await act(async () => {
      success = await result.current.saveConfig(input);
    });

    expect(success!).toBe(true);
    expect(result.current.config).toEqual(updated);
    expect(result.current.isSaving).toBe(false);
  });

  it('handles save error', async () => {
    mockSaveConfig.mockRejectedValue(new Error('SSRF blocked'));

    const { result } = renderHook(() => useManifestConfig('t1'));

    let success: boolean;
    await act(async () => {
      success = await result.current.saveConfig({ manifest_url: 'http://localhost' });
    });

    expect(success!).toBe(false);
    expect(result.current.error).toBe('SSRF blocked');
  });

  it('handles non-Error exception in save', async () => {
    mockSaveConfig.mockRejectedValue('String error');

    const { result } = renderHook(() => useManifestConfig('t1'));

    await act(async () => {
      await result.current.saveConfig({ manifest_url: 'https://example.com' });
    });

    expect(result.current.error).toBe('Failed to save manifest config');
  });

  it('returns false for save when teamId is undefined', async () => {
    const { result } = renderHook(() => useManifestConfig(undefined));

    let success: boolean;
    await act(async () => {
      success = await result.current.saveConfig({ manifest_url: 'https://example.com' });
    });

    expect(success!).toBe(false);
  });

  it('removes config', async () => {
    const config = makeConfig();
    mockGetConfig.mockResolvedValue(config as never);
    mockRemoveConfig.mockResolvedValue(undefined);

    const { result } = renderHook(() => useManifestConfig('t1'));

    await act(async () => {
      await result.current.loadConfig();
    });
    expect(result.current.config).toEqual(config);

    let success: boolean;
    await act(async () => {
      success = await result.current.removeConfig();
    });

    expect(success!).toBe(true);
    expect(result.current.config).toBeNull();
  });

  it('handles remove error', async () => {
    mockRemoveConfig.mockRejectedValue(new Error('Delete failed'));

    const { result } = renderHook(() => useManifestConfig('t1'));

    let success: boolean;
    await act(async () => {
      success = await result.current.removeConfig();
    });

    expect(success!).toBe(false);
    expect(result.current.error).toBe('Delete failed');
  });

  it('handles non-Error exception in remove', async () => {
    mockRemoveConfig.mockRejectedValue('String error');

    const { result } = renderHook(() => useManifestConfig('t1'));

    await act(async () => {
      await result.current.removeConfig();
    });

    expect(result.current.error).toBe('Failed to remove manifest config');
  });

  it('toggles enabled state', async () => {
    const config = makeConfig({ is_enabled: 1 });
    mockGetConfig.mockResolvedValue(config as never);

    const disabledConfig = makeConfig({ is_enabled: 0 });
    mockSaveConfig.mockResolvedValue(disabledConfig as never);

    const { result } = renderHook(() => useManifestConfig('t1'));

    await act(async () => {
      await result.current.loadConfig();
    });

    let success: boolean;
    await act(async () => {
      success = await result.current.toggleEnabled();
    });

    expect(success!).toBe(true);
    expect(mockSaveConfig).toHaveBeenCalledWith('t1', {
      manifest_url: 'https://example.com/manifest.json',
      is_enabled: false,
    });
    expect(result.current.config).toEqual(disabledConfig);
  });

  it('returns false for toggle when no config loaded', async () => {
    const { result } = renderHook(() => useManifestConfig('t1'));

    let success: boolean;
    await act(async () => {
      success = await result.current.toggleEnabled();
    });

    expect(success!).toBe(false);
  });

  it('handles toggle error', async () => {
    const config = makeConfig();
    mockGetConfig.mockResolvedValue(config as never);
    mockSaveConfig.mockRejectedValue(new Error('Toggle failed'));

    const { result } = renderHook(() => useManifestConfig('t1'));

    await act(async () => {
      await result.current.loadConfig();
    });

    await act(async () => {
      await result.current.toggleEnabled();
    });

    expect(result.current.error).toBe('Toggle failed');
  });

  it('handles non-Error exception in toggle', async () => {
    const config = makeConfig();
    mockGetConfig.mockResolvedValue(config as never);
    mockSaveConfig.mockRejectedValue('String error');

    const { result } = renderHook(() => useManifestConfig('t1'));

    await act(async () => {
      await result.current.loadConfig();
    });

    await act(async () => {
      await result.current.toggleEnabled();
    });

    expect(result.current.error).toBe('Failed to toggle manifest');
  });

  it('triggers sync and reloads config', async () => {
    const syncResult = {
      status: 'success' as const,
      summary: { services: { created: 2, updated: 0, deactivated: 0, deleted: 0, drift_flagged: 0, unchanged: 0 }, aliases: { created: 0, updated: 0, removed: 0, unchanged: 0 }, overrides: { created: 0, updated: 0, removed: 0, unchanged: 0 }, associations: { created: 0, removed: 0, unchanged: 0 } },
      errors: [],
      warnings: [],
      changes: [],
      duration_ms: 500,
    };
    mockTriggerSync.mockResolvedValue(syncResult as never);
    mockGetConfig.mockResolvedValue(makeConfig({ last_sync_status: 'success' }) as never);

    const { result } = renderHook(() => useManifestConfig('t1'));

    let syncResponse: unknown;
    await act(async () => {
      syncResponse = await result.current.triggerSync();
    });

    expect(syncResponse).toEqual(syncResult);
    expect(result.current.syncResult).toEqual(syncResult);
    expect(result.current.isSyncing).toBe(false);
    // Config should be reloaded after sync
    expect(mockGetConfig).toHaveBeenCalled();
  });

  it('handles sync error', async () => {
    mockTriggerSync.mockRejectedValue(new Error('Sync already in progress'));

    const { result } = renderHook(() => useManifestConfig('t1'));

    let syncResponse: unknown;
    await act(async () => {
      syncResponse = await result.current.triggerSync();
    });

    expect(syncResponse).toBeNull();
    expect(result.current.error).toBe('Sync already in progress');
  });

  it('handles non-Error exception in sync', async () => {
    mockTriggerSync.mockRejectedValue('String error');

    const { result } = renderHook(() => useManifestConfig('t1'));

    await act(async () => {
      await result.current.triggerSync();
    });

    expect(result.current.error).toBe('Failed to trigger sync');
  });

  it('returns null for sync when teamId is undefined', async () => {
    const { result } = renderHook(() => useManifestConfig(undefined));

    let syncResponse: unknown;
    await act(async () => {
      syncResponse = await result.current.triggerSync();
    });

    expect(syncResponse).toBeNull();
  });

  it('clears error', async () => {
    mockGetConfig.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useManifestConfig('t1'));

    await act(async () => {
      await result.current.loadConfig();
    });
    expect(result.current.error).toBe('Network error');

    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBeNull();
  });

  it('clears sync result', async () => {
    const syncResult = { status: 'success' as const, summary: {} as never, errors: [], warnings: [], changes: [], duration_ms: 100 };
    mockTriggerSync.mockResolvedValue(syncResult as never);
    mockGetConfig.mockResolvedValue(null);

    const { result } = renderHook(() => useManifestConfig('t1'));

    await act(async () => {
      await result.current.triggerSync();
    });
    expect(result.current.syncResult).toEqual(syncResult);

    act(() => {
      result.current.clearSyncResult();
    });
    expect(result.current.syncResult).toBeNull();
  });
});
