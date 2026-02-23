import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('../../../api/associations');
jest.mock('../../../api/services');
jest.mock('./SuggestionsInbox', () => ({ __esModule: true, default: () => <div data-testid="suggestions-inbox" /> }));
jest.mock('./ManageAssociations', () => ({ __esModule: true, default: () => <div data-testid="manage-associations" /> }));
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
  it('renders with title and 3 tabs', async () => {
    render(<AssociationsPage />);
    await waitFor(() => expect(screen.getByText('Associations')).toBeInTheDocument());
    expect(screen.getByText('Suggestions')).toBeInTheDocument();
    expect(screen.getByText('Manage')).toBeInTheDocument();
    expect(screen.getByText('Aliases')).toBeInTheDocument();
  });

  it('does not render old Create or Existing tabs', async () => {
    render(<AssociationsPage />);
    await waitFor(() => expect(screen.getByText('Associations')).toBeInTheDocument());
    expect(screen.queryByText('Create')).not.toBeInTheDocument();
    expect(screen.queryByText('Existing')).not.toBeInTheDocument();
  });

  it('shows suggestions tab by default', async () => {
    render(<AssociationsPage />);
    await waitFor(() => expect(screen.getByTestId('suggestions-inbox')).toBeInTheDocument());
  });

  it('switches to manage tab', async () => {
    render(<AssociationsPage />);
    await waitFor(() => expect(screen.getByText('Manage')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Manage'));
    expect(screen.getByTestId('manage-associations')).toBeInTheDocument();
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
        confidence_score: 85,
        is_dismissed: 0,
        match_reason: null,
        created_at: '2025-01-01',
        dependency_name: 'dep-1',
        service_name: 'Service A',
        linked_service_name: 'Service B',
      },
    ] as never);

    render(<AssociationsPage />);
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
  });
});
