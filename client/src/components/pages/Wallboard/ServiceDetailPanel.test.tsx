import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../../../api/services');
import { fetchService } from '../../../api/services';
import { ServiceDetailPanel } from './ServiceDetailPanel';

const mockFetchService = fetchService as jest.MockedFunction<typeof fetchService>;

const mockService = {
  id: 's1',
  name: 'Test Service',
  team_id: 't1',
  team: { id: 't1', name: 'Team Alpha', description: null, created_at: '', updated_at: '' },
  health_endpoint: 'https://example.com/health',
  metrics_endpoint: null,
  schema_config: null,
  is_active: 1,
  last_poll_success: 1,
  last_poll_error: null,
  poll_warnings: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
  health: {
    status: 'healthy' as const,
    healthy_reports: 5,
    warning_reports: 0,
    critical_reports: 0,
    total_reports: 5,
    dependent_count: 2,
    last_report: '2024-01-15T10:00:00Z',
  },
  dependencies: [
    {
      id: 'd1',
      service_id: 's1',
      name: 'database',
      canonical_name: null,
      description: null,
      impact: null,
      contact: null,
      contact_override: null,
      impact_override: null,
      effective_contact: null,
      effective_impact: null,
      healthy: 1,
      health_state: 0 as const,
      health_code: null,
      latency_ms: 25,
      last_checked: null,
      last_status_change: null,
      created_at: '',
      updated_at: '',
    },
  ],
  dependent_reports: [
    {
      dependency_id: 'dr1',
      dependency_name: 'test-service',
      reporting_service_id: 's2',
      reporting_service_name: 'API Gateway',
      healthy: 1,
      health_state: 0 as const,
      latency_ms: 15,
      last_checked: null,
      impact: null,
    },
  ],
};

function renderPanel(serviceId = 's1', onClose = jest.fn()) {
  return render(
    <MemoryRouter>
      <ServiceDetailPanel serviceId={serviceId} onClose={onClose} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockFetchService.mockReset();
});

describe('ServiceDetailPanel', () => {
  it('shows loading state initially', () => {
    mockFetchService.mockImplementation(() => new Promise(() => {}));

    renderPanel();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('displays service details after loading', async () => {
    mockFetchService.mockResolvedValueOnce(mockService);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/health')).toBeInTheDocument();
    // "Healthy" appears in both status badge and stats label
    expect(screen.getAllByText('Healthy').length).toBeGreaterThan(0);
  });

  it('displays error state', async () => {
    mockFetchService.mockRejectedValueOnce(new Error('Network error'));

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('handles non-Error exception', async () => {
    mockFetchService.mockRejectedValueOnce('String error');

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Failed to load service')).toBeInTheDocument();
    });
  });

  it('shows service not found when null response', async () => {
    mockFetchService.mockResolvedValueOnce(null as unknown as typeof mockService);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Service not found')).toBeInTheDocument();
    });
  });

  it('calls onClose when close button clicked in loading state', () => {
    mockFetchService.mockImplementation(() => new Promise(() => {}));
    const onClose = jest.fn();

    renderPanel('s1', onClose);

    fireEvent.click(screen.getByLabelText('Close panel'));

    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when close button clicked in loaded state', async () => {
    mockFetchService.mockResolvedValueOnce(mockService);
    const onClose = jest.fn();

    renderPanel('s1', onClose);

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Close panel'));

    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when close button clicked in error state', async () => {
    mockFetchService.mockRejectedValueOnce(new Error('Fetch failed'));
    const onClose = jest.fn();

    renderPanel('s1', onClose);

    await waitFor(() => {
      expect(screen.getByText('Fetch failed')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Close panel'));

    expect(onClose).toHaveBeenCalled();
  });

  it('displays health summary stats', async () => {
    mockFetchService.mockResolvedValueOnce(mockService);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Reports')).toBeInTheDocument();
    });

    // "5" appears twice - for total_reports and healthy_reports
    expect(screen.getAllByText('5').length).toBe(2);
  });

  it('displays dependencies list', async () => {
    mockFetchService.mockResolvedValueOnce(mockService);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Dependencies (1)')).toBeInTheDocument();
    });

    expect(screen.getByText('database')).toBeInTheDocument();
    expect(screen.getByText('25ms')).toBeInTheDocument();
  });

  it('displays dependent reports list', async () => {
    mockFetchService.mockResolvedValueOnce(mockService);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Dependent Reports (1)')).toBeInTheDocument();
    });

    expect(screen.getByText('API Gateway')).toBeInTheDocument();
    expect(screen.getByText('15ms')).toBeInTheDocument();
  });

  it('displays latency in seconds for large values', async () => {
    const serviceWithHighLatency = {
      ...mockService,
      dependencies: [
        { ...mockService.dependencies[0], latency_ms: 1500 },
      ],
    };
    mockFetchService.mockResolvedValueOnce(serviceWithHighLatency);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('1.5s')).toBeInTheDocument();
    });
  });

  it('displays poll failure message', async () => {
    const serviceWithPollFailure = {
      ...mockService,
      last_poll_success: 0,
      last_poll_error: 'Connection timeout',
    };
    mockFetchService.mockResolvedValueOnce(serviceWithPollFailure);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText(/Poll failed.*Connection timeout/)).toBeInTheDocument();
    });
  });

  it('displays poll failure without error message', async () => {
    const serviceWithPollFailure = {
      ...mockService,
      last_poll_success: 0,
      last_poll_error: null,
    };
    mockFetchService.mockResolvedValueOnce(serviceWithPollFailure);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Poll failed')).toBeInTheDocument();
    });
  });

  it('displays warning status', async () => {
    const warningService = {
      ...mockService,
      health: { ...mockService.health, status: 'warning' as const },
    };
    mockFetchService.mockResolvedValueOnce(warningService);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Warning')).toBeInTheDocument();
    });
  });

  it('displays critical status', async () => {
    const criticalService = {
      ...mockService,
      health: { ...mockService.health, status: 'critical' as const },
    };
    mockFetchService.mockResolvedValueOnce(criticalService);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });
  });

  it('displays unknown status', async () => {
    const unknownService = {
      ...mockService,
      health: { ...mockService.health, status: 'unknown' as const },
    };
    mockFetchService.mockResolvedValueOnce(unknownService);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  it('displays impact section for critical services with impact data', async () => {
    const criticalWithImpact = {
      ...mockService,
      health: { ...mockService.health, status: 'critical' as const },
      dependencies: [
        { ...mockService.dependencies[0], healthy: 0, impact: 'Data unavailable' },
      ],
    };
    mockFetchService.mockResolvedValueOnce(criticalWithImpact);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Impact')).toBeInTheDocument();
      expect(screen.getByText('Data unavailable')).toBeInTheDocument();
    });
  });

  it('displays unhealthy dependent report with impact', async () => {
    const serviceWithUnhealthyReport = {
      ...mockService,
      dependent_reports: [
        { ...mockService.dependent_reports[0], healthy: 0, impact: 'Service degraded' },
      ],
    };
    mockFetchService.mockResolvedValueOnce(serviceWithUnhealthyReport);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('API Gateway: Service degraded')).toBeInTheDocument();
    });
  });

  it('shows "Never" for null last_report', async () => {
    const serviceNoReport = {
      ...mockService,
      health: { ...mockService.health, last_report: null },
    };
    mockFetchService.mockResolvedValueOnce(serviceNoReport);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Never')).toBeInTheDocument();
    });
  });

  it('hides dependencies section when empty', async () => {
    const noDepsService = { ...mockService, dependencies: [] };
    mockFetchService.mockResolvedValueOnce(noDepsService);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Dependencies \(/)).not.toBeInTheDocument();
  });

  it('hides dependent reports section when empty', async () => {
    const noReportsService = { ...mockService, dependent_reports: [] };
    mockFetchService.mockResolvedValueOnce(noReportsService);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Test Service')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Dependent Reports \(/)).not.toBeInTheDocument();
  });

  it('displays View Full Details link', async () => {
    mockFetchService.mockResolvedValueOnce(mockService);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('View Full Details')).toBeInTheDocument();
    });
  });

  it('displays dependency with high latency in seconds', async () => {
    const serviceWithHighLatencyReport = {
      ...mockService,
      dependent_reports: [
        { ...mockService.dependent_reports[0], latency_ms: 2500 },
      ],
    };
    mockFetchService.mockResolvedValueOnce(serviceWithHighLatencyReport);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('2.5s')).toBeInTheDocument();
    });
  });

  it('hides latency when null for dependencies', async () => {
    const serviceNullLatency = {
      ...mockService,
      dependencies: [
        { ...mockService.dependencies[0], latency_ms: null },
      ],
    };
    mockFetchService.mockResolvedValueOnce(serviceNullLatency);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('database')).toBeInTheDocument();
    });

    expect(screen.queryByText('ms')).not.toBeInTheDocument();
  });
});
