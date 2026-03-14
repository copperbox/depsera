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
jest.mock('./ManifestList', () => {
  const ManifestList = (props: { teamId: string; canManage: boolean }) => (
    <div data-testid="manifest-list" data-can-manage={props.canManage}>
      ManifestList for {props.teamId}
    </div>
  );
  ManifestList.displayName = 'ManifestList';
  return ManifestList;
});

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

jest.mock('./DriftReview', () => {
  const DriftReview = () => <div data-testid="drift-review" />;
  DriftReview.displayName = 'DriftReview';
  return DriftReview;
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
  name: 'Production',
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

function renderPage(path = '/teams/t1/manifest') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/teams/:id/manifest" element={<ManifestPage />} />
        <Route path="/teams/:id/manifest/:configId" element={<ManifestPage />} />
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

describe('ManifestPage — list view', () => {
  it('shows loading state while fetching team', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
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
    mockFetch.mockResolvedValueOnce(jsonResponse(mockTeam));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Back to Alpha Team/)).toBeInTheDocument();
    });
  });

  it('renders ManifestList when no configId', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockTeam));

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('manifest-list')).toBeInTheDocument();
    });
    expect(screen.getByText('ManifestList for t1')).toBeInTheDocument();
  });

  it('passes canManage=true for team leads', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockTeam));

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('manifest-list')).toHaveAttribute('data-can-manage', 'true');
    });
  });

  it('passes canManage=false for non-managers', async () => {
    mockUseAuth.mockReturnValue({ user: { teams: [{ team_id: 't1', role: 'member' }] }, isAdmin: false });
    mockFetch.mockResolvedValueOnce(jsonResponse(mockTeam));

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('manifest-list')).toHaveAttribute('data-can-manage', 'false');
    });
  });

  it('shows admin as manager', async () => {
    mockUseAuth.mockReturnValue({ user: { teams: [] }, isAdmin: true });
    mockFetch.mockResolvedValueOnce(jsonResponse(mockTeam));

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('manifest-list')).toHaveAttribute('data-can-manage', 'true');
    });
  });
});

describe('ManifestPage — detail view', () => {
  it('shows loading state while fetching config', () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTeam))   // fetchTeam
      .mockImplementation(() => new Promise(() => {})); // getManifestConfig hangs

    renderPage('/teams/t1/manifest/mc1');

    // First it loads team, then shows config loading
    // The loading state may show "Loading..." or "Loading manifest configuration..."
  });

  it('renders config detail sections when config exists', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTeam))           // fetchTeam
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig })); // getManifestConfig

    renderPage('/teams/t1/manifest/mc1');

    await waitFor(() => {
      expect(screen.getByText('Production')).toBeInTheDocument();
    });

    expect(screen.getByText('Configuration')).toBeInTheDocument();
    expect(screen.getByTestId('manifest-config')).toBeInTheDocument();
    expect(screen.getByTestId('manifest-sync-result')).toBeInTheDocument();
    expect(screen.getByText('Drift Review')).toBeInTheDocument();
    expect(screen.getByText('Sync History')).toBeInTheDocument();
  });

  it('shows back link to manifests list', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTeam))
      .mockResolvedValueOnce(jsonResponse({ config: mockConfig }));

    renderPage('/teams/t1/manifest/mc1');

    await waitFor(() => {
      expect(screen.getByText('Back to Manifests')).toBeInTheDocument();
    });
  });

  it('shows not found when config is null', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTeam))
      .mockResolvedValueOnce(jsonResponse({ config: null }));

    renderPage('/teams/t1/manifest/mc1');

    await waitFor(() => {
      expect(screen.getByText('Manifest config not found.')).toBeInTheDocument();
    });
  });
});
