import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ServiceWithDependencies } from '../../../types/service';

// Mock the api module
jest.mock('../../../api/services');
// Mock the ServiceDetailPanel
jest.mock('./ServiceDetailPanel', () => ({
  ServiceDetailPanel: () => <div data-testid="detail-panel" />,
}));
// Mock usePolling
jest.mock('../../../hooks/usePolling', () => ({
  INTERVAL_OPTIONS: [{ value: 30000, label: '30s' }],
  usePolling: () => ({
    isPollingEnabled: false,
    pollingInterval: 30000,
    togglePolling: jest.fn(),
    handleIntervalChange: jest.fn(),
  }),
}));

import { fetchServices } from '../../../api/services';
import Wallboard from './Wallboard';

const mockFetchServices = fetchServices as jest.MockedFunction<typeof fetchServices>;

function makeService(overrides: Partial<ServiceWithDependencies> = {}): ServiceWithDependencies {
  return {
    id: 'svc-1',
    name: 'Service Alpha',
    team_id: 'team-1',
    health_endpoint: 'https://example.com/health',
    metrics_endpoint: null,
    is_active: 1,
    last_poll_success: 1,
    last_poll_error: null,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
    team: { id: 'team-1', name: 'Team One', description: null, created_at: '2025-01-01', updated_at: '2025-01-01' },
    health: {
      status: 'healthy',
      healthy_reports: 1,
      warning_reports: 0,
      critical_reports: 0,
      total_reports: 1,
      dependent_count: 1,
      last_report: '2025-01-01T00:00:00Z',
    },
    dependencies: [],
    dependent_reports: [],
    ...overrides,
  };
}

describe('Wallboard', () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetchServices.mockReset();
  });

  it('renders team filter dropdown with teams from services', async () => {
    mockFetchServices.mockResolvedValue([
      makeService({ id: 'svc-1', team: { id: 'team-1', name: 'Team One', description: null, created_at: '', updated_at: '' } }),
      makeService({ id: 'svc-2', name: 'Service Beta', team_id: 'team-2', team: { id: 'team-2', name: 'Team Two', description: null, created_at: '', updated_at: '' } }),
    ]);

    render(<Wallboard />);
    await waitFor(() => expect(screen.getByLabelText('Filter by team')).toBeInTheDocument());

    const select = screen.getByLabelText('Filter by team') as HTMLSelectElement;
    expect(select.options).toHaveLength(3); // All teams + 2 teams
    expect(select.options[0].textContent).toBe('All teams');
  });

  it('filters services by selected team', async () => {
    mockFetchServices.mockResolvedValue([
      makeService({ id: 'svc-1', name: 'Service Alpha' }),
      makeService({ id: 'svc-2', name: 'Service Beta', team_id: 'team-2', team: { id: 'team-2', name: 'Team Two', description: null, created_at: '', updated_at: '' } }),
    ]);

    render(<Wallboard />);
    await waitFor(() => expect(screen.getByText('Service Alpha')).toBeInTheDocument());
    expect(screen.getByText('Service Beta')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter by team'), { target: { value: 'team-1' } });

    expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Service Beta')).not.toBeInTheDocument();
  });

  it('shows team name on cards', async () => {
    mockFetchServices.mockResolvedValue([makeService()]);

    render(<Wallboard />);
    await waitFor(() => expect(screen.getAllByText('Team One').length).toBeGreaterThan(0));
  });

  it('renders latency summary with min/avg/max', async () => {
    mockFetchServices.mockResolvedValue([
      makeService({
        dependent_reports: [
          { dependency_id: 'd1', dependency_name: 'dep', reporting_service_id: 's2', reporting_service_name: 'Svc2', healthy: 1, health_state: 0, latency_ms: 10, last_checked: null, impact: null },
          { dependency_id: 'd2', dependency_name: 'dep2', reporting_service_id: 's3', reporting_service_name: 'Svc3', healthy: 1, health_state: 0, latency_ms: 30, last_checked: null, impact: null },
        ],
      }),
    ]);

    render(<Wallboard />);
    await waitFor(() => expect(screen.getByText('10 / 20 / 30 ms')).toBeInTheDocument());
  });

  it('renders impact row only for critical services with impact data', async () => {
    mockFetchServices.mockResolvedValue([
      makeService({
        health: { status: 'critical', healthy_reports: 0, warning_reports: 0, critical_reports: 1, total_reports: 1, dependent_count: 1, last_report: null },
        dependencies: [
          { id: 'd1', service_id: 'svc-1', name: 'DB', canonical_name: null, description: null, impact: 'Data unavailable', healthy: 0, health_state: 2, health_code: null, latency_ms: null, last_checked: null, last_status_change: null, created_at: '', updated_at: '' },
          { id: 'd2', service_id: 'svc-1', name: 'Cache', canonical_name: null, description: null, impact: 'Slow responses', healthy: 0, health_state: 2, health_code: null, latency_ms: null, last_checked: null, last_status_change: null, created_at: '', updated_at: '' },
        ],
      }),
    ]);

    render(<Wallboard />);
    await waitFor(() => expect(screen.getByText('Impact')).toBeInTheDocument());
    expect(screen.getByText('DB')).toBeInTheDocument();
    expect(screen.getByText('Data unavailable')).toBeInTheDocument();
    expect(screen.getByText('Cache')).toBeInTheDocument();
    expect(screen.getByText('Slow responses')).toBeInTheDocument();
  });

  it('hides impact row for non-critical services', async () => {
    mockFetchServices.mockResolvedValue([
      makeService({
        health: { status: 'healthy', healthy_reports: 1, warning_reports: 0, critical_reports: 0, total_reports: 1, dependent_count: 1, last_report: null },
        dependencies: [
          { id: 'd1', service_id: 'svc-1', name: 'DB', canonical_name: null, description: null, impact: 'Data unavailable', healthy: 1, health_state: 0, health_code: null, latency_ms: null, last_checked: null, last_status_change: null, created_at: '', updated_at: '' },
        ],
      }),
    ]);

    render(<Wallboard />);
    await waitFor(() => expect(screen.getByText('Service Alpha')).toBeInTheDocument());
    expect(screen.queryByText('Impact')).not.toBeInTheDocument();
  });

  it('persists team filter in localStorage', async () => {
    mockFetchServices.mockResolvedValue([
      makeService(),
      makeService({ id: 'svc-2', name: 'Service Beta', team_id: 'team-2', team: { id: 'team-2', name: 'Team Two', description: null, created_at: '', updated_at: '' } }),
    ]);

    render(<Wallboard />);
    await waitFor(() => expect(screen.getByLabelText('Filter by team')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Filter by team'), { target: { value: 'team-2' } });
    expect(localStorage.getItem('wallboard-filter-team')).toBe('team-2');
  });

  it('shows loading state initially', async () => {
    mockFetchServices.mockImplementation(() => new Promise(() => {}));

    render(<Wallboard />);

    expect(screen.getByText('Loading wallboard...')).toBeInTheDocument();
  });

  it('shows error state and allows retry', async () => {
    mockFetchServices
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce([makeService()]);

    render(<Wallboard />);

    await waitFor(() => expect(screen.getByText(/Error:.*Network error/)).toBeInTheDocument());

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => expect(screen.getByText('Service Alpha')).toBeInTheDocument());
  });

  it('shows empty state when no services', async () => {
    mockFetchServices.mockResolvedValue([]);

    render(<Wallboard />);

    await waitFor(() => expect(screen.getByText('No services found.')).toBeInTheDocument());
  });

  it('shows empty state when no services match filters', async () => {
    mockFetchServices.mockResolvedValue([
      makeService({ health: { status: 'healthy', healthy_reports: 1, warning_reports: 0, critical_reports: 0, total_reports: 1, dependent_count: 1, last_report: null } }),
    ]);

    render(<Wallboard />);
    await waitFor(() => expect(screen.getByText('Service Alpha')).toBeInTheDocument());

    // Enable unhealthy only filter
    fireEvent.click(screen.getByLabelText('Unhealthy only'));

    expect(screen.getByText('All services are healthy!')).toBeInTheDocument();
  });

  it('toggles unhealthy only filter', async () => {
    mockFetchServices.mockResolvedValue([
      makeService({ id: 'svc-1', name: 'Healthy Service', health: { status: 'healthy', healthy_reports: 1, warning_reports: 0, critical_reports: 0, total_reports: 1, dependent_count: 1, last_report: null } }),
      makeService({ id: 'svc-2', name: 'Critical Service', health: { status: 'critical', healthy_reports: 0, warning_reports: 0, critical_reports: 1, total_reports: 1, dependent_count: 1, last_report: null } }),
    ]);

    render(<Wallboard />);
    await waitFor(() => expect(screen.getByText('Healthy Service')).toBeInTheDocument());
    expect(screen.getByText('Critical Service')).toBeInTheDocument();

    // Enable unhealthy only filter
    fireEvent.click(screen.getByLabelText('Unhealthy only'));

    expect(screen.queryByText('Healthy Service')).not.toBeInTheDocument();
    expect(screen.getByText('Critical Service')).toBeInTheDocument();
    expect(localStorage.getItem('wallboard-filter-unhealthy')).toBe('true');

    // Disable filter
    fireEvent.click(screen.getByLabelText('Unhealthy only'));
    expect(screen.getByText('Healthy Service')).toBeInTheDocument();
    expect(localStorage.getItem('wallboard-filter-unhealthy')).toBe('false');
  });

  it('opens service detail panel when card clicked', async () => {
    mockFetchServices.mockResolvedValue([makeService()]);

    render(<Wallboard />);
    await waitFor(() => expect(screen.getByText('Service Alpha')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Service Alpha').closest('div[class*="card"]')!);

    expect(screen.getByTestId('detail-panel')).toBeInTheDocument();
  });

  it('displays warning status services', async () => {
    mockFetchServices.mockResolvedValue([
      makeService({ health: { status: 'warning', healthy_reports: 0, warning_reports: 1, critical_reports: 0, total_reports: 1, dependent_count: 1, last_report: null } }),
    ]);

    render(<Wallboard />);
    await waitFor(() => expect(screen.getByText('Service Alpha')).toBeInTheDocument());
  });

  it('displays unknown status services', async () => {
    mockFetchServices.mockResolvedValue([
      makeService({ health: { status: 'unknown', healthy_reports: 0, warning_reports: 0, critical_reports: 0, total_reports: 0, dependent_count: 0, last_report: null } }),
    ]);

    render(<Wallboard />);
    await waitFor(() => expect(screen.getByText('Service Alpha')).toBeInTheDocument());
  });

  it('handles non-Error exception', async () => {
    mockFetchServices.mockRejectedValueOnce('String error');

    render(<Wallboard />);

    await waitFor(() => expect(screen.getByText(/Error:.*Failed to load services/)).toBeInTheDocument());
  });

  it('restores team filter from localStorage', async () => {
    localStorage.setItem('wallboard-filter-team', 'team-2');
    mockFetchServices.mockResolvedValue([
      makeService(),
      makeService({ id: 'svc-2', name: 'Service Beta', team_id: 'team-2', team: { id: 'team-2', name: 'Team Two', description: null, created_at: '', updated_at: '' } }),
    ]);

    render(<Wallboard />);
    await waitFor(() => expect(screen.getByText('Service Beta')).toBeInTheDocument());

    // Only Team Two services should be visible
    expect(screen.queryByText('Service Alpha')).not.toBeInTheDocument();
  });

  it('restores unhealthy filter from localStorage', async () => {
    localStorage.setItem('wallboard-filter-unhealthy', 'true');
    mockFetchServices.mockResolvedValue([
      makeService({ id: 'svc-1', name: 'Healthy Service', health: { status: 'healthy', healthy_reports: 1, warning_reports: 0, critical_reports: 0, total_reports: 1, dependent_count: 1, last_report: null } }),
      makeService({ id: 'svc-2', name: 'Critical Service', health: { status: 'critical', healthy_reports: 0, warning_reports: 0, critical_reports: 1, total_reports: 1, dependent_count: 1, last_report: null } }),
    ]);

    render(<Wallboard />);
    await waitFor(() => expect(screen.getByText('Critical Service')).toBeInTheDocument());

    // Healthy service should not be visible
    expect(screen.queryByText('Healthy Service')).not.toBeInTheDocument();
  });

  it('hides latency row when no latency data', async () => {
    mockFetchServices.mockResolvedValue([
      makeService({ dependent_reports: [] }),
    ]);

    render(<Wallboard />);
    await waitFor(() => expect(screen.getByText('Service Alpha')).toBeInTheDocument());
    // Latency row should not be present when there's no latency data
    expect(screen.queryByText(/Latency/)).not.toBeInTheDocument();
  });

  it('shows last report time', async () => {
    mockFetchServices.mockResolvedValue([
      makeService({ health: { status: 'healthy', healthy_reports: 5, warning_reports: 0, critical_reports: 0, total_reports: 5, dependent_count: 3, last_report: '2025-01-01T00:00:00Z' } }),
    ]);

    render(<Wallboard />);
    await waitFor(() => expect(screen.getByText('Last report')).toBeInTheDocument());
  });
});
