import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('../../../api/associations');
jest.mock('../../../api/services');
jest.mock('./SuggestionsInbox', () => ({ __esModule: true, default: () => <div data-testid="suggestions-inbox" /> }));
jest.mock('./AssociationForm', () => ({ __esModule: true, default: () => <div data-testid="association-form" /> }));
jest.mock('./AssociationsList', () => ({ __esModule: true, default: () => <div data-testid="associations-list" /> }));
jest.mock('./AliasesManager', () => ({ __esModule: true, default: () => <div data-testid="aliases-manager" /> }));

import { fetchSuggestions } from './../../../api/associations';
import { fetchServices } from './../../../api/services';
import AssociationsPage from './AssociationsPage';

const mockFetchSuggestions = fetchSuggestions as jest.MockedFunction<typeof fetchSuggestions>;
const mockFetchServices = fetchServices as jest.MockedFunction<typeof fetchServices>;

beforeEach(() => {
  mockFetchSuggestions.mockReset();
  mockFetchServices.mockReset();
  mockFetchSuggestions.mockResolvedValue([]);
  mockFetchServices.mockResolvedValue([]);
});

describe('AssociationsPage', () => {
  it('renders with title and tabs', async () => {
    render(<AssociationsPage />);
    await waitFor(() => expect(screen.getByText('Associations')).toBeInTheDocument());
    expect(screen.getByText('Suggestions')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
    expect(screen.getByText('Existing')).toBeInTheDocument();
  });

  it('shows suggestions tab by default', async () => {
    render(<AssociationsPage />);
    await waitFor(() => expect(screen.getByTestId('suggestions-inbox')).toBeInTheDocument());
  });

  it('switches to create tab', async () => {
    render(<AssociationsPage />);
    await waitFor(() => expect(screen.getByText('Create')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Create'));
    expect(screen.getByTestId('association-form')).toBeInTheDocument();
  });

  it('switches to existing tab', async () => {
    render(<AssociationsPage />);
    await waitFor(() => expect(screen.getByText('Existing')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Existing'));
    expect(screen.getByText('Select a dependency...')).toBeInTheDocument();
  });

  it('switches to aliases tab', async () => {
    render(<AssociationsPage />);
    await waitFor(() => expect(screen.getByText('Aliases')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Aliases'));
    expect(screen.getByTestId('aliases-manager')).toBeInTheDocument();
  });

  it('handles fetchServices error gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetchServices.mockRejectedValue(new Error('Network error'));

    render(<AssociationsPage />);
    await waitFor(() => expect(consoleSpy).toHaveBeenCalled());

    consoleSpy.mockRestore();
  });

  it('shows badge when there are suggestions', async () => {
    mockFetchSuggestions.mockResolvedValue([
      {
        id: 's1',
        dependency_id: 'd1',
        linked_service_id: 'ls1',
        association_type: 'api_call',
        is_auto_suggested: 1,
        confidence_score: 0.85,
        is_dismissed: 0,
        created_at: '2025-01-01',
        dependency_name: 'dep-1',
        service_name: 'Service A',
        linked_service_name: 'Service B',
      },
    ] as never);

    render(<AssociationsPage />);
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
  });

  it('loads dependency options for existing tab', async () => {
    mockFetchServices.mockResolvedValue([
      {
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
        team: { id: 'team-1', name: 'Team One', description: null, created_at: '', updated_at: '' },
        health: { status: 'healthy' as const, healthy_reports: 0, warning_reports: 0, critical_reports: 0, total_reports: 0, dependent_count: 0, last_report: null },
        dependencies: [
          { id: 'dep-1', service_id: 'svc-1', name: 'Database', canonical_name: null, description: null, impact: null, healthy: 1, health_state: 0 as const, health_code: null, latency_ms: null, last_checked: null, last_status_change: null, created_at: '', updated_at: '' },
        ],
        dependent_reports: [],
      },
    ]);

    render(<AssociationsPage />);
    await waitFor(() => expect(screen.getByText('Existing')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Existing'));

    await waitFor(() => expect(screen.getByText('Database (Service Alpha)')).toBeInTheDocument());
  });

  it('selects dependency in existing tab and shows associations list', async () => {
    mockFetchServices.mockResolvedValue([
      {
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
        team: { id: 'team-1', name: 'Team One', description: null, created_at: '', updated_at: '' },
        health: { status: 'healthy' as const, healthy_reports: 0, warning_reports: 0, critical_reports: 0, total_reports: 0, dependent_count: 0, last_report: null },
        dependencies: [
          { id: 'dep-1', service_id: 'svc-1', name: 'Database', canonical_name: null, description: null, impact: null, healthy: 1, health_state: 0 as const, health_code: null, latency_ms: null, last_checked: null, last_status_change: null, created_at: '', updated_at: '' },
        ],
        dependent_reports: [],
      },
    ]);

    render(<AssociationsPage />);
    await waitFor(() => expect(screen.getByText('Existing')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Existing'));

    await waitFor(() => expect(screen.getByLabelText('Dependency')).toBeInTheDocument());

    // Select dependency
    fireEvent.change(screen.getByLabelText('Dependency'), { target: { value: 'dep-1' } });

    await waitFor(() => expect(screen.getByTestId('associations-list')).toBeInTheDocument());
  });
});
