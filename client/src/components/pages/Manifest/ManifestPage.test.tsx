import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ManifestPage from './ManifestPage';

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = jest.fn();
  HTMLDialogElement.prototype.close = jest.fn();
});

const mockUseAuth = jest.fn();
jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock sub-components to isolate ManifestPage tests
jest.mock('./ManifestConfig', () => {
  const ManifestConfig = (props: { config: { manifest_url: string } }) => (
    <div data-testid="manifest-config">{props.config.manifest_url}</div>
  );
  ManifestConfig.displayName = 'ManifestConfig';
  return ManifestConfig;
});

jest.mock('./ManifestSyncResult', () => {
  const ManifestSyncResult = () => <div data-testid="manifest-sync-result" />;
  ManifestSyncResult.displayName = 'ManifestSyncResult';
  return ManifestSyncResult;
});

jest.mock('./SyncHistory', () => {
  const SyncHistory = () => <div data-testid="sync-history" />;
  SyncHistory.displayName = 'SyncHistory';
  return SyncHistory;
});

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockTeam = {
  id: 't1',
  name: 'Alpha Team',
  description: 'Test team',
  members: [],
  services: [],
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

const mockConfig = {
  id: 'mc1',
  team_id: 't1',
  manifest_url: 'https://example.com/manifest.json',
  is_enabled: 1,
  sync_policy: null,
  last_sync_at: new Date().toISOString(),
  last_sync_status: 'success',
  last_sync_error: null,
  last_sync_summary: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

function renderPage(id = 't1') {
  return render(
    <MemoryRouter initialEntries={[`/teams/${id}/manifest`]}>
      <Routes>
        <Route path="/teams/:id/manifest" element={<ManifestPage />} />
        <Route path="/teams/:id" element={<div>Team Detail</div>} />
        <Route path="/teams" element={<div>Teams List</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  mockUseAuth.mockReset();
  mockUseAuth.mockReturnValue({ user: { teams: [{ team_id: 't1', role: 'lead' }] }, isAdmin: false });
});

describe('ManifestPage', () => {
  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Loading manifest configuration...')).toBeInTheDocument();
  });

  it('shows team error state', async () => {
    mockFetch.mockRejectedValue(new Error('Not found'));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Failed to load team')).toBeInTheDocument();
    });
    expect(screen.getByText('Back to Teams')).toBeInTheDocument();
  });

  it('shows back link with team name', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTeam))        // fetchTeam
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig })); // getManifestConfig

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Back to Alpha Team/)).toBeInTheDocument();
    });
  });

  it('shows page title', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTeam))
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Manifest Configuration')).toBeInTheDocument();
    });
  });

  it('shows empty state when no manifest configured', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTeam))
      .mockResolvedValueOnce(jsonResponse({ config: null }));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/No manifest configured/)).toBeInTheDocument();
    });
  });

  it('shows Configure Manifest button for team leads when no config', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTeam))
      .mockResolvedValueOnce(jsonResponse({ config: null }));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Configure Manifest')).toBeInTheDocument();
    });
  });

  it('hides Configure Manifest button for non-managers', async () => {
    mockUseAuth.mockReturnValue({ user: { teams: [{ team_id: 't1', role: 'member' }] }, isAdmin: false });

    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTeam))
      .mockResolvedValueOnce(jsonResponse({ config: null }));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/No manifest configured/)).toBeInTheDocument();
    });
    expect(screen.queryByText('Configure Manifest')).not.toBeInTheDocument();
  });

  it('renders all sections when config exists', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTeam))
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Configuration')).toBeInTheDocument();
    });
    expect(screen.getByTestId('manifest-config')).toBeInTheDocument();
    expect(screen.getByTestId('manifest-sync-result')).toBeInTheDocument();
    expect(screen.getByText('Sync History')).toBeInTheDocument();
    expect(screen.getByTestId('sync-history')).toBeInTheDocument();
  });

  it('shows admin as manager', async () => {
    mockUseAuth.mockReturnValue({ user: { teams: [] }, isAdmin: true });

    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTeam))
      .mockResolvedValueOnce(jsonResponse({ config: null }));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Configure Manifest')).toBeInTheDocument();
    });
  });
});
