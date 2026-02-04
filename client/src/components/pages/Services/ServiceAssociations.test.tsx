import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('../../../api/associations');
jest.mock('../../../api/services');
jest.mock('../../common/Modal', () => ({
  __esModule: true,
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div data-testid="modal">{children}</div> : null,
}));
jest.mock('../Associations/AssociationForm', () => ({
  __esModule: true,
  default: () => <div data-testid="association-form" />,
}));

import {
  fetchAssociations,
  fetchSuggestions,
  generateServiceSuggestions,
  acceptSuggestion,
  dismissSuggestion,
  deleteAssociation,
} from './../../../api/associations';
import ServiceAssociations from './ServiceAssociations';
import type { Dependency } from './../../../types/service';

const mockFetchAssociations = fetchAssociations as jest.MockedFunction<typeof fetchAssociations>;
const mockFetchSuggestions = fetchSuggestions as jest.MockedFunction<typeof fetchSuggestions>;
const mockGenerate = generateServiceSuggestions as jest.MockedFunction<typeof generateServiceSuggestions>;
const mockAcceptSuggestion = acceptSuggestion as jest.MockedFunction<typeof acceptSuggestion>;
const mockDismissSuggestion = dismissSuggestion as jest.MockedFunction<typeof dismissSuggestion>;
const mockDeleteAssociation = deleteAssociation as jest.MockedFunction<typeof deleteAssociation>;

const deps: Dependency[] = [
  {
    id: 'dep-1',
    service_id: 'svc-1',
    name: 'Database',
    canonical_name: null,
    description: null,
    impact: null,
    healthy: 1,
    health_state: 0,
    health_code: null,
    latency_ms: null,
    last_checked: null,
    last_status_change: null,
    created_at: '',
    updated_at: '',
  },
];

beforeEach(() => {
  mockFetchAssociations.mockReset();
  mockFetchSuggestions.mockReset();
  mockGenerate.mockReset();
  mockAcceptSuggestion.mockReset();
  mockDismissSuggestion.mockReset();
  mockDeleteAssociation.mockReset();
  mockFetchSuggestions.mockResolvedValue([]);
  mockFetchAssociations.mockResolvedValue([]);
});

describe('ServiceAssociations', () => {
  it('renders section header and generate button', async () => {
    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);
    await waitFor(() => expect(screen.getByText('Associations')).toBeInTheDocument());
    expect(screen.getByText('Generate Suggestions')).toBeInTheDocument();
  });

  it('renders dependency list items', async () => {
    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);
    await waitFor(() => expect(screen.getByText('Database')).toBeInTheDocument());
  });

  it('calls generate suggestions on button click', async () => {
    mockGenerate.mockResolvedValue([]);
    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);

    await waitFor(() => expect(screen.getByText('Generate Suggestions')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Generate Suggestions'));

    await waitFor(() => expect(mockGenerate).toHaveBeenCalledWith('svc-1'));
  });

  it('opens add association modal', async () => {
    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);
    await waitFor(() => expect(screen.getByText('+ Add')).toBeInTheDocument());
    fireEvent.click(screen.getByText('+ Add'));
    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.getByTestId('association-form')).toBeInTheDocument();
  });

  it('toggles view associations', async () => {
    mockFetchAssociations.mockResolvedValue([]);
    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);
    await waitFor(() => expect(screen.getByText('View Associations')).toBeInTheDocument());
    fireEvent.click(screen.getByText('View Associations'));
    await waitFor(() =>
      expect(screen.getByText('No associations for this dependency.')).toBeInTheDocument(),
    );
  });

  it('shows pending suggestions section', async () => {
    mockFetchSuggestions.mockResolvedValue([
      {
        id: 'sug-1',
        dependency_id: 'dep-1',
        linked_service_id: 'linked-1',
        association_type: 'api_call',
        is_auto_suggested: 1,
        confidence_score: 0.85,
        is_dismissed: 0,
        created_at: '2025-01-01',
        dependency_name: 'Database',
        service_name: 'My Service',
        linked_service_name: 'Target Service',
      },
    ] as never);

    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);
    await waitFor(() => expect(screen.getByText('Pending Suggestions (1)')).toBeInTheDocument());
    expect(screen.getByText('Target Service')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('shows error when generate fails', async () => {
    mockGenerate.mockRejectedValue(new Error('Generate failed'));
    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);

    await waitFor(() => expect(screen.getByText('Generate Suggestions')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Generate Suggestions'));

    await waitFor(() => expect(screen.getByText('Generate failed')).toBeInTheDocument());
  });

  it('shows generic error for non-Error generate failure', async () => {
    mockGenerate.mockRejectedValue('String error');
    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);

    await waitFor(() => expect(screen.getByText('Generate Suggestions')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Generate Suggestions'));

    await waitFor(() => expect(screen.getByText('Failed to generate suggestions')).toBeInTheDocument());
  });

  it('hides associations when clicking View again', async () => {
    mockFetchAssociations.mockResolvedValue([]);
    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);

    await waitFor(() => expect(screen.getByText('View Associations')).toBeInTheDocument());
    fireEvent.click(screen.getByText('View Associations'));
    await waitFor(() => expect(screen.getByText('No associations for this dependency.')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Hide Associations'));
    expect(screen.queryByText('No associations for this dependency.')).not.toBeInTheDocument();
  });

  it('shows loading state when loading associations', async () => {
    mockFetchAssociations.mockReturnValue(new Promise(() => {}));
    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);

    await waitFor(() => expect(screen.getByText('View Associations')).toBeInTheDocument());
    fireEvent.click(screen.getByText('View Associations'));

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows associations list when loaded', async () => {
    mockFetchAssociations.mockResolvedValue([
      {
        id: 'a1',
        dependency_id: 'dep-1',
        linked_service_id: 's1',
        association_type: 'api_call',
        is_auto_suggested: 0,
        confidence_score: null,
        is_dismissed: 0,
        created_at: '2025-01-01',
        linked_service: {
          id: 's1',
          name: 'Alpha Target',
          team_id: 't1',
          health_endpoint: 'https://example.com',
          metrics_endpoint: null,
          is_active: 1,
          last_poll_success: 1,
          last_poll_error: null,
          created_at: '',
          updated_at: '',
          team: { id: 't1', name: 'Team', description: null, created_at: '', updated_at: '' },
          health: { status: 'healthy' as const, healthy_reports: 0, warning_reports: 0, critical_reports: 0, total_reports: 0, dependent_count: 0, last_report: null },
        },
      },
    ] as never);

    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);

    await waitFor(() => expect(screen.getByText('View Associations')).toBeInTheDocument());
    fireEvent.click(screen.getByText('View Associations'));

    await waitFor(() => expect(screen.getByText('Alpha Target')).toBeInTheDocument());
  });

  it('shows null confidence as dash', async () => {
    mockFetchSuggestions.mockResolvedValue([
      {
        id: 'sug-1',
        dependency_id: 'dep-1',
        linked_service_id: 'linked-1',
        association_type: 'api_call',
        is_auto_suggested: 1,
        confidence_score: null,
        is_dismissed: 0,
        created_at: '2025-01-01',
        dependency_name: 'Database',
        service_name: 'My Service',
        linked_service_name: 'Target Service',
      },
    ] as never);

    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);
    await waitFor(() => expect(screen.getByText('-')).toBeInTheDocument());
  });

  it('accepts suggestion and removes it from list', async () => {
    mockAcceptSuggestion.mockResolvedValue(undefined);
    mockFetchSuggestions.mockResolvedValue([
      {
        id: 'sug-1',
        dependency_id: 'dep-1',
        linked_service_id: 'linked-1',
        association_type: 'api_call',
        is_auto_suggested: 1,
        confidence_score: 0.85,
        is_dismissed: 0,
        created_at: '2025-01-01',
        dependency_name: 'Database',
        service_name: 'My Service',
        linked_service_name: 'Target Service',
      },
    ] as never);

    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);
    await waitFor(() => expect(screen.getByText('Pending Suggestions (1)')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Accept'));

    await waitFor(() => expect(mockAcceptSuggestion).toHaveBeenCalledWith('sug-1'));
  });

  it('shows error when accept fails', async () => {
    mockAcceptSuggestion.mockRejectedValue(new Error('Accept failed'));
    mockFetchSuggestions.mockResolvedValue([
      {
        id: 'sug-1',
        dependency_id: 'dep-1',
        linked_service_id: 'linked-1',
        association_type: 'api_call',
        is_auto_suggested: 1,
        confidence_score: 0.85,
        is_dismissed: 0,
        created_at: '2025-01-01',
        dependency_name: 'Database',
        service_name: 'My Service',
        linked_service_name: 'Target Service',
      },
    ] as never);

    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);
    await waitFor(() => expect(screen.getByTitle('Accept')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Accept'));

    await waitFor(() => expect(screen.getByText('Accept failed')).toBeInTheDocument());
  });

  it('shows generic error for non-Error accept failure', async () => {
    mockAcceptSuggestion.mockRejectedValue('String error');
    mockFetchSuggestions.mockResolvedValue([
      {
        id: 'sug-1',
        dependency_id: 'dep-1',
        linked_service_id: 'linked-1',
        association_type: 'api_call',
        is_auto_suggested: 1,
        confidence_score: 0.85,
        is_dismissed: 0,
        created_at: '2025-01-01',
        dependency_name: 'Database',
        service_name: 'My Service',
        linked_service_name: 'Target Service',
      },
    ] as never);

    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);
    await waitFor(() => expect(screen.getByTitle('Accept')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Accept'));

    await waitFor(() => expect(screen.getByText('Failed to accept suggestion')).toBeInTheDocument());
  });

  it('dismisses suggestion and removes it from list', async () => {
    mockDismissSuggestion.mockResolvedValue(undefined);
    mockFetchSuggestions.mockResolvedValue([
      {
        id: 'sug-1',
        dependency_id: 'dep-1',
        linked_service_id: 'linked-1',
        association_type: 'api_call',
        is_auto_suggested: 1,
        confidence_score: 0.85,
        is_dismissed: 0,
        created_at: '2025-01-01',
        dependency_name: 'Database',
        service_name: 'My Service',
        linked_service_name: 'Target Service',
      },
    ] as never);

    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);
    await waitFor(() => expect(screen.getByText('Pending Suggestions (1)')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Dismiss'));

    await waitFor(() => expect(mockDismissSuggestion).toHaveBeenCalledWith('sug-1'));
  });

  it('shows error when dismiss fails', async () => {
    mockDismissSuggestion.mockRejectedValue(new Error('Dismiss failed'));
    mockFetchSuggestions.mockResolvedValue([
      {
        id: 'sug-1',
        dependency_id: 'dep-1',
        linked_service_id: 'linked-1',
        association_type: 'api_call',
        is_auto_suggested: 1,
        confidence_score: 0.85,
        is_dismissed: 0,
        created_at: '2025-01-01',
        dependency_name: 'Database',
        service_name: 'My Service',
        linked_service_name: 'Target Service',
      },
    ] as never);

    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);
    await waitFor(() => expect(screen.getByTitle('Dismiss')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Dismiss'));

    await waitFor(() => expect(screen.getByText('Dismiss failed')).toBeInTheDocument());
  });

  it('shows generic error for non-Error dismiss failure', async () => {
    mockDismissSuggestion.mockRejectedValue('String error');
    mockFetchSuggestions.mockResolvedValue([
      {
        id: 'sug-1',
        dependency_id: 'dep-1',
        linked_service_id: 'linked-1',
        association_type: 'api_call',
        is_auto_suggested: 1,
        confidence_score: 0.85,
        is_dismissed: 0,
        created_at: '2025-01-01',
        dependency_name: 'Database',
        service_name: 'My Service',
        linked_service_name: 'Target Service',
      },
    ] as never);

    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);
    await waitFor(() => expect(screen.getByTitle('Dismiss')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Dismiss'));

    await waitFor(() => expect(screen.getByText('Failed to dismiss suggestion')).toBeInTheDocument());
  });

  it('removes association when remove button clicked', async () => {
    mockDeleteAssociation.mockResolvedValue(undefined);
    mockFetchAssociations.mockResolvedValue([
      {
        id: 'a1',
        dependency_id: 'dep-1',
        linked_service_id: 's1',
        association_type: 'api_call',
        is_auto_suggested: 0,
        confidence_score: null,
        is_dismissed: 0,
        created_at: '2025-01-01',
        linked_service: {
          id: 's1',
          name: 'Beta Target',
          team_id: 't1',
          health_endpoint: 'https://example.com',
          metrics_endpoint: null,
          is_active: 1,
          last_poll_success: 1,
          last_poll_error: null,
          created_at: '',
          updated_at: '',
          team: { id: 't1', name: 'Team', description: null, created_at: '', updated_at: '' },
          health: { status: 'healthy' as const, healthy_reports: 0, warning_reports: 0, critical_reports: 0, total_reports: 0, dependent_count: 0, last_report: null },
        },
      },
    ] as never);

    render(<ServiceAssociations serviceId="svc-1" dependencies={deps} />);

    await waitFor(() => expect(screen.getByText('View Associations')).toBeInTheDocument());
    fireEvent.click(screen.getByText('View Associations'));

    await waitFor(() => expect(screen.getByText('Beta Target')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Remove'));

    await waitFor(() => expect(mockDeleteAssociation).toHaveBeenCalledWith('dep-1', 's1'));
  });
});
