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

function renderServicesList(isAdmin = false) {
  mockUseAuth.mockReturnValue({ isAdmin });
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

    renderServicesList();

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

    renderServicesList();

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

  it('filters services by team', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList();

    await waitFor(() => {
      expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Filter by team'), {
      target: { value: 't2' },
    });

    expect(screen.getByText('Service Beta')).toBeInTheDocument();
    expect(screen.queryByText('Service Alpha')).not.toBeInTheDocument();
    expect(screen.queryByText('Service Gamma')).not.toBeInTheDocument();
  });

  it('shows empty state when no services match', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList();

    await waitFor(() => {
      expect(screen.getByText('Service Alpha')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Search services...'), {
      target: { value: 'nonexistent' },
    });

    expect(screen.getByText('No services match your search criteria.')).toBeInTheDocument();
  });

  it('shows empty state when no services exist', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList();

    await waitFor(() => {
      expect(screen.getByText('No services have been added yet.')).toBeInTheDocument();
    });
  });

  it('shows add button for admin users', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList(true);

    await waitFor(() => {
      expect(screen.getByText('Add Service')).toBeInTheDocument();
    });
  });

  it('hides add button for non-admin users', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockServices))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderServicesList(false);

    await waitFor(() => {
      expect(screen.getByText('Services')).toBeInTheDocument();
    });

    expect(screen.queryByText('Add Service')).not.toBeInTheDocument();
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
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem('services-auto-refresh')).toBe('true');
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

    renderServicesList(true);

    await waitFor(() => {
      expect(screen.getByText('Add Service')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Service'));

    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument();
  });
});
