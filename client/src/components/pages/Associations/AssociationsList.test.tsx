import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('../../common/ConfirmDialog', () => ({
  __esModule: true,
  default: ({ isOpen, message, onConfirm }: { isOpen: boolean; message: string; onConfirm: () => void }) =>
    isOpen ? (
      <div data-testid="confirm-dialog">
        <span>{message}</span>
        <button onClick={onConfirm}>Confirm</button>
      </div>
    ) : null,
}));

import AssociationsList from './AssociationsList';
import type { Association } from './../../../types/association';

function makeAssociation(overrides: Partial<Association> = {}): Association {
  return {
    id: 'a1',
    dependency_id: 'd1',
    linked_service_id: 's1',
    association_type: 'api_call',
    is_auto_suggested: 0,
    confidence_score: null,
    is_dismissed: 0,
    created_at: '2025-01-01',
    linked_service: {
      id: 's1',
      name: 'Target Service',
      team_id: 't1',
      health_endpoint: 'https://example.com',
      metrics_endpoint: null,
      is_active: 1,
      last_poll_success: 1,
      last_poll_error: null,
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
      team: { id: 't1', name: 'Team', description: null, created_at: '', updated_at: '' },
      health: { status: 'healthy', healthy_reports: 0, warning_reports: 0, critical_reports: 0, total_reports: 0, dependent_count: 0, last_report: null },
    },
    ...overrides,
  };
}

describe('AssociationsList', () => {
  it('renders associations in table', () => {
    render(
      <AssociationsList
        associations={[makeAssociation()]}
        isLoading={false}
        onDelete={jest.fn()}
      />,
    );
    expect(screen.getByText('Target Service')).toBeInTheDocument();
    expect(screen.getAllByText('API Call').length).toBeGreaterThan(0);
    expect(screen.getByText('Manual')).toBeInTheDocument();
  });

  it('shows empty state', () => {
    render(<AssociationsList associations={[]} isLoading={false} onDelete={jest.fn()} />);
    expect(screen.getByText('No associations found.')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<AssociationsList associations={[]} isLoading={true} onDelete={jest.fn()} />);
    expect(screen.getByText('Loading associations...')).toBeInTheDocument();
  });

  it('filters by search text', () => {
    render(
      <AssociationsList
        associations={[
          makeAssociation({ id: 'a1', linked_service: { ...makeAssociation().linked_service, name: 'Alpha' } }),
          makeAssociation({ id: 'a2', linked_service: { ...makeAssociation().linked_service, id: 's2', name: 'Beta' }, linked_service_id: 's2' }),
        ]}
        isLoading={false}
        onDelete={jest.fn()}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('Search associations...'), {
      target: { value: 'Alpha' },
    });
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
  });

  it('shows confirm dialog on delete', () => {
    render(
      <AssociationsList
        associations={[makeAssociation()]}
        isLoading={false}
        onDelete={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByTitle('Delete association'));
    expect(screen.getByText(/Remove the association/)).toBeInTheDocument();
  });

  it('shows auto source for auto-suggested associations', () => {
    render(
      <AssociationsList
        associations={[makeAssociation({ is_auto_suggested: 1, confidence_score: 0.9 })]}
        isLoading={false}
        onDelete={jest.fn()}
      />,
    );
    expect(screen.getByText('Auto')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
  });

  it('filters by association type', () => {
    render(
      <AssociationsList
        associations={[
          makeAssociation({ id: 'a1', association_type: 'api_call', linked_service: { ...makeAssociation().linked_service, name: 'API Service' } }),
          makeAssociation({ id: 'a2', association_type: 'database', linked_service: { ...makeAssociation().linked_service, id: 's2', name: 'DB Service' }, linked_service_id: 's2' }),
        ]}
        isLoading={false}
        onDelete={jest.fn()}
      />,
    );

    // Filter by database type
    fireEvent.change(screen.getByLabelText('Filter by type'), { target: { value: 'database' } });
    expect(screen.getByText('DB Service')).toBeInTheDocument();
    expect(screen.queryByText('API Service')).not.toBeInTheDocument();

    // Filter by api_call type
    fireEvent.change(screen.getByLabelText('Filter by type'), { target: { value: 'api_call' } });
    expect(screen.getByText('API Service')).toBeInTheDocument();
    expect(screen.queryByText('DB Service')).not.toBeInTheDocument();

    // Clear filter
    fireEvent.change(screen.getByLabelText('Filter by type'), { target: { value: '' } });
    expect(screen.getByText('API Service')).toBeInTheDocument();
    expect(screen.getByText('DB Service')).toBeInTheDocument();
  });

  it('calls onDelete when confirm button clicked', async () => {
    const onDelete = jest.fn().mockResolvedValue(undefined);
    render(
      <AssociationsList
        associations={[makeAssociation()]}
        isLoading={false}
        onDelete={onDelete}
      />,
    );

    // Click delete button to open dialog
    fireEvent.click(screen.getByTitle('Delete association'));

    // Click confirm in dialog
    fireEvent.click(screen.getByText('Confirm'));

    expect(onDelete).toHaveBeenCalledWith('s1');
  });

  it('shows dash for null confidence score', () => {
    render(
      <AssociationsList
        associations={[makeAssociation({ is_auto_suggested: 1, confidence_score: null })]}
        isLoading={false}
        onDelete={jest.fn()}
      />,
    );
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('search filters by association type text', () => {
    render(
      <AssociationsList
        associations={[
          makeAssociation({ id: 'a1', association_type: 'api_call', linked_service: { ...makeAssociation().linked_service, name: 'Service One' } }),
          makeAssociation({ id: 'a2', association_type: 'database', linked_service: { ...makeAssociation().linked_service, id: 's2', name: 'Service Two' }, linked_service_id: 's2' }),
        ]}
        isLoading={false}
        onDelete={jest.fn()}
      />,
    );

    // Search for "database" should show DB association
    fireEvent.change(screen.getByPlaceholderText('Search associations...'), {
      target: { value: 'database' },
    });
    expect(screen.getByText('Service Two')).toBeInTheDocument();
    expect(screen.queryByText('Service One')).not.toBeInTheDocument();
  });
});
