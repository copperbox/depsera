import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ServiceForm from './ServiceForm';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockTeams = [
  { id: 't1', name: 'Team A', description: null, created_at: '', updated_at: '', member_count: 3, service_count: 2 },
  { id: 't2', name: 'Team B', description: null, created_at: '', updated_at: '', member_count: 2, service_count: 1 },
];

const mockService = {
  id: 's1',
  name: 'Test Service',
  team_id: 't1',
  team: { id: 't1', name: 'Team A', description: null, created_at: '', updated_at: '' },
  health_endpoint: 'https://example.com/health',
  metrics_endpoint: 'https://example.com/metrics',
  schema_config: null,
  is_active: 1,
  last_poll_success: 1,
  last_poll_error: null,
  health: { status: 'healthy' as const, last_report: null, healthy_reports: 0, warning_reports: 0, critical_reports: 0, total_reports: 0, dependent_count: 0 },
  dependencies: [],
  dependent_reports: [],
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('ServiceForm', () => {
  it('renders create form with empty fields', () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<ServiceForm teams={mockTeams} onSuccess={onSuccess} onCancel={onCancel} />);

    expect(screen.getByLabelText(/Name/)).toHaveValue('');
    expect(screen.getByLabelText(/Team/)).toHaveValue('');
    expect(screen.getByLabelText(/Health Endpoint/)).toHaveValue('');
    expect(screen.getByText('Create Service')).toBeInTheDocument();
  });

  it('renders edit form with populated fields', () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<ServiceForm teams={mockTeams} service={mockService} onSuccess={onSuccess} onCancel={onCancel} />);

    expect(screen.getByLabelText(/Name/)).toHaveValue('Test Service');
    expect(screen.getByLabelText(/Team/)).toHaveValue('t1');
    expect(screen.getByLabelText(/Health Endpoint/)).toHaveValue('https://example.com/health');
    expect(screen.getByLabelText(/Metrics Endpoint/)).toHaveValue('https://example.com/metrics');
    expect(screen.getByText('Save Changes')).toBeInTheDocument();
  });

  it('shows is_active checkbox only in edit mode', () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    const { rerender } = render(<ServiceForm teams={mockTeams} onSuccess={onSuccess} onCancel={onCancel} />);
    expect(screen.queryByText('Service is active')).not.toBeInTheDocument();

    rerender(<ServiceForm teams={mockTeams} service={mockService} onSuccess={onSuccess} onCancel={onCancel} />);
    expect(screen.getByText('Service is active')).toBeInTheDocument();
  });

  it('validates required fields on submit', async () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<ServiceForm teams={mockTeams} onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.click(screen.getByText('Create Service'));

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
      expect(screen.getByText('Team is required')).toBeInTheDocument();
      expect(screen.getByText('Health endpoint is required')).toBeInTheDocument();
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });


  it('creates service successfully', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 's2', name: 'New Service' }));

    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<ServiceForm teams={mockTeams} onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'New Service' } });
    fireEvent.change(screen.getByLabelText(/Team/), { target: { value: 't1' } });
    fireEvent.change(screen.getByLabelText(/Health Endpoint/), { target: { value: 'https://example.com/health' } });

    fireEvent.click(screen.getByText('Create Service'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/services',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: 'New Service',
            team_id: 't1',
            health_endpoint: 'https://example.com/health',
            schema_config: null,
          }),
        })
      );
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('creates service with optional metrics endpoint', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 's2', name: 'New Service' }));

    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<ServiceForm teams={mockTeams} onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'New Service' } });
    fireEvent.change(screen.getByLabelText(/Team/), { target: { value: 't1' } });
    fireEvent.change(screen.getByLabelText(/Health Endpoint/), { target: { value: 'https://example.com/health' } });
    fireEvent.change(screen.getByLabelText(/Metrics Endpoint/), { target: { value: 'https://example.com/metrics' } });

    fireEvent.click(screen.getByText('Create Service'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/services',
        expect.objectContaining({
          body: JSON.stringify({
            name: 'New Service',
            team_id: 't1',
            health_endpoint: 'https://example.com/health',
            metrics_endpoint: 'https://example.com/metrics',
            schema_config: null,
          }),
        })
      );
    });
  });

  it('updates service successfully', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ...mockService, name: 'Updated Service' }));

    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<ServiceForm teams={mockTeams} service={mockService} onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Updated Service' } });

    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/services/s1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            name: 'Updated Service',
            team_id: 't1',
            health_endpoint: 'https://example.com/health',
            metrics_endpoint: 'https://example.com/metrics',
            is_active: true,
            schema_config: null,
          }),
        })
      );
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('handles submit error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Failed to create service'));

    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<ServiceForm teams={mockTeams} onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'New Service' } });
    fireEvent.change(screen.getByLabelText(/Team/), { target: { value: 't1' } });
    fireEvent.change(screen.getByLabelText(/Health Endpoint/), { target: { value: 'https://example.com/health' } });

    fireEvent.click(screen.getByText('Create Service'));

    await waitFor(() => {
      expect(screen.getByText('Failed to create service')).toBeInTheDocument();
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('handles non-Error exception', async () => {
    mockFetch.mockRejectedValueOnce('String error');

    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<ServiceForm teams={mockTeams} onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'New Service' } });
    fireEvent.change(screen.getByLabelText(/Team/), { target: { value: 't1' } });
    fireEvent.change(screen.getByLabelText(/Health Endpoint/), { target: { value: 'https://example.com/health' } });

    fireEvent.click(screen.getByText('Create Service'));

    await waitFor(() => {
      expect(screen.getByText('Failed to save service')).toBeInTheDocument();
    });
  });

  it('calls onCancel when cancel button clicked', () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<ServiceForm teams={mockTeams} onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.click(screen.getByText('Cancel'));

    expect(onCancel).toHaveBeenCalled();
  });

  it('disables form fields during submission', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<ServiceForm teams={mockTeams} onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'New Service' } });
    fireEvent.change(screen.getByLabelText(/Team/), { target: { value: 't1' } });
    fireEvent.change(screen.getByLabelText(/Health Endpoint/), { target: { value: 'https://example.com/health' } });

    fireEvent.click(screen.getByText('Create Service'));

    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/Name/)).toBeDisabled();
    expect(screen.getByLabelText(/Team/)).toBeDisabled();
    expect(screen.getByLabelText(/Health Endpoint/)).toBeDisabled();
    expect(screen.getByText('Cancel')).toBeDisabled();
  });

  it('toggles is_active checkbox', () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<ServiceForm teams={mockTeams} service={mockService} onSuccess={onSuccess} onCancel={onCancel} />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it('renders team options correctly', () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<ServiceForm teams={mockTeams} onSuccess={onSuccess} onCancel={onCancel} />);

    expect(screen.getByText('Select a team')).toBeInTheDocument();
    expect(screen.getByText('Team A')).toBeInTheDocument();
    expect(screen.getByText('Team B')).toBeInTheDocument();
  });

  it('handles service with is_active = 0', () => {
    const inactiveService = { ...mockService, is_active: 0 };
    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<ServiceForm teams={mockTeams} service={inactiveService} onSuccess={onSuccess} onCancel={onCancel} />);

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
  });

  describe('schema config integration', () => {
    it('renders Health Endpoint Format section', () => {
      render(<ServiceForm teams={mockTeams} onSuccess={jest.fn()} onCancel={jest.fn()} />);

      expect(screen.getByText('Health Endpoint Format')).toBeInTheDocument();
      expect(screen.getByText('proactive-deps (default)')).toBeInTheDocument();
      expect(screen.getByText('Custom schema')).toBeInTheDocument();
    });

    it('defaults to proactive-deps mode for new service', () => {
      render(<ServiceForm teams={mockTeams} onSuccess={jest.fn()} onCancel={jest.fn()} />);

      // Guided fields should not be visible in default mode
      expect(screen.queryByLabelText(/Path to dependencies/)).not.toBeInTheDocument();
    });

    it('shows guided form when Custom schema is selected', () => {
      render(<ServiceForm teams={mockTeams} onSuccess={jest.fn()} onCancel={jest.fn()} />);

      fireEvent.click(screen.getByText('Custom schema'));

      expect(screen.getByLabelText(/Path to dependencies/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Name field/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Healthy field/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Healthy equals value/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Latency field/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Impact field/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Description field/)).toBeInTheDocument();
    });

    it('hides guided form when switching back to default', () => {
      render(<ServiceForm teams={mockTeams} onSuccess={jest.fn()} onCancel={jest.fn()} />);

      fireEvent.click(screen.getByText('Custom schema'));
      expect(screen.getByLabelText(/Path to dependencies/)).toBeInTheDocument();

      fireEvent.click(screen.getByText('proactive-deps (default)'));
      expect(screen.queryByLabelText(/Path to dependencies/)).not.toBeInTheDocument();
    });

    it('includes schema_config in create request when custom schema is configured', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 's2', name: 'New Service' }));

      render(<ServiceForm teams={mockTeams} onSuccess={jest.fn()} onCancel={jest.fn()} />);

      // Fill required fields
      fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'New Service' } });
      fireEvent.change(screen.getByLabelText(/Team/), { target: { value: 't1' } });
      fireEvent.change(screen.getByLabelText(/Health Endpoint/), { target: { value: 'https://example.com/health' } });

      // Switch to custom schema
      fireEvent.click(screen.getByText('Custom schema'));

      // Fill schema fields
      fireEvent.change(screen.getByLabelText(/Path to dependencies/), { target: { value: 'checks' } });
      fireEvent.change(screen.getByLabelText(/Name field/), { target: { value: 'checkName' } });
      fireEvent.change(screen.getByLabelText(/Healthy field/), { target: { value: 'status' } });
      fireEvent.change(screen.getByLabelText(/Healthy equals value/), { target: { value: 'UP' } });

      fireEvent.click(screen.getByText('Create Service'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/services',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
              name: 'New Service',
              team_id: 't1',
              health_endpoint: 'https://example.com/health',
              schema_config: JSON.stringify({
                root: 'checks',
                fields: {
                  name: 'checkName',
                  healthy: { field: 'status', equals: 'UP' },
                },
              }),
            }),
          })
        );
      });
    });

    it('sends schema_config: null when using default format', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 's2', name: 'New Service' }));

      render(<ServiceForm teams={mockTeams} onSuccess={jest.fn()} onCancel={jest.fn()} />);

      fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'New Service' } });
      fireEvent.change(screen.getByLabelText(/Team/), { target: { value: 't1' } });
      fireEvent.change(screen.getByLabelText(/Health Endpoint/), { target: { value: 'https://example.com/health' } });

      fireEvent.click(screen.getByText('Create Service'));

      await waitFor(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.schema_config).toBeNull();
      });
    });

    it('populates schema editor from existing service schema_config', () => {
      const serviceWithSchema = {
        ...mockService,
        schema_config: JSON.stringify({
          root: 'data.checks',
          fields: {
            name: 'serviceName',
            healthy: { field: 'status', equals: 'UP' },
            latency: 'responseTimeMs',
          },
        }),
      };

      render(<ServiceForm teams={mockTeams} service={serviceWithSchema} onSuccess={jest.fn()} onCancel={jest.fn()} />);

      // Should show custom schema mode with populated fields
      expect(screen.getByLabelText(/Path to dependencies/)).toHaveValue('data.checks');
      expect(screen.getByLabelText(/Name field/)).toHaveValue('serviceName');
      expect(screen.getByLabelText(/Healthy field/)).toHaveValue('status');
      expect(screen.getByLabelText(/Healthy equals value/)).toHaveValue('UP');
      expect(screen.getByLabelText(/Latency field/)).toHaveValue('responseTimeMs');
    });

    it('shows proactive-deps mode for service without schema_config', () => {
      render(<ServiceForm teams={mockTeams} service={mockService} onSuccess={jest.fn()} onCancel={jest.fn()} />);

      // Should not show guided fields
      expect(screen.queryByLabelText(/Path to dependencies/)).not.toBeInTheDocument();
    });

    it('shows Test mapping button when in custom schema mode', () => {
      render(<ServiceForm teams={mockTeams} onSuccess={jest.fn()} onCancel={jest.fn()} />);

      fireEvent.click(screen.getByText('Custom schema'));

      expect(screen.getByText('Test mapping')).toBeInTheDocument();
    });

    it('disables Test mapping button when health endpoint is empty', () => {
      render(<ServiceForm teams={mockTeams} onSuccess={jest.fn()} onCancel={jest.fn()} />);

      fireEvent.click(screen.getByText('Custom schema'));

      const testButton = screen.getByText('Test mapping');
      expect(testButton).toBeDisabled();
    });

    it('toggles between guided form and raw JSON editor', () => {
      render(<ServiceForm teams={mockTeams} onSuccess={jest.fn()} onCancel={jest.fn()} />);

      fireEvent.click(screen.getByText('Custom schema'));

      // Should show guided form by default
      expect(screen.getByLabelText(/Path to dependencies/)).toBeInTheDocument();

      // Switch to advanced mode
      fireEvent.click(screen.getByText('Advanced (JSON)'));

      // Should show JSON editor
      expect(screen.getByLabelText(/Raw JSON/)).toBeInTheDocument();
      expect(screen.queryByLabelText(/Path to dependencies/)).not.toBeInTheDocument();

      // Switch back to guided
      fireEvent.click(screen.getByText('Guided form'));

      expect(screen.getByLabelText(/Path to dependencies/)).toBeInTheDocument();
      expect(screen.queryByLabelText(/Raw JSON/)).not.toBeInTheDocument();
    });

    it('calls test-schema endpoint and shows preview', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({
        success: true,
        dependencies: [
          { name: 'db', healthy: true, latency_ms: 5, impact: 'critical', description: null, type: 'database' },
          { name: 'cache', healthy: false, latency_ms: null, impact: null, description: null, type: 'other' },
        ],
        warnings: ['No description field mapping configured'],
      }));

      render(<ServiceForm teams={mockTeams} onSuccess={jest.fn()} onCancel={jest.fn()} />);

      // Fill health endpoint first
      fireEvent.change(screen.getByLabelText(/Health Endpoint/), { target: { value: 'https://example.com/health' } });

      // Switch to custom schema
      fireEvent.click(screen.getByText('Custom schema'));

      // Fill schema fields
      fireEvent.change(screen.getByLabelText(/Path to dependencies/), { target: { value: 'checks' } });
      fireEvent.change(screen.getByLabelText(/Name field/), { target: { value: 'name' } });
      fireEvent.change(screen.getByLabelText(/Healthy field/), { target: { value: 'healthy' } });

      fireEvent.click(screen.getByText('Test mapping'));

      await waitFor(() => {
        expect(screen.getByText('db')).toBeInTheDocument();
        expect(screen.getByText('cache')).toBeInTheDocument();
      });

      // Check preview content
      expect(screen.getByText('Preview (2 dependencies)')).toBeInTheDocument();
      expect(screen.getByText('No description field mapping configured')).toBeInTheDocument();
    });

    it('shows test error when test-schema fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      render(<ServiceForm teams={mockTeams} onSuccess={jest.fn()} onCancel={jest.fn()} />);

      fireEvent.change(screen.getByLabelText(/Health Endpoint/), { target: { value: 'https://example.com/health' } });
      fireEvent.click(screen.getByText('Custom schema'));

      fireEvent.change(screen.getByLabelText(/Path to dependencies/), { target: { value: 'checks' } });
      fireEvent.change(screen.getByLabelText(/Name field/), { target: { value: 'name' } });
      fireEvent.change(screen.getByLabelText(/Healthy field/), { target: { value: 'healthy' } });

      fireEvent.click(screen.getByText('Test mapping'));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('creates service with simple boolean healthy mapping (no equals value)', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 's2', name: 'New Service' }));

      render(<ServiceForm teams={mockTeams} onSuccess={jest.fn()} onCancel={jest.fn()} />);

      fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'New Service' } });
      fireEvent.change(screen.getByLabelText(/Team/), { target: { value: 't1' } });
      fireEvent.change(screen.getByLabelText(/Health Endpoint/), { target: { value: 'https://example.com/health' } });

      fireEvent.click(screen.getByText('Custom schema'));

      fireEvent.change(screen.getByLabelText(/Path to dependencies/), { target: { value: 'checks' } });
      fireEvent.change(screen.getByLabelText(/Name field/), { target: { value: 'name' } });
      fireEvent.change(screen.getByLabelText(/Healthy field/), { target: { value: 'isHealthy' } });
      // Don't fill "Healthy equals value" — should use simple string mapping

      fireEvent.click(screen.getByText('Create Service'));

      await waitFor(() => {
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        const schema = JSON.parse(body.schema_config);
        expect(schema.fields.healthy).toBe('isHealthy');
      });
    });
  });
});
