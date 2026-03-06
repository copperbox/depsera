import { render, screen, waitFor } from '@testing-library/react';
import TeamOverviewStats from './TeamOverviewStats';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockMembers = [
  { team_id: 't1', user_id: 'u1', role: 'lead' as const, created_at: '', user: { id: 'u1', email: 'a@test.com', name: 'Alice', role: 'admin', is_active: 1 } },
  { team_id: 't1', user_id: 'u2', role: 'member' as const, created_at: '', user: { id: 'u2', email: 'b@test.com', name: 'Bob', role: 'user', is_active: 1 } },
  { team_id: 't1', user_id: 'u3', role: 'member' as const, created_at: '', user: { id: 'u3', email: 'c@test.com', name: 'Carol', role: 'user', is_active: 1 } },
];

const mockTeamServices = [
  { id: 's1', name: 'Svc A', team_id: 't1', health_endpoint: '/health', metrics_endpoint: null, is_active: 1, manifest_managed: 1, created_at: '', updated_at: '' },
  { id: 's2', name: 'Svc B', team_id: 't1', health_endpoint: '/health', metrics_endpoint: null, is_active: 1, manifest_managed: 0, created_at: '', updated_at: '' },
  { id: 's3', name: 'Svc C', team_id: 't1', health_endpoint: '/health', metrics_endpoint: null, is_active: 0, manifest_managed: 0, created_at: '', updated_at: '' },
];

const mockServicesWithHealth = [
  {
    id: 's1', name: 'Svc A', team_id: 't1',
    health: { status: 'healthy', healthy_reports: 5, warning_reports: 0, critical_reports: 0, total_reports: 5, dependent_count: 1 },
    dependencies: [{ id: 'd1' }, { id: 'd2' }],
  },
  {
    id: 's2', name: 'Svc B', team_id: 't1',
    health: { status: 'warning', healthy_reports: 3, warning_reports: 2, critical_reports: 0, total_reports: 5, dependent_count: 0 },
    dependencies: [{ id: 'd3' }],
  },
  {
    id: 's3', name: 'Svc C', team_id: 't1',
    health: { status: 'critical', healthy_reports: 0, warning_reports: 0, critical_reports: 5, total_reports: 5, dependent_count: 0 },
    dependencies: [],
  },
];

beforeEach(() => {
  mockFetch.mockReset();
});

describe('TeamOverviewStats', () => {
  it('renders member count and role breakdown', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockServicesWithHealth));

    render(
      <TeamOverviewStats teamId="t1" members={mockMembers} services={mockTeamServices} />
    );

    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('1 lead · 2 members')).toBeInTheDocument();
    // Verify member count appears in the Members card
    const membersLabel = screen.getByText('Members');
    const membersCard = membersLabel.closest('div');
    expect(membersCard?.querySelector('[class*="cardValue"]')?.textContent).toBe('3');
  });

  it('renders service count with active/inactive and manifest breakdown', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockServicesWithHealth));

    render(
      <TeamOverviewStats teamId="t1" members={mockMembers} services={mockTeamServices} />
    );

    expect(screen.getByText('Services')).toBeInTheDocument();
    expect(screen.getByText('2 active · 1 inactive · 1 manifest-managed')).toBeInTheDocument();
  });

  it('renders health stats after loading', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockServicesWithHealth));

    render(
      <TeamOverviewStats teamId="t1" members={mockMembers} services={mockTeamServices} />
    );

    await waitFor(() => {
      expect(screen.getByText('Service Health')).toBeInTheDocument();
    });

    expect(screen.getByText('1 healthy · 1 warning · 1 critical')).toBeInTheDocument();
  });

  it('renders dependency count after loading', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockServicesWithHealth));

    render(
      <TeamOverviewStats teamId="t1" members={mockMembers} services={mockTeamServices} />
    );

    await waitFor(() => {
      expect(screen.getByText('Dependencies')).toBeInTheDocument();
    });

    expect(screen.getByText('across 3 services')).toBeInTheDocument();
  });

  it('renders health bar when services have health data', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockServicesWithHealth));

    render(
      <TeamOverviewStats teamId="t1" members={mockMembers} services={mockTeamServices} />
    );

    await waitFor(() => {
      expect(screen.getByText('Health Overview')).toBeInTheDocument();
    });

    expect(screen.getByRole('img', { name: /team health distribution/i })).toBeInTheDocument();
    expect(screen.getByText(/Healthy \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Warning \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Critical \(1\)/)).toBeInTheDocument();
  });

  it('shows error message on fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(
      <TeamOverviewStats teamId="t1" members={mockMembers} services={mockTeamServices} />
    );

    await waitFor(() => {
      expect(screen.getByText('Failed to load health data')).toBeInTheDocument();
    });
  });

  it('does not render health bar when no services', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    render(
      <TeamOverviewStats teamId="t1" members={mockMembers} services={[]} />
    );

    await waitFor(() => {
      expect(screen.getByText('Dependencies')).toBeInTheDocument();
    });

    expect(screen.queryByText('Health Overview')).not.toBeInTheDocument();
  });
});
