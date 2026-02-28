import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ServicesList from './ServicesList';

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

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockServices = [
  {
    id: 's1',
    name: 'Service Alpha',
    team_id: 't1',
    team: { name: 'Team A' },
    health: { status: 'healthy', last_report: '2024-01-15T10:00:00Z', healthy_reports: 5, total_reports: 5 },
  },
  {
    id: 's2',
    name: 'Service Beta',
    team_id: 't2',
    team: { name: 'Team B' },
    health: { status: 'warning', last_report: '2024-01-15T09:00:00Z', healthy_reports: 3, total_reports: 5 },
  },
  {
    id: 's3',
    name: 'Service Gamma',
    team_id: 't1',
    team: { name: 'Team A' },
    health: { status: 'critical', last_report: null, healthy_reports: 0, total_reports: 0 },
  },
];

const mockTeams = [
  { id: 't1', name: 'Team A', service_count: 2 },
  { id: 't2', name: 'Team B', service_count: 1 },
];

const adminUser = {
  id: 'u1',
  name: 'Admin User',
  email: 'admin@example.com',
  role: 'admin' as const,
  is_active: true,
  teams: [
    { team_id: 't1', role: 'lead' as const, team: { id: 't1', name: 'Team A', description: null } },
    { team_id: 't2', role: 'lead' as const, team: { id: 't2', name: 'Team B', description: null } },
  ],
  permissions: { canManageUsers: true, canManageTeams: true, canManageServices: true },
};

const teamLeadUser = {
  id: 'u2',
  name: 'Team Lead',
  email: 'lead@example.com',
  role: 'user' as const,
  is_active: true,
  teams: [
    { team_id: 't1', role: 'lead' as const, team: { id: 't1', name: 'Team A', description: null } },
    { team_id: 't2', role: 'member' as const, team: { id: 't2', name: 'Team B', description: null } },
  ],
  permissions: { canManageUsers: false, canManageTeams: false, canManageServices: true },
};

const memberUser = {
  id: 'u3',
  name: 'Member User',
  email: 'member@example.com',
  role: 'user' as const,
  is_active: true,
  teams: [
    { team_id: 't1', role: 'member' as const, team: { id: 't1', name: 'Team A', description: null } },
  ],
  permissions: { canManageUsers: false, canManageTeams: false, canManageServices: false },
};

interface RenderOptions {
  user?: typeof adminUser | typeof teamLeadUser | typeof memberUser;
  isAdmin?: boolean;
  canManageServices?: boolean;
}

function renderServicesList(options: RenderOptions = {}) {
  const { user = memberUser, isAdmin = false, canManageServices = false } = options;
  mockUseAuth.mockReturnValue({ user, isAdmin, canManageServices });
  return render(
    <MemoryRouter>
      <ServicesList />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  mockUseAuth.mockReset();
  localStorage.clear();
});

describe('ServicesList', () => {
  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    renderServicesList();

    expect(screen.getByText('Loading services...')).toBeInTheDocument();
  });

  it('displays services after loading', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList({ user: adminUser, isAdmin: true, canManageServices: true });

    await waitFor(() => {
      expect(screen.getByText('Services')).toBeInTheDocument();
    });

    expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    expect(screen.getByText('Service Beta')).toBeInTheDocument();
    expect(screen.getByText('Service Gamma')).toBeInTheDocument();
  });

  it('displays error state and allows retry', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList();

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    });
  });

  it('filters services by search query', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList({ user: adminUser, isAdmin: true, canManageServices: true });

    await waitFor(() => {
      expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Search services...'), {
      target: { value: 'alpha' },
    });

    expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Service Beta')).not.toBeInTheDocument();
    expect(screen.queryByText('Service Gamma')).not.toBeInTheDocument();
  });

  it('filters services by team for admin users', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList({ user: adminUser, isAdmin: true, canManageServices: true });

    await waitFor(() => {
      expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    });

    const teamSelect = screen.getByLabelText('Filter by team');
    expect(teamSelect).toBeInTheDocument();

    fireEvent.change(teamSelect, { target: { value: 't2' } });

    expect(screen.getByText('Service Beta')).toBeInTheDocument();
    expect(screen.queryByText('Service Alpha')).not.toBeInTheDocument();
    expect(screen.queryByText('Service Gamma')).not.toBeInTheDocument();
  });

  it('shows "All Teams" label in team filter for admin', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList({ user: adminUser, isAdmin: true, canManageServices: true });

    await waitFor(() => {
      expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    });

    const options = screen.getByLabelText('Filter by team').querySelectorAll('option');
    expect(options[0].textContent).toBe('All Teams');
  });

  it('shows "My Teams" label in team filter for non-admin', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList({ user: teamLeadUser, canManageServices: true });

    await waitFor(() => {
      expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    });

    const options = screen.getByLabelText('Filter by team').querySelectorAll('option');
    expect(options[0].textContent).toBe('My Teams');
  });

  it('shows only user teams in filter dropdown for non-admin', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList({ user: teamLeadUser, canManageServices: true });

    await waitFor(() => {
      expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    });

    const teamSelect = screen.getByLabelText('Filter by team');
    const options = teamSelect.querySelectorAll('option');
    // "My Teams" + Team A + Team B (user is member of both)
    expect(options).toHaveLength(3);
    expect(options[1].textContent).toBe('Team A');
    expect(options[2].textContent).toBe('Team B');
  });

  it('hides team filter when user belongs to only one team', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList({ user: memberUser });

    await waitFor(() => {
      expect(screen.getByText('Services')).toBeInTheDocument();
    });

    expect(screen.queryByLabelText('Filter by team')).not.toBeInTheDocument();
  });

  it('shows empty state when no services match', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList({ user: adminUser, isAdmin: true, canManageServices: true });

    await waitFor(() => {
      expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Search services...'), {
      target: { value: 'nonexistent' },
    });

    expect(screen.getByText('No services match your search criteria.')).toBeInTheDocument();
  });

  it('shows admin empty state when no services exist for admin', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList({ user: adminUser, isAdmin: true, canManageServices: true });

    await waitFor(() => {
      expect(screen.getByText('No services have been added yet.')).toBeInTheDocument();
    });
  });

  it('shows team-scoped empty state when no services exist for non-admin', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList({ user: memberUser });

    await waitFor(() => {
      expect(screen.getByText('No services found for your team(s).')).toBeInTheDocument();
    });
  });

  it('shows add button for admin users', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList({ user: adminUser, isAdmin: true, canManageServices: true });

    await waitFor(() => {
      expect(screen.getByText('Add Service')).toBeInTheDocument();
    });
  });

  it('shows add button for team lead users', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList({ user: teamLeadUser, canManageServices: true });

    await waitFor(() => {
      expect(screen.getByText('Add Service')).toBeInTheDocument();
    });
  });

  it('hides add button for regular member users', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList({ user: memberUser });

    await waitFor(() => {
      expect(screen.getByText('Services')).toBeInTheDocument();
    });

    expect(screen.queryByText('Add Service')).not.toBeInTheDocument();
  });

  it('shows add button in empty state for team lead', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList({ user: teamLeadUser, canManageServices: true });

    await waitFor(() => {
      expect(screen.getByText('No services found for your team(s).')).toBeInTheDocument();
    });

    expect(screen.getByText('Add your first service')).toBeInTheDocument();
  });

  it('hides add button in empty state for regular member', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList({ user: memberUser });

    await waitFor(() => {
      expect(screen.getByText('No services found for your team(s).')).toBeInTheDocument();
    });

    expect(screen.queryByText('Add your first service')).not.toBeInTheDocument();
  });

  it('toggles auto-refresh polling', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList();

    await waitFor(() => {
      expect(screen.getByText('Auto-refresh')).toBeInTheDocument();
    });

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(localStorage.getItem('services-auto-refresh')).toBe('false');
  });

  it('displays dependent reports count', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList();

    await waitFor(() => {
      expect(screen.getByText('5/5')).toBeInTheDocument();
    });

    expect(screen.getByText('3/5')).toBeInTheDocument();
    expect(screen.getByText('No dependents')).toBeInTheDocument();
  });

  it('opens add service modal when button clicked', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList({ user: adminUser, isAdmin: true, canManageServices: true });

    await waitFor(() => {
      expect(screen.getByText('Add Service')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Service'));

    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument();
  });

  describe('manifest badges', () => {
    const manifestServices = [
      {
        id: 's1',
        name: 'Manifest Service',
        team_id: 't1',
        team: { name: 'Team A' },
        manifest_managed: 1,
        health: { status: 'healthy', last_report: '2024-01-15T10:00:00Z', healthy_reports: 5, total_reports: 5 },
      },
      {
        id: 's2',
        name: 'Regular Service',
        team_id: 't1',
        team: { name: 'Team A' },
        manifest_managed: 0,
        health: { status: 'healthy', last_report: '2024-01-15T10:00:00Z', healthy_reports: 3, total_reports: 3 },
      },
    ];

    it('shows [M] badge for manifest-managed services', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(manifestServices))
        .mockResolvedValueOnce(jsonResponse(mockTeams));

      renderServicesList({ user: adminUser, isAdmin: true });

      await waitFor(() => {
        expect(screen.getByText('Manifest Service')).toBeInTheDocument();
      });

      const badges = screen.getAllByTitle('Managed by manifest');
      expect(badges).toHaveLength(1);
      expect(badges[0].textContent).toBe('M');
    });

    it('does not show [M] badge for non-manifest services', async () => {
      const nonManifestServices = [
        {
          id: 's1',
          name: 'Regular Service',
          team_id: 't1',
          team: { name: 'Team A' },
          manifest_managed: 0,
          health: { status: 'healthy', last_report: '2024-01-15T10:00:00Z', healthy_reports: 3, total_reports: 3 },
        },
      ];

      mockFetch
        .mockResolvedValueOnce(jsonResponse(nonManifestServices))
        .mockResolvedValueOnce(jsonResponse(mockTeams));

      renderServicesList({ user: adminUser, isAdmin: true });

      await waitFor(() => {
        expect(screen.getByText('Regular Service')).toBeInTheDocument();
      });

      expect(screen.queryByTitle('Managed by manifest')).not.toBeInTheDocument();
    });
  });
});
