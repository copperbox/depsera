import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
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
    name: 'Service A',
    team_id: 't1',
    team: { name: 'Team A' },
    health: {
      status: 'healthy',
      last_report: '2024-01-15T10:00:00Z',
      healthy_reports: 10,
      total_reports: 10,
    },
  },
  {
    id: 's2',
    name: 'Service B',
    team_id: 't1',
    team: { name: 'Team A' },
    health: {
      status: 'warning',
      last_report: '2024-01-15T09:00:00Z',
      healthy_reports: 8,
      total_reports: 10,
    },
  },
  {
    id: 's3',
    name: 'Service C',
    team_id: 't2',
    team: { name: 'Team B' },
    health: {
      status: 'critical',
      last_report: '2024-01-15T08:00:00Z',
      healthy_reports: 2,
      total_reports: 10,
    },
  },
];

const mockTeams = [
  { id: 't1', name: 'Team A', service_count: 2, member_count: 3 },
  { id: 't2', name: 'Team B', service_count: 1, member_count: 2 },
];

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

/** Mock all 4 fetch calls: services, teams, activity, unstable */
function mockDashboardFetches(services: unknown, teams: unknown) {
  mockFetch
    .mockResolvedValueOnce(jsonResponse(services))
    .mockResolvedValueOnce(jsonResponse(teams))
    .mockResolvedValueOnce(jsonResponse([]))
    .mockResolvedValueOnce(jsonResponse([]));
}

beforeEach(() => {
  mockFetch.mockReset();
  mockNavigate.mockReset();
  localStorage.clear();
});

describe('Dashboard', () => {
  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    renderDashboard();

    expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();
  });

  it('renders dashboard content after loading', async () => {
    mockDashboardFetches(mockServices, mockTeams);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    // Summary stats
    expect(screen.getByText('Total Services')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // Total
    expect(screen.getByText('2 teams')).toBeInTheDocument();
  });

  it('displays error state and allows retry', async () => {
    // All 4 calls happen concurrently via Promise.all
    // First attempt: all fail
    // Second attempt (retry): all succeed
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'));
    // Retry succeeds
    mockDashboardFetches(mockServices, mockTeams);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });
  });

  it('displays services with issues', async () => {
    mockDashboardFetches(mockServices, mockTeams);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Services with Issues')).toBeInTheDocument();
    });

    // Services may appear multiple times (issues list and recent activity)
    expect(screen.getAllByText('Service B').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Service C').length).toBeGreaterThan(0);
  });

  it('shows empty state when no issues', async () => {
    const healthyServices = mockServices.map((s) => ({
      ...s,
      health: { ...s.health, status: 'healthy' },
    }));

    mockDashboardFetches(healthyServices, mockTeams);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('All services are healthy')).toBeInTheDocument();
    });
  });

  it('displays team health summary', async () => {
    mockDashboardFetches(mockServices, mockTeams);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Health by Team')).toBeInTheDocument();
    });

    // Multiple Team A/B may appear (in issues and team summary), use getAllByText
    expect(screen.getAllByText('Team A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Team B').length).toBeGreaterThan(0);
  });

  it('displays recent activity', async () => {
    mockDashboardFetches(mockServices, mockTeams);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    });
  });

  it('toggles auto-refresh polling', async () => {
    mockDashboardFetches(mockServices, mockTeams);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Auto-refresh')).toBeInTheDocument();
    });

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem('dashboard-auto-refresh')).toBe('true');
  });

  it('changes polling interval', async () => {
    mockDashboardFetches(mockServices, mockTeams);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByLabelText('Refresh interval')).toBeInTheDocument();
    });

    const select = screen.getByLabelText('Refresh interval');
    fireEvent.change(select, { target: { value: '60000' } });

    expect(localStorage.getItem('dashboard-refresh-interval')).toBe('60000');
  });

  it('navigates to services on card click', async () => {
    mockDashboardFetches(mockServices, mockTeams);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Total Services')).toBeInTheDocument();
    });

    // Find and click the clickable card
    const card = screen.getByText('Total Services').closest('[class*="summaryCard"]');
    fireEvent.click(card!);

    expect(mockNavigate).toHaveBeenCalledWith('/services');
  });

  it('shows no teams message when empty', async () => {
    mockDashboardFetches([], []);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('No teams with services')).toBeInTheDocument();
    });
  });

  it('shows no activity message when empty', async () => {
    mockDashboardFetches(mockServices, mockTeams);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('No recent status changes')).toBeInTheDocument();
    });
  });

  it('renders recent activity with status change events', async () => {
    const mockActivity = [
      { id: 'a1', service_id: 's1', service_name: 'Service A', dependency_name: 'DB', previous_healthy: true, current_healthy: false, recorded_at: '2024-01-15T10:00:00Z' },
      { id: 'a2', service_id: 's2', service_name: 'Service B', dependency_name: 'Redis', previous_healthy: false, current_healthy: true, recorded_at: '2024-01-15T09:00:00Z' },
    ];

    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams))
      .mockResolvedValueOnce(jsonResponse(mockActivity))
      .mockResolvedValueOnce(jsonResponse([]));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
    });

    // Activity events show service names and transitions
    expect(screen.getAllByText('Service A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Service B').length).toBeGreaterThan(0);
  });

  describe('Health Overview', () => {
    it('displays health overview bar when services exist', async () => {
      mockDashboardFetches(mockServices, mockTeams);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Health Overview')).toBeInTheDocument();
      });

      // Should show percentage healthy (1 healthy out of 3 = 33%)
      expect(screen.getByText('33% healthy')).toBeInTheDocument();
    });

    it('shows health distribution bar with aria label', async () => {
      mockDashboardFetches(mockServices, mockTeams);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('img', { name: 'Health distribution bar' })).toBeInTheDocument();
      });
    });

    it('shows legend with counts for non-zero categories', async () => {
      mockDashboardFetches(mockServices, mockTeams);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Health Overview')).toBeInTheDocument();
      });

      // mockServices: 1 healthy, 1 warning, 1 critical
      expect(screen.getByText('Healthy (1)')).toBeInTheDocument();
      expect(screen.getByText('Warning (1)')).toBeInTheDocument();
      expect(screen.getByText('Critical (1)')).toBeInTheDocument();
    });

    it('does not show health overview when no services', async () => {
      mockDashboardFetches([], []);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Dashboard')).toBeInTheDocument();
      });

      expect(screen.queryByText('Health Overview')).not.toBeInTheDocument();
    });

    it('shows 100% healthy when all services are healthy', async () => {
      const healthyServices = mockServices.map((s) => ({
        ...s,
        health: { ...s.health, status: 'healthy' },
      }));

      mockDashboardFetches(healthyServices, mockTeams);

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('100% healthy')).toBeInTheDocument();
      });

      // Only healthy legend should show, no warning/critical legend items
      expect(screen.getByText('Healthy (3)')).toBeInTheDocument();
      expect(screen.queryByText(/Warning \(\d+\)/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Critical \(\d+\)/)).not.toBeInTheDocument();
    });
  });
});
