import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { WallboardDependency, WallboardResponse } from '../../../types/wallboard';

// Mock the api module
jest.mock('../../../api/wallboard');
// Mock the DependencyDetailPanel
jest.mock('./DependencyDetailPanel', () => ({
  DependencyDetailPanel: () => <div data-testid="detail-panel" />,
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

import { fetchWallboardData } from '../../../api/wallboard';
import Wallboard from './Wallboard';

const mockFetchWallboard = fetchWallboardData as jest.MockedFunction<typeof fetchWallboardData>;

function makeDep(overrides: Partial<WallboardDependency> = {}): WallboardDependency {
  return {
    canonical_name: 'PostgreSQL',
    primary_dependency_id: 'dep-1',
    health_status: 'healthy',
    type: 'database',
    latency: { min: 10, avg: 20, max: 30 },
    last_checked: '2025-01-01T12:00:00Z',
    error_message: null,
    impact: null,
    description: null,
    effective_contact: null,
    effective_impact: null,
    linked_service: null,
    reporters: [
      {
        dependency_id: 'dep-1',
        service_id: 'svc-1',
        service_name: 'Service Alpha',
        service_team_id: 'team-1',
        service_team_name: 'Team One',
        healthy: 1,
        health_state: 0,
        latency_ms: 20,
        last_checked: '2025-01-01T12:00:00Z',
        skipped: 0,
      },
    ],
    team_ids: ['team-1'],
    ...overrides,
  };
}

function makeResponse(overrides: Partial<WallboardResponse> = {}): WallboardResponse {
  return {
    dependencies: [makeDep()],
    teams: [{ id: 'team-1', name: 'Team One' }],
    ...overrides,
  };
}

function renderWallboard() {
  return render(
    <MemoryRouter>
      <Wallboard />
    </MemoryRouter>,
  );
}

describe('Wallboard', () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetchWallboard.mockReset();
  });

  it('renders dependency cards', async () => {
    mockFetchWallboard.mockResolvedValue(makeResponse());

    renderWallboard();
    await waitFor(() => expect(screen.getByText('PostgreSQL')).toBeInTheDocument());

    expect(screen.getByText('database')).toBeInTheDocument();
  });

  it('renders team filter dropdown', async () => {
    mockFetchWallboard.mockResolvedValue(makeResponse({
      teams: [
        { id: 'team-1', name: 'Team One' },
        { id: 'team-2', name: 'Team Two' },
      ],
    }));

    renderWallboard();
    await waitFor(() => expect(screen.getByLabelText('Filter by team')).toBeInTheDocument());

    const select = screen.getByLabelText('Filter by team') as HTMLSelectElement;
    expect(select.options).toHaveLength(3); // All teams + 2 teams
  });

  it('filters dependencies by team', async () => {
    mockFetchWallboard.mockResolvedValue(makeResponse({
      dependencies: [
        makeDep({ canonical_name: 'PostgreSQL', team_ids: ['team-1'] }),
        makeDep({ canonical_name: 'Redis', primary_dependency_id: 'dep-2', team_ids: ['team-2'] }),
      ],
      teams: [
        { id: 'team-1', name: 'Team One' },
        { id: 'team-2', name: 'Team Two' },
      ],
    }));

    renderWallboard();
    await waitFor(() => expect(screen.getByText('PostgreSQL')).toBeInTheDocument());
    expect(screen.getByText('Redis')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter by team'), { target: { value: 'team-1' } });

    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    expect(screen.queryByText('Redis')).not.toBeInTheDocument();
  });

  it('shows dependency with multiple team_ids when any team matches', async () => {
    mockFetchWallboard.mockResolvedValue(makeResponse({
      dependencies: [
        makeDep({ canonical_name: 'SharedDB', team_ids: ['team-1', 'team-2'] }),
      ],
      teams: [
        { id: 'team-1', name: 'Team One' },
        { id: 'team-2', name: 'Team Two' },
      ],
    }));

    renderWallboard();
    await waitFor(() => expect(screen.getByText('SharedDB')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Filter by team'), { target: { value: 'team-2' } });

    expect(screen.getByText('SharedDB')).toBeInTheDocument();
  });

  it('toggles unhealthy only filter', async () => {
    mockFetchWallboard.mockResolvedValue(makeResponse({
      dependencies: [
        makeDep({ canonical_name: 'Healthy DB', health_status: 'healthy' }),
        makeDep({ canonical_name: 'Down Redis', primary_dependency_id: 'dep-2', health_status: 'critical' }),
      ],
    }));

    renderWallboard();
    await waitFor(() => expect(screen.getByText('Healthy DB')).toBeInTheDocument());
    expect(screen.getByText('Down Redis')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Unhealthy only'));

    expect(screen.queryByText('Healthy DB')).not.toBeInTheDocument();
    expect(screen.getByText('Down Redis')).toBeInTheDocument();
    expect(localStorage.getItem('wallboard-filter-unhealthy')).toBe('true');

    fireEvent.click(screen.getByLabelText('Unhealthy only'));
    expect(screen.getByText('Healthy DB')).toBeInTheDocument();
  });

  it('includes warning status in unhealthy filter', async () => {
    mockFetchWallboard.mockResolvedValue(makeResponse({
      dependencies: [
        makeDep({ canonical_name: 'Warning API', health_status: 'warning' }),
      ],
    }));

    renderWallboard();
    await waitFor(() => expect(screen.getByText('Warning API')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Unhealthy only'));

    expect(screen.getByText('Warning API')).toBeInTheDocument();
  });

  it('renders latency summary on card', async () => {
    mockFetchWallboard.mockResolvedValue(makeResponse({
      dependencies: [
        makeDep({
          latency: { min: 10, avg: 20, max: 30 },
          reporters: [
            { dependency_id: 'dep-1', service_id: 'svc-1', service_name: 'Service Alpha', service_team_id: 'team-1', service_team_name: 'Team One', healthy: 1, health_state: 0, latency_ms: 20, last_checked: null, skipped: 0 },
            { dependency_id: 'dep-1', service_id: 'svc-2', service_name: 'Service Beta', service_team_id: 'team-1', service_team_name: 'Team One', healthy: 1, health_state: 0, latency_ms: 30, last_checked: null, skipped: 0 },
          ],
        }),
      ],
    }));

    renderWallboard();
    await waitFor(() => expect(screen.getByText('10 / 20 / 30 ms')).toBeInTheDocument());
  });

  it('hides latency row when null', async () => {
    mockFetchWallboard.mockResolvedValue(makeResponse({
      dependencies: [
        makeDep({
          latency: null,
          reporters: [
            { dependency_id: 'dep-1', service_id: 'svc-1', service_name: 'Service Alpha', service_team_id: 'team-1', service_team_name: 'Team One', healthy: 1, health_state: 0, latency_ms: null, last_checked: null, skipped: 0 },
          ],
        }),
      ],
    }));

    renderWallboard();
    await waitFor(() => expect(screen.getByText('PostgreSQL')).toBeInTheDocument());
    expect(screen.queryByText(/Latency/)).not.toBeInTheDocument();
  });

  it('shows linked service name on card', async () => {
    mockFetchWallboard.mockResolvedValue(makeResponse({
      dependencies: [
        makeDep({ linked_service: { id: 'svc-target', name: 'Target Service' } }),
      ],
    }));

    renderWallboard();
    await waitFor(() => expect(screen.getByText('Target Service')).toBeInTheDocument());
  });

  it('shows reporter count on card with multiple reporters', async () => {
    mockFetchWallboard.mockResolvedValue(makeResponse({
      dependencies: [
        makeDep({
          reporters: [
            { dependency_id: 'dep-1', service_id: 'svc-1', service_name: 'Service Alpha', service_team_id: 'team-1', service_team_name: 'Team One', healthy: 1, health_state: 0, latency_ms: 20, last_checked: null, skipped: 0 },
            { dependency_id: 'dep-2', service_id: 'svc-2', service_name: 'Service Beta', service_team_id: 'team-1', service_team_name: 'Team One', healthy: 1, health_state: 0, latency_ms: 30, last_checked: null, skipped: 0 },
          ],
        }),
      ],
    }));

    renderWallboard();
    await waitFor(() => expect(screen.getByText('2 services')).toBeInTheDocument());
  });

  it('shows reporter name on card with single reporter', async () => {
    mockFetchWallboard.mockResolvedValue(makeResponse({
      dependencies: [
        makeDep({
          reporters: [
            { dependency_id: 'dep-1', service_id: 'svc-1', service_name: 'Service Alpha', service_team_id: 'team-1', service_team_name: 'Team One', healthy: 1, health_state: 0, latency_ms: 20, last_checked: null, skipped: 0 },
          ],
        }),
      ],
    }));

    renderWallboard();
    await waitFor(() => expect(screen.getByText('Service Alpha')).toBeInTheDocument());
  });

  it('opens detail panel on card click', async () => {
    mockFetchWallboard.mockResolvedValue(makeResponse());

    renderWallboard();
    await waitFor(() => expect(screen.getByText('PostgreSQL')).toBeInTheDocument());

    fireEvent.click(screen.getByText('PostgreSQL').closest('div[class*="card"]')!);

    expect(screen.getByTestId('detail-panel')).toBeInTheDocument();
  });

  it('shows loading state', async () => {
    mockFetchWallboard.mockImplementation(() => new Promise(() => {}));

    renderWallboard();

    expect(screen.getByText('Loading wallboard...')).toBeInTheDocument();
  });

  it('shows error state and allows retry', async () => {
    mockFetchWallboard
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(makeResponse());

    renderWallboard();

    await waitFor(() => expect(screen.getByText(/Error:.*Network error/)).toBeInTheDocument());

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => expect(screen.getByText('PostgreSQL')).toBeInTheDocument());
  });

  it('shows empty state when no dependencies', async () => {
    mockFetchWallboard.mockResolvedValue(makeResponse({ dependencies: [] }));

    renderWallboard();

    await waitFor(() => expect(screen.getByText('No dependencies found.')).toBeInTheDocument());
  });

  it('shows healthy empty state when filter active and all healthy', async () => {
    mockFetchWallboard.mockResolvedValue(makeResponse({
      dependencies: [makeDep({ health_status: 'healthy' })],
    }));

    renderWallboard();
    await waitFor(() => expect(screen.getByText('PostgreSQL')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Unhealthy only'));

    expect(screen.getByText('All dependencies are healthy!')).toBeInTheDocument();
  });

  it('persists team filter in localStorage', async () => {
    mockFetchWallboard.mockResolvedValue(makeResponse({
      teams: [
        { id: 'team-1', name: 'Team One' },
        { id: 'team-2', name: 'Team Two' },
      ],
    }));

    renderWallboard();
    await waitFor(() => expect(screen.getByLabelText('Filter by team')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Filter by team'), { target: { value: 'team-2' } });
    expect(localStorage.getItem('wallboard-filter-team')).toBe('team-2');
  });

  it('restores team filter from localStorage', async () => {
    localStorage.setItem('wallboard-filter-team', 'team-2');
    mockFetchWallboard.mockResolvedValue(makeResponse({
      dependencies: [
        makeDep({ canonical_name: 'PostgreSQL', team_ids: ['team-1'] }),
        makeDep({ canonical_name: 'Redis', primary_dependency_id: 'dep-2', team_ids: ['team-2'] }),
      ],
      teams: [
        { id: 'team-1', name: 'Team One' },
        { id: 'team-2', name: 'Team Two' },
      ],
    }));

    renderWallboard();
    await waitFor(() => expect(screen.getByText('Redis')).toBeInTheDocument());

    expect(screen.queryByText('PostgreSQL')).not.toBeInTheDocument();
  });

  it('restores unhealthy filter from localStorage', async () => {
    localStorage.setItem('wallboard-filter-unhealthy', 'true');
    mockFetchWallboard.mockResolvedValue(makeResponse({
      dependencies: [
        makeDep({ canonical_name: 'Healthy DB', health_status: 'healthy' }),
        makeDep({ canonical_name: 'Down Redis', primary_dependency_id: 'dep-2', health_status: 'critical' }),
      ],
    }));

    renderWallboard();
    await waitFor(() => expect(screen.getByText('Down Redis')).toBeInTheDocument());

    expect(screen.queryByText('Healthy DB')).not.toBeInTheDocument();
  });

  it('handles non-Error exception', async () => {
    mockFetchWallboard.mockRejectedValueOnce('String error');

    renderWallboard();

    await waitFor(() => expect(screen.getByText(/Error:.*Failed to load dependencies/)).toBeInTheDocument());
  });

  it('shows error message on card', async () => {
    mockFetchWallboard.mockResolvedValue(makeResponse({
      dependencies: [
        makeDep({ error_message: 'Connection refused' }),
      ],
    }));

    renderWallboard();
    await waitFor(() => expect(screen.getByText('Connection refused')).toBeInTheDocument());
  });

  it('shows last checked time on card', async () => {
    mockFetchWallboard.mockResolvedValue(makeResponse({
      dependencies: [
        makeDep({ last_checked: '2025-01-01T00:00:00Z' }),
      ],
    }));

    renderWallboard();
    await waitFor(() => expect(screen.getByText('Last checked')).toBeInTheDocument());
  });
});
