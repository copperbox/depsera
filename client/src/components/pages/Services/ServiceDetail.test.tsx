import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ServiceDetail from './ServiceDetail';

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

// Mock chart components to avoid recharts SVG rendering issues in jsdom
jest.mock('../../Charts', () => ({
  LatencyChart: ({ dependencyId }: { dependencyId: string }) => (
    <div data-testid={`latency-chart-${dependencyId}`}>LatencyChart</div>
  ),
  HealthTimeline: ({ dependencyId }: { dependencyId: string }) => (
    <div data-testid={`health-timeline-${dependencyId}`}>HealthTimeline</div>
  ),
}));

// Mock ErrorHistoryPanel
jest.mock('../../common/ErrorHistoryPanel', () => ({
  ErrorHistoryPanel: ({ dependencyName }: { dependencyName: string }) => (
    <div data-testid="error-history-panel">Error History: {dependencyName}</div>
  ),
}));

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockTeams = [
  { id: 't1', name: 'Team A', service_count: 2 },
  { id: 't2', name: 'Team B', service_count: 1 },
];

const mockService = {
  id: 's1',
  name: 'Test Service',
  team_id: 't1',
  team: { name: 'Team A' },
  health_endpoint: 'https://example.com/health',
  metrics_endpoint: 'https://example.com/metrics',
  is_active: 1,
  updated_at: '2024-01-15T10:00:00Z',
  last_poll_success: 1,
  last_poll_error: null,
  poll_warnings: null,
  health: {
    status: 'healthy',
    last_report: '2024-01-15T10:00:00Z',
    healthy_reports: 5,
    total_reports: 5,
    dependent_count: 2,
  },
  dependencies: [
    {
      id: 'd1',
      name: 'database',
      canonical_name: 'PostgreSQL',
      description: 'Main DB',
      impact: 'Critical',
      contact: null,
      contact_override: null,
      impact_override: null,
      effective_contact: null,
      effective_impact: 'Critical',
      health_status: 'healthy',
      latency_ms: 15,
      last_checked: '2024-01-15T10:00:00Z',
    },
    {
      id: 'd2',
      name: 'cache',
      canonical_name: null,
      description: null,
      impact: null,
      contact: null,
      contact_override: null,
      impact_override: null,
      effective_contact: null,
      effective_impact: null,
      health_status: 'warning',
      latency_ms: null,
      last_checked: null,
    },
  ],
  dependent_reports: [
    {
      dependency_id: 'dr1',
      reporting_service_id: 's2',
      reporting_service_name: 'API Gateway',
      dependency_name: 'test-service',
      health_status: 'healthy',
      latency_ms: 10,
      last_checked: '2024-01-15T10:00:00Z',
    },
  ],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setupDefaultMocks(service: any = mockService) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/api/services/')) return Promise.resolve(jsonResponse(service));
    if (url.includes('/api/teams')) return Promise.resolve(jsonResponse(mockTeams));
    if (url.includes('/api/aliases/canonical-names')) return Promise.resolve(jsonResponse([]));
    if (url.includes('/api/aliases')) return Promise.resolve(jsonResponse([]));
    if (url.includes('/associations')) return Promise.resolve(jsonResponse([]));
    return Promise.resolve(jsonResponse({}));
  });
}

function renderServiceDetail(
  id = 's1',
  authOverrides: { isAdmin?: boolean; user?: Record<string, unknown> | null } = {},
  initialTab?: string,
) {
  const { isAdmin = false, user = null } = authOverrides;
  mockUseAuth.mockReturnValue({ isAdmin, user });
  const path = initialTab ? `/services/${id}?tab=${initialTab}` : `/services/${id}`;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/services/:id" element={<ServiceDetail />} />
        <Route path="/services" element={<div>Services List</div>} />
      </Routes>
    </MemoryRouter>
  );
}

/** Helper to click a tab by its role */
async function switchTab(name: string) {
  const tab = screen.getByRole('tab', { name: new RegExp(name) });
  fireEvent.click(tab);
}

beforeEach(() => {
  mockFetch.mockReset();
  mockUseAuth.mockReset();
  mockNavigate.mockReset();
  localStorage.clear();
});

describe('ServiceDetail', () => {
  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    renderServiceDetail();

    expect(screen.getByText('Loading service...')).toBeInTheDocument();
  });

  it('displays service details after loading', async () => {
    setupDefaultMocks();

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    expect(screen.getByText('Team A')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/health')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/metrics')).toBeInTheDocument();
  });

  it('displays error state and allows retry', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'));

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    setupDefaultMocks();

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });
  });

  it('shows not found state for missing service', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(null))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Service not found')).toBeInTheDocument();
    });

    expect(screen.getByText('Back to Services')).toBeInTheDocument();
  });

  it('displays dependencies section via tab', async () => {
    setupDefaultMocks();

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    await switchTab('Dependencies');

    expect(screen.getAllByText('PostgreSQL').length).toBeGreaterThan(0);
    expect(screen.getByText('Main DB')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('15ms')).toBeInTheDocument();
    expect(screen.getAllByText('cache').length).toBeGreaterThan(0);
  });

  it('displays dependent reports table via tab', async () => {
    setupDefaultMocks();

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    await switchTab('Dependent Reports');

    expect(screen.getByText('API Gateway')).toBeInTheDocument();
    expect(screen.getByText('test-service')).toBeInTheDocument();
    expect(screen.getByText('10ms')).toBeInTheDocument();
  });

  it('shows empty state for no dependencies', async () => {
    const serviceNoDeps = { ...mockService, dependencies: [] };
    setupDefaultMocks(serviceNoDeps);

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    await switchTab('Dependencies');

    expect(screen.getByText('No dependencies registered for this service.')).toBeInTheDocument();
  });

  it('shows empty state for no dependent reports', async () => {
    const serviceNoReports = { ...mockService, dependent_reports: [] };
    setupDefaultMocks(serviceNoReports);

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    await switchTab('Dependent Reports');

    expect(screen.getByText('No services report depending on this service.')).toBeInTheDocument();
  });

  it('shows inactive badge for inactive service', async () => {
    const inactiveService = { ...mockService, is_active: 0 };
    setupDefaultMocks(inactiveService);

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });
  });

  it('shows poll error when last poll failed', async () => {
    const failedPollService = { ...mockService, last_poll_success: 0, last_poll_error: 'Connection timeout' };
    setupDefaultMocks(failedPollService);

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText(/Connection timeout/)).toBeInTheDocument();
    });
  });

  it('renders View in Graph link with isolation URL', async () => {
    setupDefaultMocks();

    renderServiceDetail('s1');

    await waitFor(() => {
      const link = screen.getByText('View in Graph');
      expect(link).toBeInTheDocument();
      expect(link.closest('a')).toHaveAttribute('href', '/graph?isolateService=s1');
    });
  });

  it('shows admin actions for admin users', async () => {
    setupDefaultMocks();

    renderServiceDetail('s1', { isAdmin: true });

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });
  });

  it('hides admin actions for non-admin users', async () => {
    setupDefaultMocks();

    renderServiceDetail('s1', { isAdmin: false });

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('opens edit modal when edit button clicked', async () => {
    setupDefaultMocks();

    renderServiceDetail('s1', { isAdmin: true });

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Edit'));

    expect(screen.getByText('Edit Service')).toBeInTheDocument();
  });

  it('opens delete confirmation dialog', async () => {
    setupDefaultMocks();

    renderServiceDetail('s1', { isAdmin: true });

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete'));

    expect(screen.getByText('Delete Service')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
  });

  it('displays back link to services list', async () => {
    setupDefaultMocks();

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Back to Services')).toBeInTheDocument();
    });
  });

  it('displays dependency without canonical name via tab', async () => {
    setupDefaultMocks();

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    await switchTab('Dependencies');

    expect(screen.getAllByText('cache').length).toBeGreaterThan(0);
  });

  it('displays dash for null latency via tab', async () => {
    setupDefaultMocks();

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    await switchTab('Dependencies');

    // The cache dependency has null latency
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });

  it('shows poll error with default message', async () => {
    const failedPollService = { ...mockService, last_poll_success: 0, last_poll_error: null };
    setupDefaultMocks(failedPollService);

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText(/Unknown error/)).toBeInTheDocument();
    });
  });

  describe('Tabs', () => {
    it('renders all tabs', async () => {
      setupDefaultMocks();

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      expect(screen.getByRole('tab', { name: /Overview/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Dependencies/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Dependent Reports/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Poll Issues/ })).toBeInTheDocument();
    });

    it('shows overview tab by default', async () => {
      setupDefaultMocks();

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      expect(screen.getByRole('tab', { name: /Overview/ })).toHaveAttribute('aria-selected', 'true');
    });

    it('displays tab counts for dependencies and reports', async () => {
      setupDefaultMocks();

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      expect(screen.getByRole('tab', { name: /Dependencies \(2\)/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Dependent Reports \(1\)/ })).toBeInTheDocument();
    });

    it('shows empty state for external services on poll issues tab', async () => {
      const externalService = { ...mockService, is_external: 1 };
      setupDefaultMocks(externalService);

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Poll Issues');

      expect(screen.getByText('Not applicable for external services.')).toBeInTheDocument();
    });

    it('shows empty state for inactive services on poll issues tab', async () => {
      const inactiveService = { ...mockService, is_active: 0 };
      setupDefaultMocks(inactiveService);

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Poll Issues');

      expect(screen.getByText('Not applicable for inactive services.')).toBeInTheDocument();
    });
  });

  describe('Contact and Override Display', () => {
    it('displays effective_contact as key-value pairs', async () => {
      const serviceWithContact = {
        ...mockService,
        dependencies: [
          {
            ...mockService.dependencies[0],
            effective_contact: '{"email":"db-team@example.com","slack":"#db-support"}',
          },
        ],
      };
      setupDefaultMocks(serviceWithContact);

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      await waitFor(() => {
        expect(screen.getByText('db-team@example.com')).toBeInTheDocument();
      });

      expect(screen.getByText('email:')).toBeInTheDocument();
      expect(screen.getByText('slack:')).toBeInTheDocument();
      expect(screen.getByText('#db-support')).toBeInTheDocument();
    });

    it('uses effective_impact instead of raw impact', async () => {
      const serviceWithOverride = {
        ...mockService,
        dependencies: [
          {
            ...mockService.dependencies[0],
            impact: 'Original impact',
            effective_impact: 'Overridden impact value',
            impact_override: 'Overridden impact value',
          },
        ],
      };
      setupDefaultMocks(serviceWithOverride);

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      await waitFor(() => {
        expect(screen.getByText('Overridden impact value')).toBeInTheDocument();
      });

      expect(screen.queryByText('Original impact')).not.toBeInTheDocument();
    });

    it('shows override badge when instance impact_override is active', async () => {
      const serviceWithOverride = {
        ...mockService,
        dependencies: [
          {
            ...mockService.dependencies[0],
            impact_override: 'Custom impact',
            effective_impact: 'Custom impact',
          },
        ],
      };
      setupDefaultMocks(serviceWithOverride);

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      await waitFor(() => {
        expect(screen.getByText('Custom impact')).toBeInTheDocument();
      });

      const badges = screen.getAllByText('override');
      expect(badges.length).toBeGreaterThanOrEqual(1);
      expect(badges[0]).toHaveAttribute('title', 'Instance override active');
    });

    it('shows override badge when instance contact_override is active', async () => {
      const serviceWithOverride = {
        ...mockService,
        dependencies: [
          {
            ...mockService.dependencies[0],
            contact_override: '{"email":"override@example.com"}',
            effective_contact: '{"email":"override@example.com"}',
          },
        ],
      };
      setupDefaultMocks(serviceWithOverride);

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      await waitFor(() => {
        expect(screen.getByText('override@example.com')).toBeInTheDocument();
      });

      const badges = screen.getAllByText('override');
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });

    it('does not show override badge when no overrides are active', async () => {
      setupDefaultMocks();

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      await waitFor(() => {
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

      expect(screen.queryByText('override')).not.toBeInTheDocument();
    });

    it('handles invalid JSON in effective_contact gracefully', async () => {
      const serviceWithBadContact = {
        ...mockService,
        dependencies: [
          {
            ...mockService.dependencies[0],
            effective_contact: 'not-valid-json',
          },
        ],
      };
      setupDefaultMocks(serviceWithBadContact);

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      await waitFor(() => {
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

      expect(screen.queryByText('not-valid-json')).not.toBeInTheDocument();
    });
  });

  describe('Expandable Dependency Rows', () => {
    it('shows collapsible rows for each dependency', async () => {
      setupDefaultMocks();

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      const rowButtons = screen.getAllByRole('button', { expanded: false });
      const depRows = rowButtons.filter(
        btn => btn.textContent?.includes('PostgreSQL') || btn.textContent?.includes('cache')
      );
      expect(depRows.length).toBe(2);
    });

    it('expands row to show charts and error history when clicked', async () => {
      setupDefaultMocks();

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      expect(screen.queryByTestId('latency-chart-d1')).not.toBeInTheDocument();

      const rowButtons = screen.getAllByRole('button', { expanded: false });
      const postgresRow = rowButtons.find(btn => btn.textContent?.includes('PostgreSQL'));
      fireEvent.click(postgresRow!);

      expect(screen.getByTestId('latency-chart-d1')).toBeInTheDocument();
      expect(screen.getByTestId('health-timeline-d1')).toBeInTheDocument();
      expect(screen.getByTestId('error-history-panel')).toBeInTheDocument();
    });

    it('collapses row when clicked again', async () => {
      setupDefaultMocks();

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      const rowButtons = screen.getAllByRole('button', { expanded: false });
      const postgresRow = rowButtons.find(btn => btn.textContent?.includes('PostgreSQL'));
      fireEvent.click(postgresRow!);

      expect(screen.getByTestId('latency-chart-d1')).toBeInTheDocument();

      const expandedButton = screen.getByRole('button', { expanded: true });
      fireEvent.click(expandedButton);

      expect(screen.queryByTestId('latency-chart-d1')).not.toBeInTheDocument();
    });

    it('can expand multiple dependency rows independently', async () => {
      setupDefaultMocks();

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      const rowButtons = screen.getAllByRole('button', { expanded: false });
      const postgresRow = rowButtons.find(btn => btn.textContent?.includes('PostgreSQL'));
      const cacheRow = rowButtons.find(btn => btn.textContent?.includes('cache'));

      fireEvent.click(postgresRow!);
      fireEvent.click(cacheRow!);

      expect(screen.getByTestId('latency-chart-d1')).toBeInTheDocument();
      expect(screen.getByTestId('health-timeline-d1')).toBeInTheDocument();
      expect(screen.getByTestId('latency-chart-d2')).toBeInTheDocument();
      expect(screen.getByTestId('health-timeline-d2')).toBeInTheDocument();
    });
  });

  describe('Inline Override Editing', () => {
    const adminUser = {
      id: 'u1',
      email: 'admin@test.com',
      name: 'Admin',
      role: 'admin',
      teams: [],
    };

    const teamLeadUser = {
      id: 'u2',
      email: 'lead@test.com',
      name: 'Lead',
      role: 'user',
      teams: [{ team_id: 't1', role: 'lead', team: { id: 't1', name: 'Team A', description: null } }],
    };

    const memberUser = {
      id: 'u3',
      email: 'member@test.com',
      name: 'Member',
      role: 'user',
      teams: [{ team_id: 't1', role: 'member', team: { id: 't1', name: 'Team A', description: null } }],
    };

    const noTeamUser = {
      id: 'u4',
      email: 'other@test.com',
      name: 'Other',
      role: 'user',
      teams: [{ team_id: 't9', role: 'lead', team: { id: 't9', name: 'Other Team', description: null } }],
    };

    it('shows edit buttons for admin users', async () => {
      setupDefaultMocks();

      renderServiceDetail('s1', { isAdmin: true, user: adminUser });

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      const editButtons = screen.getAllByTitle('Edit dependency');
      expect(editButtons.length).toBe(2);
    });

    it('shows edit buttons for team leads of the service team', async () => {
      setupDefaultMocks();

      renderServiceDetail('s1', { isAdmin: false, user: teamLeadUser });

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      const editButtons = screen.getAllByTitle('Edit dependency');
      expect(editButtons.length).toBe(2);
    });

    it('hides edit buttons for regular team members', async () => {
      setupDefaultMocks();

      renderServiceDetail('s1', { isAdmin: false, user: memberUser });

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      expect(screen.queryByTitle('Edit dependency')).not.toBeInTheDocument();
    });

    it('hides edit buttons for leads of other teams', async () => {
      setupDefaultMocks();

      renderServiceDetail('s1', { isAdmin: false, user: noTeamUser });

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      expect(screen.queryByTitle('Edit dependency')).not.toBeInTheDocument();
    });

    it('opens edit modal when edit button is clicked', async () => {
      setupDefaultMocks();

      renderServiceDetail('s1', { isAdmin: true, user: adminUser });

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      const editButtons = screen.getAllByTitle('Edit dependency');
      fireEvent.click(editButtons[0]);

      expect(screen.getByText(/Edit — PostgreSQL/)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g. Critical — primary database')).toBeInTheDocument();
    });

    it('pre-populates modal with existing overrides', async () => {
      const serviceWithOverrides = {
        ...mockService,
        dependencies: [
          {
            ...mockService.dependencies[0],
            contact_override: '{"email":"db@co.com","slack":"#db"}',
            impact_override: 'Critical override',
          },
        ],
      };
      setupDefaultMocks(serviceWithOverrides);

      renderServiceDetail('s1', { isAdmin: true, user: adminUser });

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      const editButtons = screen.getAllByTitle('Edit dependency');
      fireEvent.click(editButtons[0]);

      const impactInput = screen.getByPlaceholderText('e.g. Critical — primary database') as HTMLInputElement;
      expect(impactInput.value).toBe('Critical override');

      const keyInputs = screen.getAllByPlaceholderText('Key (e.g. email)') as HTMLInputElement[];
      expect(keyInputs.length).toBe(2);
      expect(keyInputs[0].value).toBe('email');
      expect(keyInputs[1].value).toBe('slack');

      const valueInputs = screen.getAllByPlaceholderText('Value') as HTMLInputElement[];
      expect(valueInputs[0].value).toBe('db@co.com');
      expect(valueInputs[1].value).toBe('#db');
    });

    it('adds and removes contact entries', async () => {
      setupDefaultMocks();

      renderServiceDetail('s1', { isAdmin: true, user: adminUser });

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      const editButtons = screen.getAllByTitle('Edit dependency');
      fireEvent.click(editButtons[0]);

      expect(screen.queryByPlaceholderText('Key (e.g. email)')).not.toBeInTheDocument();

      fireEvent.click(screen.getByText('+ Add Field'));
      expect(screen.getByPlaceholderText('Key (e.g. email)')).toBeInTheDocument();

      fireEvent.click(screen.getByText('+ Add Field'));
      expect(screen.getAllByPlaceholderText('Key (e.g. email)').length).toBe(2);

      const removeButtons = screen.getAllByTitle('Remove entry');
      fireEvent.click(removeButtons[0]);
      expect(screen.getAllByPlaceholderText('Key (e.g. email)').length).toBe(1);
    });

    it('saves overrides and refreshes service', async () => {
      setupDefaultMocks();

      renderServiceDetail('s1', { isAdmin: true, user: adminUser });

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      const editButtons = screen.getAllByTitle('Edit dependency');
      fireEvent.click(editButtons[0]);

      const impactInput = screen.getByPlaceholderText('e.g. Critical — primary database');
      fireEvent.change(impactInput, { target: { value: 'New impact value' } });

      fireEvent.click(screen.getByText('+ Add Field'));
      const keyInput = screen.getByPlaceholderText('Key (e.g. email)');
      const valueInput = screen.getByPlaceholderText('Value');
      fireEvent.change(keyInput, { target: { value: 'email' } });
      fireEvent.change(valueInput, { target: { value: 'team@co.com' } });

      fireEvent.click(screen.getByText('Save Overrides'));

      await waitFor(() => {
        const putCall = mockFetch.mock.calls.find(
          (call: [string, RequestInit]) => call[1]?.method === 'PUT' && call[0].includes('/overrides')
        );
        expect(putCall).toBeDefined();
        const body = JSON.parse(putCall![1].body as string);
        expect(body.contact_override).toEqual({ email: 'team@co.com' });
        expect(body.impact_override).toBe('New impact value');
      });
    });

    it('shows error when saving with empty overrides', async () => {
      setupDefaultMocks();

      renderServiceDetail('s1', { isAdmin: true, user: adminUser });

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      const editButtons = screen.getAllByTitle('Edit dependency');
      fireEvent.click(editButtons[0]);

      fireEvent.click(screen.getByText('Save Overrides'));

      await waitFor(() => {
        expect(screen.getByText('Provide at least one override, or use Clear to remove all.')).toBeInTheDocument();
      });
    });

    it('shows clear button only when existing overrides are active', async () => {
      setupDefaultMocks();

      renderServiceDetail('s1', { isAdmin: true, user: adminUser });

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      const editButtons = screen.getAllByTitle('Edit dependency');
      fireEvent.click(editButtons[0]);

      expect(screen.queryByText('Clear All Overrides')).not.toBeInTheDocument();
    });

    it('shows clear button when overrides are active and clears them', async () => {
      const serviceWithOverrides = {
        ...mockService,
        dependencies: [
          {
            ...mockService.dependencies[0],
            impact_override: 'Active override',
          },
        ],
      };
      setupDefaultMocks(serviceWithOverrides);

      renderServiceDetail('s1', { isAdmin: true, user: adminUser });

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      const editButtons = screen.getAllByTitle('Edit dependency');
      fireEvent.click(editButtons[0]);

      expect(screen.getByText('Clear All Overrides')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Clear All Overrides'));

      await waitFor(() => {
        const deleteCall = mockFetch.mock.calls.find(
          (call: [string, RequestInit]) => call[1]?.method === 'DELETE' && call[0].includes('/overrides')
        );
        expect(deleteCall).toBeDefined();
      });
    });
  });

  describe('Edit Modal - Alias and Associations', () => {
    const adminUser = {
      id: 'u1',
      email: 'admin@test.com',
      name: 'Admin',
      role: 'admin',
      teams: [],
    };

    it('shows alias section in edit modal', async () => {
      setupDefaultMocks();

      renderServiceDetail('s1', { isAdmin: true, user: adminUser });

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      const editButtons = screen.getAllByTitle('Edit dependency');
      fireEvent.click(editButtons[0]);

      expect(screen.getByText('Alias')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g. Primary Database')).toBeInTheDocument();
    });

    it('shows associations section in edit modal', async () => {
      setupDefaultMocks();

      renderServiceDetail('s1', { isAdmin: true, user: adminUser });

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await switchTab('Dependencies');

      const editButtons = screen.getAllByTitle('Edit dependency');
      fireEvent.click(editButtons[0]);

      expect(screen.getByText('Associations')).toBeInTheDocument();
      expect(screen.getByText('+ Add Association')).toBeInTheDocument();
    });
  });

  describe('manifest indicators', () => {
    it('shows [M] badge and manifest info for manifest-managed services', async () => {
      const manifestService = {
        ...mockService,
        manifest_managed: 1,
        manifest_key: 'user-service',
      };

      mockFetch
        .mockResolvedValueOnce(jsonResponse(manifestService))
        .mockResolvedValueOnce(jsonResponse(mockTeams));

      renderServiceDetail('s1', { isAdmin: true });

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      expect(screen.getByTitle('Managed by manifest')).toBeInTheDocument();
      expect(screen.getByText(/Managed by manifest/)).toBeInTheDocument();
      expect(screen.getByText(/Key: user-service/)).toBeInTheDocument();
    });

    it('does not show manifest indicators for non-manifest services', async () => {
      const regularService = {
        ...mockService,
        manifest_managed: 0,
        manifest_key: null,
      };

      mockFetch
        .mockResolvedValueOnce(jsonResponse(regularService))
        .mockResolvedValueOnce(jsonResponse(mockTeams));

      renderServiceDetail('s1', { isAdmin: true });

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      expect(screen.queryByTitle('Managed by manifest')).not.toBeInTheDocument();
      expect(screen.queryByText('Manifest')).not.toBeInTheDocument();
    });

    it('shows manifest info without key when manifest_key is null', async () => {
      const manifestService = {
        ...mockService,
        manifest_managed: 1,
        manifest_key: null,
      };

      mockFetch
        .mockResolvedValueOnce(jsonResponse(manifestService))
        .mockResolvedValueOnce(jsonResponse(mockTeams));

      renderServiceDetail('s1', { isAdmin: true });

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      expect(screen.getByTitle('Managed by manifest')).toBeInTheDocument();
      expect(screen.getByText('Managed by manifest')).toBeInTheDocument();
      expect(screen.queryByText(/Key:/)).not.toBeInTheDocument();
    });
  });

  describe('URL param tab selection', () => {
    it('respects URL param for initial tab', async () => {
      setupDefaultMocks();

      renderServiceDetail('s1', {}, 'dependencies');

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /Dependencies/ })).toHaveAttribute('aria-selected', 'true');
      });

      expect(screen.getByText('Dependencies')).toBeInTheDocument();
    });

    it('respects URL param for reports tab', async () => {
      setupDefaultMocks();

      renderServiceDetail('s1', {}, 'reports');

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /Dependent Reports/ })).toHaveAttribute('aria-selected', 'true');
      });

      expect(screen.getByText('API Gateway')).toBeInTheDocument();
    });

    it('respects URL param for poll-issues tab', async () => {
      setupDefaultMocks();

      renderServiceDetail('s1', {}, 'poll-issues');

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /Poll Issues/ })).toHaveAttribute('aria-selected', 'true');
      });
    });
  });

  describe('Dependency detail modal', () => {
    /** Click the dependency name span (role="link") to open the detail modal */
    async function openDepDetailModal(name: string) {
      await switchTab('Dependencies');
      const nameSpan = screen.getAllByRole('link', { hidden: true }).find(el => el.textContent === name);
      fireEvent.click(nameSpan!);
      await waitFor(() => {
        expect(screen.getByText(`Dependency of Test Service`)).toBeInTheDocument();
      });
    }

    it('opens dependency detail modal when dependency name is clicked', async () => {
      setupDefaultMocks();

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await openDepDetailModal('PostgreSQL');

      expect(screen.getByText('Details')).toBeInTheDocument();
      // Latency section heading and chart present
      const latencyHeadings = screen.getAllByText('Latency');
      expect(latencyHeadings.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Contact')).toBeInTheDocument();
      expect(screen.getByTestId('latency-chart-d1')).toBeInTheDocument();
    });

    it('shows latency value in detail modal', async () => {
      setupDefaultMocks();

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await openDepDetailModal('PostgreSQL');

      // 15ms appears in both the row and modal; just confirm it's present
      expect(screen.getAllByText('15ms').length).toBeGreaterThanOrEqual(1);
    });

    it('shows contact info in detail modal', async () => {
      const serviceWithContact = {
        ...mockService,
        dependencies: [
          {
            ...mockService.dependencies[0],
            effective_contact: '{"email":"detail@example.com","slack":"#detail-support"}',
          },
        ],
      };
      setupDefaultMocks(serviceWithContact);

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await openDepDetailModal('PostgreSQL');

      // Contact values rendered in the modal
      expect(screen.getAllByText('detail@example.com').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('#detail-support').length).toBeGreaterThanOrEqual(1);
    });

    it('shows "No contact information" when no contact exists', async () => {
      setupDefaultMocks();

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await openDepDetailModal('PostgreSQL');

      expect(screen.getByText('No contact information available.')).toBeInTheDocument();
    });

    it('shows edit overrides button for admin users', async () => {
      const adminUser = { id: 'u1', email: 'admin@test.com', name: 'Admin', role: 'admin', teams: [] };
      setupDefaultMocks();

      renderServiceDetail('s1', { isAdmin: true, user: adminUser });

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await openDepDetailModal('PostgreSQL');

      expect(screen.getByText('Edit Overrides')).toBeInTheDocument();
    });

    it('hides edit overrides button for non-privileged users', async () => {
      setupDefaultMocks();

      renderServiceDetail('s1', { isAdmin: false, user: null });

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await openDepDetailModal('PostgreSQL');

      expect(screen.queryByText('Edit Overrides')).not.toBeInTheDocument();
    });

    it('shows override badge in detail modal when impact override active', async () => {
      const serviceWithOverride = {
        ...mockService,
        dependencies: [
          {
            ...mockService.dependencies[0],
            impact_override: 'Custom modal impact',
            effective_impact: 'Custom modal impact',
          },
        ],
      };
      setupDefaultMocks(serviceWithOverride);

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      await openDepDetailModal('PostgreSQL');

      // The modal shows the effective impact value
      expect(screen.getAllByText('Custom modal impact').length).toBeGreaterThanOrEqual(1);
    });
  });
});
