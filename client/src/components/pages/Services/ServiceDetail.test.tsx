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

/**
 * Build a default mock implementation that handles the initial service + teams load,
 * plus the additional DependencyList API calls (aliases, canonical names, associations, suggestions).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setupDefaultMocks(service: any = mockService) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/api/services/')) return Promise.resolve(jsonResponse(service));
    if (url.includes('/api/teams')) return Promise.resolve(jsonResponse(mockTeams));
    if (url.includes('/api/aliases/canonical-names')) return Promise.resolve(jsonResponse([]));
    if (url.includes('/api/aliases')) return Promise.resolve(jsonResponse([]));
    if (url.includes('/associations/suggestions')) return Promise.resolve(jsonResponse([]));
    if (url.includes('/associations')) return Promise.resolve(jsonResponse([]));
    return Promise.resolve(jsonResponse({}));
  });
}

function renderServiceDetail(id = 's1', authOverrides: { isAdmin?: boolean; user?: Record<string, unknown> } = {}) {
  const { isAdmin = false, user = null } = authOverrides;
  mockUseAuth.mockReturnValue({ isAdmin, user });
  return render(
    <MemoryRouter initialEntries={[`/services/${id}`]}>
      <Routes>
        <Route path="/services/:id" element={<ServiceDetail />} />
        <Route path="/services" element={<div>Services List</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  mockUseAuth.mockReset();
  mockNavigate.mockReset();
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
    // Both fetches fail on first attempt (Promise.all)
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'));

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    // Setup success for retry
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

  it('displays dependencies section', async () => {
    setupDefaultMocks();

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Dependencies')).toBeInTheDocument();
    });

    expect(screen.getAllByText('PostgreSQL').length).toBeGreaterThan(0);
    expect(screen.getByText('Main DB')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('15ms')).toBeInTheDocument();
    expect(screen.getAllByText('cache').length).toBeGreaterThan(0);
  });

  it('displays dependent reports table', async () => {
    setupDefaultMocks();

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Dependent Reports')).toBeInTheDocument();
    });

    expect(screen.getByText('API Gateway')).toBeInTheDocument();
    expect(screen.getByText('test-service')).toBeInTheDocument();
    expect(screen.getByText('10ms')).toBeInTheDocument();
  });

  it('shows empty state for no dependencies', async () => {
    const serviceNoDeps = { ...mockService, dependencies: [] };
    setupDefaultMocks(serviceNoDeps);

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('No dependencies registered for this service.')).toBeInTheDocument();
    });
  });

  it('shows empty state for no dependent reports', async () => {
    const serviceNoReports = { ...mockService, dependent_reports: [] };
    setupDefaultMocks(serviceNoReports);

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('No services report depending on this service.')).toBeInTheDocument();
    });
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

  it('displays dependency without canonical name', async () => {
    setupDefaultMocks();

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getAllByText('cache').length).toBeGreaterThan(0);
    });
  });

  it('displays dash for null latency', async () => {
    setupDefaultMocks();

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

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
        expect(screen.getByText('Overridden impact value')).toBeInTheDocument();
      });

      // Raw impact should not be displayed
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
        expect(screen.getByText('override@example.com')).toBeInTheDocument();
      });

      const badges = screen.getAllByText('override');
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });

    it('does not show override badge when no overrides are active', async () => {
      setupDefaultMocks();

      renderServiceDetail();

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
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

      // Should show dash instead of crashing
      expect(screen.queryByText('not-valid-json')).not.toBeInTheDocument();
    });
  });

  describe('Expandable Dependency Rows', () => {
    it('shows collapsible rows for each dependency', async () => {
      setupDefaultMocks();

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

      // Rows use aria-expanded
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
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

      // Charts should not be visible initially
      expect(screen.queryByTestId('latency-chart-d1')).not.toBeInTheDocument();

      // Click PostgreSQL row to expand
      const rowButtons = screen.getAllByRole('button', { expanded: false });
      const postgresRow = rowButtons.find(btn => btn.textContent?.includes('PostgreSQL'));
      fireEvent.click(postgresRow!);

      // Charts and error history should now be visible
      expect(screen.getByTestId('latency-chart-d1')).toBeInTheDocument();
      expect(screen.getByTestId('health-timeline-d1')).toBeInTheDocument();
      expect(screen.getByTestId('error-history-panel')).toBeInTheDocument();
    });

    it('collapses row when clicked again', async () => {
      setupDefaultMocks();

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

      // Expand PostgreSQL row
      const rowButtons = screen.getAllByRole('button', { expanded: false });
      const postgresRow = rowButtons.find(btn => btn.textContent?.includes('PostgreSQL'));
      fireEvent.click(postgresRow!);

      expect(screen.getByTestId('latency-chart-d1')).toBeInTheDocument();

      // Click again to collapse
      const expandedButton = screen.getByRole('button', { expanded: true });
      fireEvent.click(expandedButton);

      expect(screen.queryByTestId('latency-chart-d1')).not.toBeInTheDocument();
    });

    it('can expand multiple dependency rows independently', async () => {
      setupDefaultMocks();

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

      // Expand both rows
      const rowButtons = screen.getAllByRole('button', { expanded: false });
      const postgresRow = rowButtons.find(btn => btn.textContent?.includes('PostgreSQL'));
      const cacheRow = rowButtons.find(btn => btn.textContent?.includes('cache'));

      fireEvent.click(postgresRow!);
      fireEvent.click(cacheRow!);

      // Both charts should be visible
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
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByTitle('Edit dependency');
      expect(editButtons.length).toBe(2); // one per dependency
    });

    it('shows edit buttons for team leads of the service team', async () => {
      setupDefaultMocks();

      renderServiceDetail('s1', { isAdmin: false, user: teamLeadUser });

      await waitFor(() => {
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByTitle('Edit dependency');
      expect(editButtons.length).toBe(2);
    });

    it('hides edit buttons for regular team members', async () => {
      setupDefaultMocks();

      renderServiceDetail('s1', { isAdmin: false, user: memberUser });

      await waitFor(() => {
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

      expect(screen.queryByTitle('Edit dependency')).not.toBeInTheDocument();
    });

    it('hides edit buttons for leads of other teams', async () => {
      setupDefaultMocks();

      renderServiceDetail('s1', { isAdmin: false, user: noTeamUser });

      await waitFor(() => {
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

      expect(screen.queryByTitle('Edit dependency')).not.toBeInTheDocument();
    });

    it('opens edit modal when edit button is clicked', async () => {
      setupDefaultMocks();

      renderServiceDetail('s1', { isAdmin: true, user: adminUser });

      await waitFor(() => {
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByTitle('Edit dependency');
      fireEvent.click(editButtons[0]);

      // Modal title includes the dependency name
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
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByTitle('Edit dependency');
      fireEvent.click(editButtons[0]);

      // Impact should be pre-populated
      const impactInput = screen.getByPlaceholderText('e.g. Critical — primary database') as HTMLInputElement;
      expect(impactInput.value).toBe('Critical override');

      // Contact entries should be pre-populated
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
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByTitle('Edit dependency');
      fireEvent.click(editButtons[0]);

      // No contact entries initially
      expect(screen.queryByPlaceholderText('Key (e.g. email)')).not.toBeInTheDocument();

      // Add a field
      fireEvent.click(screen.getByText('+ Add Field'));
      expect(screen.getByPlaceholderText('Key (e.g. email)')).toBeInTheDocument();

      // Add another field
      fireEvent.click(screen.getByText('+ Add Field'));
      expect(screen.getAllByPlaceholderText('Key (e.g. email)').length).toBe(2);

      // Remove the first field
      const removeButtons = screen.getAllByTitle('Remove entry');
      fireEvent.click(removeButtons[0]);
      expect(screen.getAllByPlaceholderText('Key (e.g. email)').length).toBe(1);
    });

    it('saves overrides and refreshes service', async () => {
      setupDefaultMocks();

      renderServiceDetail('s1', { isAdmin: true, user: adminUser });

      await waitFor(() => {
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByTitle('Edit dependency');
      fireEvent.click(editButtons[0]);

      // Fill in impact override
      const impactInput = screen.getByPlaceholderText('e.g. Critical — primary database');
      fireEvent.change(impactInput, { target: { value: 'New impact value' } });

      // Add a contact field
      fireEvent.click(screen.getByText('+ Add Field'));
      const keyInput = screen.getByPlaceholderText('Key (e.g. email)');
      const valueInput = screen.getByPlaceholderText('Value');
      fireEvent.change(keyInput, { target: { value: 'email' } });
      fireEvent.change(valueInput, { target: { value: 'team@co.com' } });

      fireEvent.click(screen.getByText('Save Overrides'));

      await waitFor(() => {
        // PUT was called with correct body
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
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByTitle('Edit dependency');
      fireEvent.click(editButtons[0]);

      // Try to save without any overrides
      fireEvent.click(screen.getByText('Save Overrides'));

      await waitFor(() => {
        expect(screen.getByText('Provide at least one override, or use Clear to remove all.')).toBeInTheDocument();
      });
    });

    it('shows clear button only when existing overrides are active', async () => {
      // No active overrides
      setupDefaultMocks();

      renderServiceDetail('s1', { isAdmin: true, user: adminUser });

      await waitFor(() => {
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

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
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

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
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByTitle('Edit dependency');
      fireEvent.click(editButtons[0]);

      expect(screen.getByText('Alias')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g. Primary Database')).toBeInTheDocument();
    });

    it('shows associations section in edit modal', async () => {
      setupDefaultMocks();

      renderServiceDetail('s1', { isAdmin: true, user: adminUser });

      await waitFor(() => {
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

      const editButtons = screen.getAllByTitle('Edit dependency');
      fireEvent.click(editButtons[0]);

      expect(screen.getByText('Associations')).toBeInTheDocument();
      expect(screen.getByText('+ Add Association')).toBeInTheDocument();
    });
  });
});
