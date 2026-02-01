import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('../../../../api/associations');
jest.mock('../../../../api/services');
jest.mock('../SuggestionsInbox', () => ({ __esModule: true, default: () => <div data-testid="suggestions-inbox" /> }));
jest.mock('../AssociationForm', () => ({ __esModule: true, default: () => <div data-testid="association-form" /> }));
jest.mock('../AssociationsList', () => ({ __esModule: true, default: () => <div data-testid="associations-list" /> }));
jest.mock('../AliasesManager', () => ({ __esModule: true, default: () => <div data-testid="aliases-manager" /> }));

import { fetchSuggestions } from '../../../../api/associations';
import { fetchServices } from '../../../../api/services';
import AssociationsPage from '../AssociationsPage';

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
});
