import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TeamDetail from './TeamDetail';

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock HTMLDialogElement
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = jest.fn();
  HTMLDialogElement.prototype.close = jest.fn();
});

// Mock auth context
const mockUseAuth = jest.fn();
jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock useNavigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Mock AlertChannels, AlertRules, AlertHistory, AlertMutes
jest.mock('./AlertChannels', () => {
  const AlertChannels = () => <div data-testid="alert-channels" />;
  AlertChannels.displayName = 'AlertChannels';
  return AlertChannels;
});
jest.mock('./AlertRules', () => {
  const AlertRules = () => <div data-testid="alert-rules" />;
  AlertRules.displayName = 'AlertRules';
  return AlertRules;
});
jest.mock('./AlertHistory', () => {
  const AlertHistory = () => <div data-testid="alert-history" />;
  AlertHistory.displayName = 'AlertHistory';
  return AlertHistory;
});
jest.mock('./AlertMutes', () => {
  const AlertMutes = () => <div data-testid="alert-mutes" />;
  AlertMutes.displayName = 'AlertMutes';
  return AlertMutes;
});

// Mock useManifestConfigs
const mockLoadManifestConfigs = jest.fn();
const mockUseManifestConfigs = jest.fn();
jest.mock('../../../hooks/useManifestConfigs', () => ({
  useManifestConfigs: (...args: unknown[]) => mockUseManifestConfigs(...args),
}));

// Mock ManifestList
jest.mock('../Manifest/ManifestList', () => {
  const ManifestList = () => <div data-testid="manifest-list" />;
  ManifestList.displayName = 'ManifestList';
  return ManifestList;
});

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockUsers = [
  { id: 'u1', name: 'User One', email: 'user1@example.com' },
  { id: 'u2', name: 'User Two', email: 'user2@example.com' },
];

const mockTeam = {
  id: 't1',
  name: 'Test Team',
  description: 'Test description',
  members: [
    { user_id: 'u1', role: 'lead', user: { name: 'User One', email: 'user1@example.com' } },
    { user_id: 'u2', role: 'member', user: { name: 'User Two', email: 'user2@example.com' } },
  ],
  services: [
    { id: 's1', name: 'Service A', is_active: 1 },
    { id: 's2', name: 'Service B', is_active: 0 },
  ],
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

function renderTeamDetail(id = 't1', isAdmin = false, initialTab?: string) {
  mockUseAuth.mockReturnValue({ isAdmin });
  const path = initialTab ? `/teams/${id}?tab=${initialTab}` : `/teams/${id}`;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/teams/:id" element={<TeamDetail />} />
        <Route path="/teams" element={<div>Teams List</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  mockUseAuth.mockReset();
  mockNavigate.mockReset();
  mockLoadManifestConfigs.mockReset();
  mockUseManifestConfigs.mockReturnValue({
    configs: [],
    isLoading: false,
    error: null,
    isCreating: false,
    loadConfigs: mockLoadManifestConfigs,
    createConfig: jest.fn(),
    clearError: jest.fn(),
  });
  localStorage.clear();
});

describe('TeamDetail', () => {
  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    renderTeamDetail();

    expect(screen.getByText('Loading team...')).toBeInTheDocument();
  });

  it('displays team details after loading', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTeam))
      .mockResolvedValueOnce(jsonResponse(mockUsers));

    renderTeamDetail();

    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument();
    });

    expect(screen.getByText('Test description')).toBeInTheDocument();
  });

  it('displays error state and allows retry', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(jsonResponse([]))             // alert channels (initial)
      .mockResolvedValueOnce(jsonResponse(mockTeam));      // retry: team

    renderTeamDetail();

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument();
    });
  });

  it('shows not found state for missing team', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(null));

    renderTeamDetail();

    await waitFor(() => {
      expect(screen.getByText('Team not found')).toBeInTheDocument();
    });

    expect(screen.getByText('Back to Teams')).toBeInTheDocument();
  });

  it('shows admin actions for admin users', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTeam))
      .mockResolvedValueOnce(jsonResponse(mockUsers));

    renderTeamDetail('t1', true);

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });
  });

  it('hides admin actions for non-admin users', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTeam))
      .mockResolvedValueOnce(jsonResponse([]));

    renderTeamDetail('t1', false);

    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument();
    });

    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('opens edit modal when edit button clicked', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTeam))
      .mockResolvedValueOnce(jsonResponse(mockUsers));

    renderTeamDetail('t1', true);

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Edit'));

    expect(screen.getByText('Edit Team')).toBeInTheDocument();
  });

  it('opens delete confirmation dialog', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTeam))
      .mockResolvedValueOnce(jsonResponse(mockUsers));

    renderTeamDetail('t1', true);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete'));

    expect(screen.getByText('Delete Team')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
  });

  it('displays back link to teams list', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTeam))
      .mockResolvedValueOnce(jsonResponse([]));

    renderTeamDetail();

    await waitFor(() => {
      expect(screen.getByText('Back to Teams')).toBeInTheDocument();
    });
  });

  it('shows team without description', async () => {
    const teamNoDesc = { ...mockTeam, description: null };
    mockFetch
      .mockResolvedValueOnce(jsonResponse(teamNoDesc))
      .mockResolvedValueOnce(jsonResponse([]));

    renderTeamDetail();

    await waitFor(() => {
      expect(screen.getByText('Test Team')).toBeInTheDocument();
    });

    expect(screen.queryByText('Test description')).not.toBeInTheDocument();
  });

  describe('tabs', () => {
    it('renders all tab buttons', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse([]));

      renderTeamDetail();

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /Overview/ })).toBeInTheDocument();
      });

      expect(screen.getByRole('tab', { name: /Members/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Manifests/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Services/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Alerts Config/ })).toBeInTheDocument();
    });

    it('defaults to overview tab', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse([]));

      renderTeamDetail();

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /Overview/ })).toHaveAttribute('aria-selected', 'true');
      });
    });

    it('shows overview content by default and hides other tab content', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse([]));

      renderTeamDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Team')).toBeInTheDocument();
      });

      // Members content should not be visible
      expect(screen.queryByText('user1@example.com')).not.toBeInTheDocument();
    });

    it('switches tab content when clicking a tab', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse([]));

      renderTeamDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Team')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('tab', { name: /Members/ }));

      expect(screen.getByText('User One')).toBeInTheDocument();
      expect(screen.getByText('user1@example.com')).toBeInTheDocument();
    });

    it('respects URL param for initial tab', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse([]));

      renderTeamDetail('t1', false, 'services');

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /Services/ })).toHaveAttribute('aria-selected', 'true');
      });

      expect(screen.getByText('Service A')).toBeInTheDocument();
    });

    it('shows member count in tab label', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse([]));

      renderTeamDetail();

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /Members \(2\)/ })).toBeInTheDocument();
      });
    });

    it('shows service count in tab label', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse([]));

      renderTeamDetail();

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /Services \(2\)/ })).toBeInTheDocument();
      });
    });
  });

  describe('members tab', () => {
    it('displays members with roles', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse(mockUsers));

      renderTeamDetail('t1', false, 'members');

      await waitFor(() => {
        expect(screen.getByText('User One')).toBeInTheDocument();
      });

      expect(screen.getByText('user1@example.com')).toBeInTheDocument();
      expect(screen.getByText('Lead')).toBeInTheDocument();
      expect(screen.getByText('Member')).toBeInTheDocument();
    });

    it('shows empty state for no members', async () => {
      const teamNoMembers = { ...mockTeam, members: [] };
      mockFetch
        .mockResolvedValueOnce(jsonResponse(teamNoMembers))
        .mockResolvedValueOnce(jsonResponse(mockUsers));

      renderTeamDetail('t1', false, 'members');

      await waitFor(() => {
        expect(screen.getByText('No members in this team yet.')).toBeInTheDocument();
      });
    });

    it('displays add member form for admin with available users', async () => {
      const availableUsers = [{ id: 'u3', name: 'User Three', email: 'user3@example.com' }];
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse(availableUsers));

      renderTeamDetail('t1', true, 'members');

      await waitFor(() => {
        expect(screen.getByText('User')).toBeInTheDocument();
      });

      expect(screen.getByText('Add Member')).toBeInTheDocument();
      expect(screen.getByText('User Three (user3@example.com)')).toBeInTheDocument();
    });

    it('hides add member form when no available users', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse([]));

      renderTeamDetail('t1', true, 'members');

      await waitFor(() => {
        expect(screen.getByText('User One')).toBeInTheDocument();
      });

      expect(screen.queryByText('Add Member')).not.toBeInTheDocument();
    });

    it('adds member to team', async () => {
      const availableUsers = [{ id: 'u3', name: 'User Three', email: 'user3@example.com' }];
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse(availableUsers))
        .mockResolvedValueOnce(jsonResponse([]))              // alert channels
        .mockResolvedValueOnce(jsonResponse({ success: true }))
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse([]));

      renderTeamDetail('t1', true, 'members');

      await waitFor(() => {
        expect(screen.getByText('User Three (user3@example.com)')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByDisplayValue('Select a user...'), {
        target: { value: 'u3' },
      });

      fireEvent.click(screen.getByText('Add Member'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/teams/t1/members',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ user_id: 'u3', role: 'member' }),
          })
        );
      });
    });

    it('adds member as lead', async () => {
      const availableUsers = [{ id: 'u3', name: 'User Three', email: 'user3@example.com' }];
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse(availableUsers))
        .mockResolvedValueOnce(jsonResponse([]))              // alert channels
        .mockResolvedValueOnce(jsonResponse({ success: true }))
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse([]));

      renderTeamDetail('t1', true, 'members');

      await waitFor(() => {
        expect(screen.getByText('User Three (user3@example.com)')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByDisplayValue('Select a user...'), {
        target: { value: 'u3' },
      });

      fireEvent.change(screen.getByDisplayValue('Member'), {
        target: { value: 'lead' },
      });

      fireEvent.click(screen.getByText('Add Member'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/teams/t1/members',
          expect.objectContaining({
            body: JSON.stringify({ user_id: 'u3', role: 'lead' }),
          })
        );
      });
    });

    it('promotes member to lead', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse([]))
        .mockResolvedValueOnce(jsonResponse([]))              // alert channels
        .mockResolvedValueOnce(jsonResponse({ success: true }))
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse([]));

      renderTeamDetail('t1', true, 'members');

      await waitFor(() => {
        expect(screen.getByText('User Two')).toBeInTheDocument();
      });

      const promoteButton = screen.getByText('Promote');
      fireEvent.click(promoteButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/teams/t1/members/u2',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ role: 'lead' }),
          })
        );
      });
    });

    it('demotes lead to member', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse([]))
        .mockResolvedValueOnce(jsonResponse([]))              // alert channels
        .mockResolvedValueOnce(jsonResponse({ success: true }))
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse([]));

      renderTeamDetail('t1', true, 'members');

      await waitFor(() => {
        expect(screen.getByText('User One')).toBeInTheDocument();
      });

      const demoteButton = screen.getByText('Demote');
      fireEvent.click(demoteButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/teams/t1/members/u1',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ role: 'member' }),
          })
        );
      });
    });

    it('removes member from team', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse([]))
        .mockResolvedValueOnce(jsonResponse([]))              // alert channels
        .mockResolvedValueOnce(jsonResponse({ success: true }))
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse([]));

      renderTeamDetail('t1', true, 'members');

      await waitFor(() => {
        expect(screen.getByText('User Two')).toBeInTheDocument();
      });

      const removeButtons = screen.getAllByText('Remove');
      fireEvent.click(removeButtons[0]);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/teams/t1/members/u1',
          expect.objectContaining({ method: 'DELETE' })
        );
      });
    });

    it('hides member actions for non-admin users', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse([]));

      renderTeamDetail('t1', false, 'members');

      await waitFor(() => {
        expect(screen.getByText('User One')).toBeInTheDocument();
      });

      expect(screen.queryByText('Promote')).not.toBeInTheDocument();
      expect(screen.queryByText('Demote')).not.toBeInTheDocument();
      expect(screen.queryByText('Remove')).not.toBeInTheDocument();
    });

    it('displays add member error', async () => {
      const availableUsers = [{ id: 'u3', name: 'User Three', email: 'user3@example.com' }];
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse(availableUsers))
        .mockResolvedValueOnce(jsonResponse([]))              // alert channels
        .mockRejectedValueOnce(new Error('Failed to add member'));

      renderTeamDetail('t1', true, 'members');

      await waitFor(() => {
        expect(screen.getByText('User Three (user3@example.com)')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByDisplayValue('Select a user...'), {
        target: { value: 'u3' },
      });

      fireEvent.click(screen.getByText('Add Member'));

      await waitFor(() => {
        expect(screen.getByText('Failed to add member')).toBeInTheDocument();
      });
    });

    it('disables add member button when no user selected', async () => {
      const availableUsers = [{ id: 'u3', name: 'User Three', email: 'user3@example.com' }];
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse(availableUsers));

      renderTeamDetail('t1', true, 'members');

      await waitFor(() => {
        expect(screen.getByText('Add Member')).toBeInTheDocument();
      });

      expect(screen.getByText('Add Member')).toBeDisabled();
    });

    it('shows error inline after team is loaded', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse([]))
        .mockResolvedValueOnce(jsonResponse([]))              // alert channels
        .mockRejectedValueOnce(new Error('Action failed'));

      renderTeamDetail('t1', true, 'members');

      await waitFor(() => {
        expect(screen.getByText('User One')).toBeInTheDocument();
      });

      const removeButtons = screen.getAllByText('Remove');
      fireEvent.click(removeButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Action failed')).toBeInTheDocument();
      });
    });
  });

  describe('services tab', () => {
    it('displays services list', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse(mockUsers));

      renderTeamDetail('t1', false, 'services');

      await waitFor(() => {
        expect(screen.getByText('Service A')).toBeInTheDocument();
      });

      expect(screen.getByText('Service B')).toBeInTheDocument();
      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });

    it('shows empty state for no services', async () => {
      const teamNoServices = { ...mockTeam, services: [] };
      mockFetch
        .mockResolvedValueOnce(jsonResponse(teamNoServices))
        .mockResolvedValueOnce(jsonResponse(mockUsers));

      renderTeamDetail('t1', false, 'services');

      await waitFor(() => {
        expect(screen.getByText('No services assigned to this team yet.')).toBeInTheDocument();
      });
    });

    it('shows [M] badge for manifest-managed services', async () => {
      const teamWithManifest = {
        ...mockTeam,
        services: [
          { id: 's1', name: 'Manifest Service', is_active: 1, manifest_managed: 1 },
          { id: 's2', name: 'Regular Service', is_active: 1, manifest_managed: 0 },
        ],
      };

      mockFetch
        .mockResolvedValueOnce(jsonResponse(teamWithManifest))
        .mockResolvedValueOnce(jsonResponse([]));

      renderTeamDetail('t1', false, 'services');

      await waitFor(() => {
        expect(screen.getByText('Manifest Service')).toBeInTheDocument();
      });

      const badges = screen.getAllByTitle('Managed by manifest');
      expect(badges).toHaveLength(1);
      expect(badges[0].textContent).toBe('M');
    });

    it('does not show [M] badge for non-manifest services', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse([]));

      renderTeamDetail('t1', false, 'services');

      await waitFor(() => {
        expect(screen.getByText('Service A')).toBeInTheDocument();
      });

      expect(screen.queryByTitle('Managed by manifest')).not.toBeInTheDocument();
    });
  });

  describe('manifests tab', () => {
    it('renders ManifestList component', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse([]));

      renderTeamDetail('t1', false, 'manifests');

      await waitFor(() => {
        expect(screen.getByTestId('manifest-list')).toBeInTheDocument();
      });
    });
  });

  describe('alerts tab', () => {
    it('renders all alert sub-sections', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockTeam))
        .mockResolvedValueOnce(jsonResponse([]));

      renderTeamDetail('t1', false, 'alerts');

      await waitFor(() => {
        expect(screen.getByTestId('alert-channels')).toBeInTheDocument();
      });

      expect(screen.getByTestId('alert-rules')).toBeInTheDocument();
      expect(screen.getByTestId('alert-mutes')).toBeInTheDocument();
      expect(screen.getByTestId('alert-history')).toBeInTheDocument();
    });
  });

  describe('team key badge', () => {
    it('displays key badge when team has a key', async () => {
      const teamWithKey = { ...mockTeam, key: 'platform-team' };
      mockFetch
        .mockResolvedValueOnce(jsonResponse(teamWithKey))
        .mockResolvedValueOnce(jsonResponse([]));

      renderTeamDetail();

      await waitFor(() => {
        expect(screen.getByText('platform-team')).toBeInTheDocument();
      });

      expect(screen.getByText('platform-team').tagName).toBe('CODE');
    });

    it('does not render key badge when team key is null', async () => {
      const teamNoKey = { ...mockTeam, key: null };
      mockFetch
        .mockResolvedValueOnce(jsonResponse(teamNoKey))
        .mockResolvedValueOnce(jsonResponse([]));

      renderTeamDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Team')).toBeInTheDocument();
      });

      const codeElements = document.querySelectorAll('code');
      codeElements.forEach((el) => {
        expect(el.textContent).not.toBe('');
      });
    });
  });
});
