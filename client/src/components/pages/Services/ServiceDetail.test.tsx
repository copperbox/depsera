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

function renderServiceDetail(id = 's1', isAdmin = false) {
  mockUseAuth.mockReturnValue({ isAdmin });
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
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockService))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

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
      .mockRejectedValueOnce(new Error('Network error'))
      // Retry succeeds
      .mockResolvedValueOnce(jsonResponse(mockService))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });
  });

  it('shows not found state for missing service', async () => {
    // Both fetches run in parallel via Promise.all
    mockFetch
      .mockResolvedValueOnce(jsonResponse(null))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Service not found')).toBeInTheDocument();
    });

    expect(screen.getByText('Back to Services')).toBeInTheDocument();
  });

  it('displays dependencies table with contact column', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockService))
      .mockResolvedValueOnce(jsonResponse(mockTeams))
      .mockResolvedValueOnce(jsonResponse([])); // suggestions

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Dependencies')).toBeInTheDocument();
    });

    // Table headers include Contact column
    expect(screen.getByText('Contact')).toBeInTheDocument();

    expect(screen.getAllByText('PostgreSQL').length).toBeGreaterThan(0);
    expect(screen.getAllByText('database').length).toBeGreaterThan(0);
    expect(screen.getByText('Main DB')).toBeInTheDocument();
    // Uses effective_impact for display
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('15ms')).toBeInTheDocument();
    expect(screen.getAllByText('cache').length).toBeGreaterThan(0);
  });

  it('displays dependent reports table', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockService))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

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
    mockFetch
      .mockResolvedValueOnce(jsonResponse(serviceNoDeps))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('No dependencies registered for this service.')).toBeInTheDocument();
    });
  });

  it('shows empty state for no dependent reports', async () => {
    const serviceNoReports = { ...mockService, dependent_reports: [] };
    mockFetch
      .mockResolvedValueOnce(jsonResponse(serviceNoReports))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('No services report depending on this service.')).toBeInTheDocument();
    });
  });

  it('shows inactive badge for inactive service', async () => {
    const inactiveService = { ...mockService, is_active: 0 };
    mockFetch
      .mockResolvedValueOnce(jsonResponse(inactiveService))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });
  });

  it('shows poll error when last poll failed', async () => {
    const failedPollService = { ...mockService, last_poll_success: 0, last_poll_error: 'Connection timeout' };
    mockFetch
      .mockResolvedValueOnce(jsonResponse(failedPollService))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText(/Connection timeout/)).toBeInTheDocument();
    });
  });

  it('shows admin actions for admin users', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockService))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServiceDetail('s1', true);

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });
  });

  it('hides admin actions for non-admin users', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockService))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServiceDetail('s1', false);

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('opens edit modal when edit button clicked', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockService))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServiceDetail('s1', true);

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Edit'));

    expect(screen.getByText('Edit Service')).toBeInTheDocument();
  });

  it('opens delete confirmation dialog', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockService))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServiceDetail('s1', true);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete'));

    expect(screen.getByText('Delete Service')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
  });

  it('triggers manual poll refresh', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockService))
      .mockResolvedValueOnce(jsonResponse(mockTeams))
      .mockResolvedValueOnce(jsonResponse([])) // suggestions
      .mockResolvedValueOnce(jsonResponse(mockService)); // poll refresh

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Refresh'));

    // handlePoll just re-fetches the service data
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  it('displays back link to services list', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockService))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Back to Services')).toBeInTheDocument();
    });
  });

  it('displays dependency without canonical name', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockService))
      .mockResolvedValueOnce(jsonResponse(mockTeams))
      .mockResolvedValueOnce(jsonResponse([])); // suggestions

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getAllByText('cache').length).toBeGreaterThan(0);
    });
  });

  it('displays dash for null latency', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockService))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    // The cache dependency has null latency
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });

  it('opens error history panel when history button clicked', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockService))
      .mockResolvedValueOnce(jsonResponse(mockTeams))
      .mockResolvedValueOnce(jsonResponse([])) // suggestions
      .mockResolvedValueOnce(jsonResponse({ dependencyId: 'd1', errorCount: 0, errors: [] })); // error history

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getAllByText('database').length).toBeGreaterThan(0);
    });

    // Click the history button for the first dependency
    const historyButtons = screen.getAllByTitle('View error history');
    fireEvent.click(historyButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Error History')).toBeInTheDocument();
    });
  });

  it('shows poll error with default message', async () => {
    const failedPollService = { ...mockService, last_poll_success: 0, last_poll_error: null };
    mockFetch
      .mockResolvedValueOnce(jsonResponse(failedPollService))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

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
      mockFetch
        .mockResolvedValueOnce(jsonResponse(serviceWithContact))
        .mockResolvedValueOnce(jsonResponse(mockTeams));

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('db-team@example.com')).toBeInTheDocument();
      });

      expect(screen.getByText('email:')).toBeInTheDocument();
      expect(screen.getByText('slack:')).toBeInTheDocument();
      expect(screen.getByText('#db-support')).toBeInTheDocument();
    });

    it('displays dash when effective_contact is null', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockService))
        .mockResolvedValueOnce(jsonResponse(mockTeams));

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

      // Both dependencies have null effective_contact, so dashes appear in contact cells
      const dashes = screen.getAllByText('-');
      expect(dashes.length).toBeGreaterThan(0);
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
      mockFetch
        .mockResolvedValueOnce(jsonResponse(serviceWithOverride))
        .mockResolvedValueOnce(jsonResponse(mockTeams));

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
      mockFetch
        .mockResolvedValueOnce(jsonResponse(serviceWithOverride))
        .mockResolvedValueOnce(jsonResponse(mockTeams));

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
      mockFetch
        .mockResolvedValueOnce(jsonResponse(serviceWithOverride))
        .mockResolvedValueOnce(jsonResponse(mockTeams));

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('override@example.com')).toBeInTheDocument();
      });

      const badges = screen.getAllByText('override');
      expect(badges.length).toBeGreaterThanOrEqual(1);
    });

    it('does not show override badge when no overrides are active', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockService))
        .mockResolvedValueOnce(jsonResponse(mockTeams));

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
      mockFetch
        .mockResolvedValueOnce(jsonResponse(serviceWithBadContact))
        .mockResolvedValueOnce(jsonResponse(mockTeams));

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Dependencies')).toBeInTheDocument();
      });

      // Should show dash instead of crashing
      expect(screen.queryByText('not-valid-json')).not.toBeInTheDocument();
    });
  });

  describe('Dependency Metrics', () => {
    it('shows dependency metrics section when dependencies exist', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockService))
        .mockResolvedValueOnce(jsonResponse(mockTeams));

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Dependency Metrics')).toBeInTheDocument();
      });

      expect(screen.getByText('Latency and health trends')).toBeInTheDocument();
    });

    it('does not show dependency metrics section when no dependencies', async () => {
      const serviceNoDeps = { ...mockService, dependencies: [] };
      mockFetch
        .mockResolvedValueOnce(jsonResponse(serviceNoDeps))
        .mockResolvedValueOnce(jsonResponse(mockTeams));

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Test Service')).toBeInTheDocument();
      });

      expect(screen.queryByText('Dependency Metrics')).not.toBeInTheDocument();
    });

    it('shows collapsible panels for each dependency', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockService))
        .mockResolvedValueOnce(jsonResponse(mockTeams));

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Dependency Metrics')).toBeInTheDocument();
      });

      // Panels use canonical_name when available, otherwise dep name
      const panelButtons = screen.getAllByRole('button', { expanded: false });
      const chartPanels = panelButtons.filter(
        btn => btn.textContent?.includes('PostgreSQL') || btn.textContent?.includes('cache')
      );
      expect(chartPanels.length).toBe(2);
    });

    it('expands panel to show charts when clicked', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockService))
        .mockResolvedValueOnce(jsonResponse(mockTeams));

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Dependency Metrics')).toBeInTheDocument();
      });

      // Charts should not be visible initially
      expect(screen.queryByTestId('latency-chart-d1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('health-timeline-d1')).not.toBeInTheDocument();

      // Click PostgreSQL panel to expand
      const panelButtons = screen.getAllByRole('button', { expanded: false });
      const postgresPanel = panelButtons.find(btn => btn.textContent?.includes('PostgreSQL'));
      fireEvent.click(postgresPanel!);

      // Charts should now be visible
      expect(screen.getByTestId('latency-chart-d1')).toBeInTheDocument();
      expect(screen.getByTestId('health-timeline-d1')).toBeInTheDocument();
    });

    it('collapses panel when clicked again', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockService))
        .mockResolvedValueOnce(jsonResponse(mockTeams));

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Dependency Metrics')).toBeInTheDocument();
      });

      // Expand PostgreSQL panel
      const panelButtons = screen.getAllByRole('button', { expanded: false });
      const postgresPanel = panelButtons.find(btn => btn.textContent?.includes('PostgreSQL'));
      fireEvent.click(postgresPanel!);

      expect(screen.getByTestId('latency-chart-d1')).toBeInTheDocument();

      // Click again to collapse
      const expandedButton = screen.getByRole('button', { expanded: true });
      fireEvent.click(expandedButton);

      expect(screen.queryByTestId('latency-chart-d1')).not.toBeInTheDocument();
    });

    it('can expand multiple dependency panels independently', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(mockService))
        .mockResolvedValueOnce(jsonResponse(mockTeams));

      renderServiceDetail();

      await waitFor(() => {
        expect(screen.getByText('Dependency Metrics')).toBeInTheDocument();
      });

      // Expand both panels
      const panelButtons = screen.getAllByRole('button', { expanded: false });
      const postgresPanel = panelButtons.find(btn => btn.textContent?.includes('PostgreSQL'));
      const cachePanel = panelButtons.find(btn => btn.textContent?.includes('cache'));

      fireEvent.click(postgresPanel!);
      fireEvent.click(cachePanel!);

      // Both charts should be visible
      expect(screen.getByTestId('latency-chart-d1')).toBeInTheDocument();
      expect(screen.getByTestId('health-timeline-d1')).toBeInTheDocument();
      expect(screen.getByTestId('latency-chart-d2')).toBeInTheDocument();
      expect(screen.getByTestId('health-timeline-d2')).toBeInTheDocument();
    });
  });

});
