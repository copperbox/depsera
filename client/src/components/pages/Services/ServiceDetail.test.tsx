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

  it('displays dependencies table', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockService))
      .mockResolvedValueOnce(jsonResponse(mockTeams))
      .mockResolvedValueOnce(jsonResponse([])); // suggestions

    renderServiceDetail();

    await waitFor(() => {
      expect(screen.getByText('Dependencies')).toBeInTheDocument();
    });

    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    expect(screen.getAllByText('database').length).toBeGreaterThan(0);
    expect(screen.getByText('Main DB')).toBeInTheDocument();
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

});
