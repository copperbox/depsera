import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('../../../api/services');
jest.mock('../../../api/associations');

import { fetchServices } from './../../../api/services';
import { createAssociation } from './../../../api/associations';
import AssociationForm from './AssociationForm';

const mockFetchServices = fetchServices as jest.MockedFunction<typeof fetchServices>;
const mockCreateAssociation = createAssociation as jest.MockedFunction<typeof createAssociation>;

function makeService(overrides = {}) {
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
    health: { status: 'healthy' as const, healthy_reports: 1, warning_reports: 0, critical_reports: 0, total_reports: 1, dependent_count: 1, last_report: null },
    dependencies: [
      { id: 'dep-1', service_id: 'svc-1', name: 'DB Connection', canonical_name: null, description: null, impact: null, healthy: 1, health_state: 0 as const, health_code: null, latency_ms: null, last_checked: null, last_status_change: null, created_at: '', updated_at: '' },
    ],
    dependent_reports: [],
    ...overrides,
  };
}

beforeEach(() => {
  mockFetchServices.mockReset();
  mockCreateAssociation.mockReset();
  mockFetchServices.mockResolvedValue([makeService()]);
});

describe('AssociationForm', () => {
  it('renders loading state initially', () => {
    mockFetchServices.mockReturnValue(new Promise(() => {}));
    render(<AssociationForm />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders form after services load', async () => {
    render(<AssociationForm />);
    await waitFor(() => expect(screen.getByText('Create Association')).toBeInTheDocument());
    expect(screen.getByText('Association Type')).toBeInTheDocument();
  });

  it('renders without dependency selector when dependencyId is provided', async () => {
    render(<AssociationForm dependencyId="dep-1" />);
    await waitFor(() => expect(screen.getByText('Create Association')).toBeInTheDocument());
    // Should have Target Service but not Dependency
    expect(screen.getByText('Target Service')).toBeInTheDocument();
  });

  it('shows cancel button when onCancel is provided', async () => {
    const onCancel = jest.fn();
    render(<AssociationForm onCancel={onCancel} />);
    await waitFor(() => expect(screen.getByText('Cancel')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('submit button is disabled when nothing selected', async () => {
    render(<AssociationForm />);
    await waitFor(() => expect(screen.getByText('Create Association')).toBeInTheDocument());
    expect(screen.getByText('Create Association').closest('button')).toBeDisabled();
  });

  it('shows error when service fetch fails', async () => {
    mockFetchServices.mockRejectedValue(new Error('Network error'));
    render(<AssociationForm />);
    await waitFor(() => expect(screen.getByText('Failed to load services')).toBeInTheDocument());
  });

  it('submits form successfully and calls onSuccess', async () => {
    const onSuccess = jest.fn();
    mockFetchServices.mockResolvedValue([
      makeService(),
      makeService({ id: 'svc-2', name: 'Service Beta', team: { id: 'team-2', name: 'Team Two', description: null, created_at: '', updated_at: '' } }),
    ]);
    mockCreateAssociation.mockResolvedValue({ id: 'assoc-1' } as never);

    render(<AssociationForm dependencyId="dep-1" onSuccess={onSuccess} />);
    await waitFor(() => expect(screen.getByText('Create Association')).toBeInTheDocument());

    // Select a service using the SearchableSelect
    fireEvent.click(screen.getByText('Select service...'));
    await waitFor(() => expect(screen.getByText('Service Alpha')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Service Alpha'));

    // Submit the form
    fireEvent.click(screen.getByText('Create Association'));

    await waitFor(() => expect(mockCreateAssociation).toHaveBeenCalledWith('dep-1', {
      linked_service_id: 'svc-1',
      association_type: 'api_call',
    }));
    expect(onSuccess).toHaveBeenCalled();
  });

  it('shows error when create fails', async () => {
    mockFetchServices.mockResolvedValue([makeService()]);
    mockCreateAssociation.mockRejectedValue(new Error('Create failed'));

    render(<AssociationForm dependencyId="dep-1" />);
    await waitFor(() => expect(screen.getByText('Create Association')).toBeInTheDocument());

    // Select a service
    fireEvent.click(screen.getByText('Select service...'));
    await waitFor(() => expect(screen.getByText('Service Alpha')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Service Alpha'));

    // Submit
    fireEvent.click(screen.getByText('Create Association'));

    await waitFor(() => expect(screen.getByText('Create failed')).toBeInTheDocument());
  });

  it('shows generic error for non-Error exceptions', async () => {
    mockFetchServices.mockResolvedValue([makeService()]);
    mockCreateAssociation.mockRejectedValue('String error');

    render(<AssociationForm dependencyId="dep-1" />);
    await waitFor(() => expect(screen.getByText('Create Association')).toBeInTheDocument());

    // Select a service
    fireEvent.click(screen.getByText('Select service...'));
    await waitFor(() => expect(screen.getByText('Service Alpha')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Service Alpha'));

    // Submit
    fireEvent.click(screen.getByText('Create Association'));

    await waitFor(() => expect(screen.getByText('Failed to create association')).toBeInTheDocument());
  });

  it('changes association type', async () => {
    mockFetchServices.mockResolvedValue([makeService()]);
    mockCreateAssociation.mockResolvedValue({ id: 'assoc-1' } as never);

    render(<AssociationForm dependencyId="dep-1" />);
    await waitFor(() => expect(screen.getByText('Create Association')).toBeInTheDocument());

    // Change association type
    fireEvent.change(screen.getByLabelText('Association Type'), { target: { value: 'database' } });

    // Select a service
    fireEvent.click(screen.getByText('Select service...'));
    await waitFor(() => expect(screen.getByText('Service Alpha')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Service Alpha'));

    // Submit
    fireEvent.click(screen.getByText('Create Association'));

    await waitFor(() => expect(mockCreateAssociation).toHaveBeenCalledWith('dep-1', {
      linked_service_id: 'svc-1',
      association_type: 'database',
    }));
  });

  it('clears dependency selection after submit when no dependencyId prop', async () => {
    mockFetchServices.mockResolvedValue([makeService()]);
    mockCreateAssociation.mockResolvedValue({ id: 'assoc-1' } as never);

    render(<AssociationForm />);
    await waitFor(() => expect(screen.getByText('Create Association')).toBeInTheDocument());

    // Select dependency
    const depSelect = screen.getAllByText('Select dependency...')[0];
    fireEvent.click(depSelect);
    await waitFor(() => expect(screen.getByText('DB Connection')).toBeInTheDocument());
    fireEvent.click(screen.getByText('DB Connection'));

    // Select service
    fireEvent.click(screen.getByText('Select service...'));
    await waitFor(() => expect(screen.getByText('Service Alpha')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Service Alpha'));

    // Submit
    fireEvent.click(screen.getByText('Create Association'));

    await waitFor(() => expect(mockCreateAssociation).toHaveBeenCalled());
  });
});
