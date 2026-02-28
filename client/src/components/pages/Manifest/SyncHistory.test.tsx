import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SyncHistory from './SyncHistory';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockEntry = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  team_id: 't1',
  trigger_type: 'manual',
  triggered_by: 'User One',
  manifest_url: 'https://example.com/manifest.json',
  status: 'success',
  summary: JSON.stringify({
    services: { created: 1, updated: 0, deactivated: 0, deleted: 0, drift_flagged: 0, unchanged: 2 },
    aliases: { created: 0, updated: 0, removed: 0, unchanged: 0 },
    overrides: { created: 0, updated: 0, removed: 0, unchanged: 0 },
    associations: { created: 0, removed: 0, unchanged: 0 },
  }),
  errors: null,
  warnings: null,
  duration_ms: 500,
  created_at: '2024-06-15T10:30:00Z',
  ...overrides,
});

beforeEach(() => {
  mockFetch.mockReset();
});

describe('SyncHistory', () => {
  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));
    render(<SyncHistory teamId="t1" />);
    expect(screen.getByText('Loading sync history...')).toBeInTheDocument();
  });

  it('shows empty state when no history', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ history: [], total: 0 }));
    render(<SyncHistory teamId="t1" />);
    await waitFor(() => {
      expect(screen.getByText('No sync history yet.')).toBeInTheDocument();
    });
  });

  it('shows error state', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'fail' }, 500));
    render(<SyncHistory teamId="t1" />);
    await waitFor(() => {
      expect(screen.getByText(/fail/i)).toBeInTheDocument();
    });
  });

  it('renders history entries', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        history: [mockEntry('h1'), mockEntry('h2', { trigger_type: 'scheduled', triggered_by: null })],
        total: 2,
      })
    );
    render(<SyncHistory teamId="t1" />);

    await waitFor(() => {
      expect(screen.getByText('manual')).toBeInTheDocument();
    });
    expect(screen.getByText('scheduled')).toBeInTheDocument();
    expect(screen.getByText('by User One')).toBeInTheDocument();
  });

  it('shows summary counts for entries', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ history: [mockEntry('h1')], total: 1 })
    );
    render(<SyncHistory teamId="t1" />);

    await waitFor(() => {
      expect(screen.getByText(/\+1/)).toBeInTheDocument();
      expect(screen.getByText(/=2/)).toBeInTheDocument();
    });
  });

  it('shows duration for entries', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ history: [mockEntry('h1', { duration_ms: 1500 })], total: 1 })
    );
    render(<SyncHistory teamId="t1" />);

    await waitFor(() => {
      expect(screen.getByText('1.5s')).toBeInTheDocument();
    });
  });

  it('shows Load more button when hasMore', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        history: Array.from({ length: 20 }, (_, i) => mockEntry(`h${i}`)),
        total: 30,
      })
    );
    render(<SyncHistory teamId="t1" />);

    await waitFor(() => {
      expect(screen.getByText('Load more')).toBeInTheDocument();
    });
  });

  it('hides Load more when all loaded', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ history: [mockEntry('h1')], total: 1 })
    );
    render(<SyncHistory teamId="t1" />);

    await waitFor(() => {
      expect(screen.queryByText('Load more')).not.toBeInTheDocument();
    });
  });

  it('loads more entries on Load more click', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        history: Array.from({ length: 20 }, (_, i) => mockEntry(`h${i}`)),
        total: 25,
      })
    );
    render(<SyncHistory teamId="t1" />);

    await waitFor(() => {
      expect(screen.getByText('Load more')).toBeInTheDocument();
    });

    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        history: Array.from({ length: 5 }, (_, i) => mockEntry(`h${20 + i}`)),
        total: 25,
      })
    );

    fireEvent.click(screen.getByText('Load more'));

    await waitFor(() => {
      expect(screen.queryByText('Load more')).not.toBeInTheDocument();
    });
  });

  it('shows error entry with red dot and error text', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        history: [mockEntry('h1', {
          status: 'failed',
          summary: null,
          errors: JSON.stringify(['Fetch timeout']),
        })],
        total: 1,
      })
    );
    render(<SyncHistory teamId="t1" />);

    await waitFor(() => {
      expect(screen.getByText('Fetch timeout')).toBeInTheDocument();
    });
  });

  it('shows expandable warnings', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        history: [mockEntry('h1', {
          warnings: JSON.stringify(['Service X has unknown field']),
        })],
        total: 1,
      })
    );
    render(<SyncHistory teamId="t1" />);

    await waitFor(() => {
      expect(screen.getByText('▸ Show details')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('▸ Show details'));
    expect(screen.getByText('Service X has unknown field')).toBeInTheDocument();
  });
});
