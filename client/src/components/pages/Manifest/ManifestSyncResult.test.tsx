import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ManifestSyncResult from './ManifestSyncResult';
import type { TeamManifestConfig, ManifestSyncResult as SyncResult } from '../../../types/manifest';

const baseConfig: TeamManifestConfig = {
  id: 'mc1',
  team_id: 't1',
  manifest_url: 'https://example.com/manifest.json',
  is_enabled: 1,
  sync_policy: null,
  last_sync_at: new Date().toISOString(),
  last_sync_status: 'success',
  last_sync_error: null,
  last_sync_summary: JSON.stringify({
    services: { created: 2, updated: 1, deactivated: 0, deleted: 0, drift_flagged: 1, unchanged: 5 },
    aliases: { created: 0, updated: 0, removed: 0, unchanged: 0 },
    overrides: { created: 0, updated: 0, removed: 0, unchanged: 0 },
    associations: { created: 0, removed: 0, unchanged: 0 },
  }),
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

const mockSyncResult: SyncResult = {
  status: 'success',
  summary: {
    services: { created: 1, updated: 0, deactivated: 0, deleted: 0, drift_flagged: 0, unchanged: 3 },
    aliases: { created: 0, updated: 0, removed: 0, unchanged: 0 },
    overrides: { created: 0, updated: 0, removed: 0, unchanged: 0 },
    associations: { created: 0, removed: 0, unchanged: 0 },
  },
  errors: [],
  warnings: ['Service foo has unknown field'],
  changes: [
    { manifest_key: 'svc-a', service_name: 'Service A', action: 'created' },
    { manifest_key: 'svc-b', service_name: 'Service B', action: 'unchanged' },
    { manifest_key: 'svc-c', service_name: 'Service C', action: 'updated', fields_changed: ['name'] },
  ],
  duration_ms: 1234,
};

function renderSyncResult(overrides: Partial<{
  config: Partial<TeamManifestConfig>;
  isSyncing: boolean;
  syncResult: SyncResult | null;
  onSync: () => Promise<SyncResult | null>;
  onClearSyncResult: () => void;
}> = {}) {
  const props = {
    config: { ...baseConfig, ...overrides.config } as TeamManifestConfig,
    isSyncing: overrides.isSyncing ?? false,
    syncResult: overrides.syncResult ?? null,
    onSync: overrides.onSync ?? jest.fn().mockResolvedValue(null),
    onClearSyncResult: overrides.onClearSyncResult ?? jest.fn(),
  };

  return { ...render(<ManifestSyncResult {...props} />), props };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ManifestSyncResult', () => {
  it('shows no syncs state when last_sync_at is null', () => {
    renderSyncResult({ config: { last_sync_at: null } });
    expect(screen.getByText(/No syncs yet/)).toBeInTheDocument();
  });

  it('shows Sync Now button when enabled', () => {
    renderSyncResult();
    expect(screen.getByText('Sync Now')).toBeInTheDocument();
  });

  it('hides Sync Now button when disabled', () => {
    renderSyncResult({ config: { is_enabled: 0 } });
    expect(screen.queryByText('Sync Now')).not.toBeInTheDocument();
  });

  it('shows Syncing... when sync in progress', () => {
    renderSyncResult({ isSyncing: true });
    expect(screen.getByText('Syncing...')).toBeInTheDocument();
  });

  it('shows success status', () => {
    renderSyncResult();
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  it('shows partial status', () => {
    renderSyncResult({ config: { last_sync_status: 'partial' } });
    expect(screen.getByText('Partial')).toBeInTheDocument();
  });

  it('shows failed status and error', () => {
    renderSyncResult({
      config: {
        last_sync_status: 'failed',
        last_sync_error: 'Connection timeout',
        last_sync_summary: null,
      },
    });
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Connection timeout')).toBeInTheDocument();
  });

  it('shows summary counts', () => {
    renderSyncResult();
    // Verify summary labels are present
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Updated')).toBeInTheDocument();
    expect(screen.getByText('Unchanged')).toBeInTheDocument();
    expect(screen.getByText('Drift Flagged')).toBeInTheDocument();
    // Verify some values appear (use getAllByText for values that appear multiple times)
    expect(screen.getByText('2')).toBeInTheDocument(); // created count
    expect(screen.getByText('5')).toBeInTheDocument(); // unchanged count
  });

  it('calls onSync when Sync Now clicked', async () => {
    const onSync = jest.fn().mockResolvedValue(mockSyncResult);
    renderSyncResult({ onSync });

    await act(async () => {
      fireEvent.click(screen.getByText('Sync Now'));
    });

    expect(onSync).toHaveBeenCalled();
  });

  it('shows sync success banner after manual sync', async () => {
    const onSync = jest.fn().mockResolvedValue(mockSyncResult);
    renderSyncResult({ onSync });

    await act(async () => {
      fireEvent.click(screen.getByText('Sync Now'));
    });

    await waitFor(() => {
      expect(screen.getByText(/Added 1/)).toBeInTheDocument();
    });
  });

  it('shows sync error banner on failed sync', async () => {
    const onSync = jest.fn().mockResolvedValue(null);
    renderSyncResult({ onSync });

    await act(async () => {
      fireEvent.click(screen.getByText('Sync Now'));
    });

    await waitFor(() => {
      expect(screen.getByText('Sync failed')).toBeInTheDocument();
    });
  });

  it('auto-dismisses success banner after 8s', async () => {
    const onSync = jest.fn().mockResolvedValue(mockSyncResult);
    renderSyncResult({ onSync });

    await act(async () => {
      fireEvent.click(screen.getByText('Sync Now'));
    });

    await waitFor(() => {
      expect(screen.getByText(/Added 1/)).toBeInTheDocument();
    });

    act(() => {
      jest.advanceTimersByTime(8000);
    });

    expect(screen.queryByText(/Added 1/)).not.toBeInTheDocument();
  });

  it('dismisses banner manually', async () => {
    const onSync = jest.fn().mockResolvedValue(mockSyncResult);
    const onClearSyncResult = jest.fn();
    renderSyncResult({ onSync, onClearSyncResult });

    await act(async () => {
      fireEvent.click(screen.getByText('Sync Now'));
    });

    await waitFor(() => {
      expect(screen.getByText(/Added 1/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Dismiss sync result'));
    expect(screen.queryByText(/Added 1/)).not.toBeInTheDocument();
    expect(onClearSyncResult).toHaveBeenCalled();
  });

  it('shows expandable details for recent sync result', async () => {
    renderSyncResult({ syncResult: mockSyncResult });
    expect(screen.getByText('▸ Show details')).toBeInTheDocument();

    fireEvent.click(screen.getByText('▸ Show details'));
    expect(screen.getByText('Service A')).toBeInTheDocument();
    expect(screen.getByText('Service B')).toBeInTheDocument();
    expect(screen.getByText('Service C')).toBeInTheDocument();
    expect(screen.getByText('(name)')).toBeInTheDocument();
  });

  it('shows warnings in details', () => {
    renderSyncResult({ syncResult: mockSyncResult });
    fireEvent.click(screen.getByText('▸ Show details'));
    expect(screen.getByText('Service foo has unknown field')).toBeInTheDocument();
  });

  it('hides details when toggled again', () => {
    renderSyncResult({ syncResult: mockSyncResult });
    fireEvent.click(screen.getByText('▸ Show details'));
    expect(screen.getByText('Service A')).toBeInTheDocument();

    fireEvent.click(screen.getByText('▾ Hide details'));
    expect(screen.queryByText('Service A')).not.toBeInTheDocument();
  });
});
