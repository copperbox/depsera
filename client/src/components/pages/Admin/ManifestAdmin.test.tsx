import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ManifestAdmin from './ManifestAdmin';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockEntries = [
  {
    team_id: 't1',
    team_name: 'Alpha Team',
    team_key: 'alpha-team',
    contact: JSON.stringify({ email: 'alpha@example.com' }),
    has_config: true,
    manifest_url: 'https://example.com/manifest.json',
    is_enabled: true,
    last_sync_at: new Date().toISOString(),
    last_sync_status: 'success',
    last_sync_error: null,
    last_sync_summary: null,
    pending_drift_count: 2,
  },
  {
    team_id: 't2',
    team_name: 'Beta Team',
    team_key: 'beta-team',
    contact: null,
    has_config: false,
    manifest_url: null,
    is_enabled: false,
    last_sync_at: null,
    last_sync_status: null,
    last_sync_error: null,
    last_sync_summary: null,
    pending_drift_count: 0,
  },
];

function renderWithRouter() {
  return render(
    <MemoryRouter>
      <ManifestAdmin />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('ManifestAdmin', () => {
  it('renders loading state initially', () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithRouter();
    expect(screen.getByText('Loading manifest configurations...')).toBeInTheDocument();
  });

  it('renders table with entries', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockEntries));

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('Alpha Team')).toBeInTheDocument();
    });

    expect(screen.getByText('Beta Team')).toBeInTheDocument();
    // "Enabled" appears as both the table header and badge — check the badge exists
    const enabledBadges = screen.getAllByText('Enabled');
    expect(enabledBadges.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('success')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders error state', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'Server error' }, 500));

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('filters entries by search query', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockEntries));

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('Alpha Team')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Search teams...'), {
      target: { value: 'beta' },
    });

    expect(screen.queryByText('Alpha Team')).not.toBeInTheDocument();
    expect(screen.getByText('Beta Team')).toBeInTheDocument();
  });

  it('shows contact summary in table', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockEntries));

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('Alpha Team')).toBeInTheDocument();
    });

    expect(screen.getByText('email: alpha@example.com')).toBeInTheDocument();
  });

  it('handles sync all button', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockEntries));

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('Alpha Team')).toBeInTheDocument();
    });

    // Mock sync-all response followed by data reload
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        results: [{ team_id: 't1', team_name: 'Alpha Team', status: 'success' }],
      })
    );
    mockFetch.mockResolvedValueOnce(jsonResponse(mockEntries));

    fireEvent.click(screen.getByText('Sync All'));

    await waitFor(() => {
      expect(screen.getByText('Sync Results')).toBeInTheDocument();
    });
  });

  it('handles empty state', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('No teams found.')).toBeInTheDocument();
    });
  });

  it('shows "Never" for teams without last sync', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockEntries));

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('Never')).toBeInTheDocument();
    });
  });

  it('renders dash for teams without manifest config', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockEntries));

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('Beta Team')).toBeInTheDocument();
    });

    // Beta team should show dashes for URL, status
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });
});
