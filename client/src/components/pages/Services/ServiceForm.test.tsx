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
  health: { status: 'healthy', last_report: null, healthy_reports: 0, total_reports: 0, dependent_count: 0 },
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
});
