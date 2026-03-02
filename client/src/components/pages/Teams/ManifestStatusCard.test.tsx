import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ManifestStatusCard from './ManifestStatusCard';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockConfig = {
  id: 'mc1',
  team_id: 't1',
  manifest_url: 'https://example.com/manifest.json',
  is_enabled: 1,
  sync_policy: null,
  last_sync_at: new Date().toISOString(),
  last_sync_status: 'success',
  last_sync_error: null,
  last_sync_summary: JSON.stringify({
    services: { created: 0, updated: 0, deactivated: 0, deleted: 0, drift_flagged: 0, unchanged: 5 },
    aliases: { created: 0, updated: 0, removed: 0, unchanged: 0 },
    overrides: { created: 0, updated: 0, removed: 0, unchanged: 0 },
    associations: { created: 0, removed: 0, unchanged: 0 },
  }),
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

const mockDriftSummary = {
  pending_count: 0,
  dismissed_count: 0,
  field_change_pending: 0,
  service_removal_pending: 0,
};

function renderCard(teamId = 't1', canManage = true) {
  return render(
    <MemoryRouter>
      <ManifestStatusCard teamId={teamId} canManage={canManage} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ManifestStatusCard', () => {
  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    renderCard();

    expect(screen.getByText('Loading manifest config...')).toBeInTheDocument();
  });

  it('shows empty state when no manifest configured', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: null }))      // getManifestConfig
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }));  // getDriftSummary

    renderCard();

    await waitFor(() => {
      expect(screen.getByText('No manifest URL configured.')).toBeInTheDocument();
    });
  });

  it('shows "Configure Manifest" link for managers when no config', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: null }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }));

    renderCard('t1', true);

    await waitFor(() => {
      expect(screen.getByText('Configure Manifest →')).toBeInTheDocument();
    });
  });

  it('hides "Configure Manifest" link for non-managers', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: null }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }));

    renderCard('t1', false);

    await waitFor(() => {
      expect(screen.getByText('No manifest URL configured.')).toBeInTheDocument();
    });

    expect(screen.queryByText('Configure Manifest →')).not.toBeInTheDocument();
  });

  it('displays manifest URL and sync status when configured', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }));

    renderCard();

    await waitFor(() => {
      expect(screen.getByText('https://example.com/manifest.json')).toBeInTheDocument();
    });

    expect(screen.getByText(/Last sync success/)).toBeInTheDocument();
  });

  it('shows service count from last sync summary', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }));

    renderCard();

    await waitFor(() => {
      expect(screen.getByText(/5 services/)).toBeInTheDocument();
    });
  });

  it('truncates long manifest URLs', async () => {
    const longUrlConfig = {
      ...mockConfig,
      manifest_url: 'https://very-long-domain-name.example.com/api/v2/teams/my-team/manifest.json',
    };

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: longUrlConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }));

    renderCard();

    await waitFor(() => {
      expect(screen.getByText(/\.\.\./)).toBeInTheDocument();
    });
  });

  it('shows "Sync Now" button for managers', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }));

    renderCard('t1', true);

    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });
  });

  it('hides "Sync Now" button for non-managers', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }));

    renderCard('t1', false);

    await waitFor(() => {
      expect(screen.getByText('Manage Manifest →')).toBeInTheDocument();
    });

    expect(screen.queryByText('Sync Now')).not.toBeInTheDocument();
  });

  it('shows "Manage Manifest" link', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }));

    renderCard();

    await waitFor(() => {
      expect(screen.getByText('Manage Manifest →')).toBeInTheDocument();
    });
  });

  it('shows disabled state when manifest is disabled', async () => {
    const disabledConfig = { ...mockConfig, is_enabled: 0 };

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: disabledConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }));

    renderCard();

    await waitFor(() => {
      expect(screen.getByText('Scheduled syncs are paused')).toBeInTheDocument();
    });

    // Sync Now should be hidden when disabled
    expect(screen.queryByText('Sync Now')).not.toBeInTheDocument();
  });

  it('shows error status with error message', async () => {
    const errorConfig = {
      ...mockConfig,
      last_sync_status: 'failed',
      last_sync_error: 'Connection refused',
    };

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: errorConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }));

    renderCard();

    await waitFor(() => {
      expect(screen.getByText('Last sync failed')).toBeInTheDocument();
    });

    expect(screen.getByText('Connection refused')).toBeInTheDocument();
  });

  it('shows partial sync status with yellow indicator', async () => {
    const partialConfig = {
      ...mockConfig,
      last_sync_status: 'partial',
    };

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: partialConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }));

    renderCard();

    await waitFor(() => {
      expect(screen.getByText(/Last sync partial/)).toBeInTheDocument();
    });
  });

  it('shows drift alert when pending drift flags exist', async () => {
    const driftSummaryWithPending = {
      pending_count: 3,
      dismissed_count: 2,
      field_change_pending: 2,
      service_removal_pending: 1,
    };

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: driftSummaryWithPending }));

    renderCard();

    await waitFor(() => {
      expect(screen.getByText(/3 pending drift flags/)).toBeInTheDocument();
    });

    expect(screen.getByText(/2 dismissed/)).toBeInTheDocument();
  });

  it('shows singular drift flag text for count of 1', async () => {
    const driftSummaryOne = {
      pending_count: 1,
      dismissed_count: 0,
      field_change_pending: 1,
      service_removal_pending: 0,
    };

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: driftSummaryOne }));

    renderCard();

    await waitFor(() => {
      expect(screen.getByText(/1 pending drift flag(?!s)/)).toBeInTheDocument();
    });
  });

  it('hides dismissed count when zero', async () => {
    const driftSummaryNoDismissed = {
      pending_count: 2,
      dismissed_count: 0,
      field_change_pending: 1,
      service_removal_pending: 1,
    };

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: driftSummaryNoDismissed }));

    renderCard();

    await waitFor(() => {
      expect(screen.getByText(/2 pending drift flags/)).toBeInTheDocument();
    });

    expect(screen.queryByText(/dismissed/)).not.toBeInTheDocument();
  });

  it('triggers sync and shows success summary', async () => {
    const syncResult = {
      status: 'success',
      summary: {
        services: { created: 2, updated: 1, deactivated: 0, deleted: 0, drift_flagged: 3, unchanged: 4 },
        aliases: { created: 0, updated: 0, removed: 0, unchanged: 0 },
        overrides: { created: 0, updated: 0, removed: 0, unchanged: 0 },
        associations: { created: 0, removed: 0, unchanged: 0 },
      },
      errors: [],
      warnings: [],
      changes: [],
      duration_ms: 1500,
    };

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))       // initial load
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary })) // initial drift
      .mockResolvedValueOnce(jsonResponse({ result: syncResult }))        // trigger sync
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))        // reload config
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary })); // reload drift

    renderCard();

    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Sync Now'));

    expect(screen.getByText('Syncing...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Added 2/)).toBeInTheDocument();
    });

    expect(screen.getByText(/updated 1/)).toBeInTheDocument();
    expect(screen.getByText(/3 drift flags/)).toBeInTheDocument();
  });

  it('shows "No changes" for sync with no modifications', async () => {
    const syncResult = {
      status: 'success',
      summary: {
        services: { created: 0, updated: 0, deactivated: 0, deleted: 0, drift_flagged: 0, unchanged: 5 },
        aliases: { created: 0, updated: 0, removed: 0, unchanged: 0 },
        overrides: { created: 0, updated: 0, removed: 0, unchanged: 0 },
        associations: { created: 0, removed: 0, unchanged: 0 },
      },
      errors: [],
      warnings: [],
      changes: [],
      duration_ms: 500,
    };

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }))
      .mockResolvedValueOnce(jsonResponse({ result: syncResult }))
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }));

    renderCard();

    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Sync Now'));

    await waitFor(() => {
      expect(screen.getByText('No changes')).toBeInTheDocument();
    });
  });

  it('auto-dismisses success banner after 8 seconds', async () => {
    const syncResult = {
      status: 'success',
      summary: {
        services: { created: 1, updated: 0, deactivated: 0, deleted: 0, drift_flagged: 0, unchanged: 0 },
        aliases: { created: 0, updated: 0, removed: 0, unchanged: 0 },
        overrides: { created: 0, updated: 0, removed: 0, unchanged: 0 },
        associations: { created: 0, removed: 0, unchanged: 0 },
      },
      errors: [],
      warnings: [],
      changes: [],
      duration_ms: 500,
    };

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }))
      .mockResolvedValueOnce(jsonResponse({ result: syncResult }))
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }));

    renderCard();

    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Sync Now'));

    await waitFor(() => {
      expect(screen.getByText(/Added 1/)).toBeInTheDocument();
    });

    // Advance timers to auto-dismiss
    act(() => {
      jest.advanceTimersByTime(8000);
    });

    expect(screen.queryByText(/Added 1/)).not.toBeInTheDocument();
  });

  it('dismisses sync banner when dismiss button clicked', async () => {
    const syncResult = {
      status: 'success',
      summary: {
        services: { created: 1, updated: 0, deactivated: 0, deleted: 0, drift_flagged: 0, unchanged: 0 },
        aliases: { created: 0, updated: 0, removed: 0, unchanged: 0 },
        overrides: { created: 0, updated: 0, removed: 0, unchanged: 0 },
        associations: { created: 0, removed: 0, unchanged: 0 },
      },
      errors: [],
      warnings: [],
      changes: [],
      duration_ms: 500,
    };

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }))
      .mockResolvedValueOnce(jsonResponse({ result: syncResult }))
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }));

    renderCard();

    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Sync Now'));

    await waitFor(() => {
      expect(screen.getByText(/Added 1/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Dismiss sync result'));

    expect(screen.queryByText(/Added 1/)).not.toBeInTheDocument();
  });

  it('shows error message when sync fails', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }))
      .mockRejectedValueOnce(new Error('Failed to trigger sync'));

    renderCard();

    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Sync Now'));

    await waitFor(() => {
      expect(screen.getByText('Failed to trigger sync')).toBeInTheDocument();
    });
  });

  it('shows 429 cooldown error from hook', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }))
      .mockResolvedValueOnce(jsonResponse({ error: 'Please wait before syncing again' }, 429));

    renderCard();

    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Sync Now'));

    await waitFor(() => {
      expect(screen.getByText('Please wait before syncing again')).toBeInTheDocument();
    });
  });

  it('shows cooldown timer after sync and disables button', async () => {
    const syncResult = {
      status: 'success',
      summary: {
        services: { created: 1, updated: 0, deactivated: 0, deleted: 0, drift_flagged: 0, unchanged: 0 },
        aliases: { created: 0, updated: 0, removed: 0, unchanged: 0 },
        overrides: { created: 0, updated: 0, removed: 0, unchanged: 0 },
        associations: { created: 0, removed: 0, unchanged: 0 },
      },
      errors: [],
      warnings: [],
      changes: [],
      duration_ms: 500,
    };

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }))
      .mockResolvedValueOnce(jsonResponse({ result: syncResult }))
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }));

    renderCard();

    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Sync Now'));

    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeDisabled();
      expect(screen.getByText(/Available in \d+s/)).toBeInTheDocument();
    });
  });

  it('re-enables button after cooldown expires', async () => {
    const syncResult = {
      status: 'success',
      summary: {
        services: { created: 0, updated: 0, deactivated: 0, deleted: 0, drift_flagged: 0, unchanged: 0 },
        aliases: { created: 0, updated: 0, removed: 0, unchanged: 0 },
        overrides: { created: 0, updated: 0, removed: 0, unchanged: 0 },
        associations: { created: 0, removed: 0, unchanged: 0 },
      },
      errors: [],
      warnings: [],
      changes: [],
      duration_ms: 100,
    };

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }))
      .mockResolvedValueOnce(jsonResponse({ result: syncResult }))
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }));

    renderCard();

    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Sync Now'));

    await waitFor(() => {
      expect(screen.getByText(/Available in/)).toBeInTheDocument();
    });

    // Advance past the 60s cooldown
    act(() => {
      jest.advanceTimersByTime(61000);
    });

    expect(screen.getByText('Sync Now')).not.toBeDisabled();
    expect(screen.queryByText(/Available in/)).not.toBeInTheDocument();
  });

  it('calls triggerSync API on Sync Now click', async () => {
    const syncResult = {
      status: 'success',
      summary: {
        services: { created: 0, updated: 0, deactivated: 0, deleted: 0, drift_flagged: 0, unchanged: 0 },
        aliases: { created: 0, updated: 0, removed: 0, unchanged: 0 },
        overrides: { created: 0, updated: 0, removed: 0, unchanged: 0 },
        associations: { created: 0, removed: 0, unchanged: 0 },
      },
      errors: [],
      warnings: [],
      changes: [],
      duration_ms: 100,
    };

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }))
      .mockResolvedValueOnce(jsonResponse({ result: syncResult }))
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }));

    renderCard();

    await waitFor(() => {
      expect(screen.getByText('Sync Now')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Sync Now'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/teams/t1/manifest/sync',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('shows section title "Manifest Sync"', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ config: null }))
      .mockResolvedValueOnce(jsonResponse({ summary: mockDriftSummary }));

    renderCard();

    await waitFor(() => {
      expect(screen.getByText('Manifest Sync')).toBeInTheDocument();
    });
  });
});
