import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('../../../api/services');
jest.mock('./ManageAssociations', () => ({ __esModule: true, default: () => <div data-testid="manage-associations" /> }));
jest.mock('./AliasesManager', () => ({ __esModule: true, default: () => <div data-testid="aliases-manager" /> }));
jest.mock('./ExternalServicesManager', () => ({ __esModule: true, default: () => <div data-testid="external-services-manager" /> }));

import { fetchServices } from './../../../api/services';
import AssociationsPage from './AssociationsPage';

const mockFetchServices = fetchServices as jest.MockedFunction<typeof fetchServices>;

beforeEach(() => {
  mockFetchServices.mockReset();
  mockFetchServices.mockResolvedValue([]);
});

describe('AssociationsPage', () => {
  it('renders with title and 3 tabs', async () => {
    render(<AssociationsPage />);
    await waitFor(() => expect(screen.getByText('Associations')).toBeInTheDocument());
    expect(screen.getByText('Manage')).toBeInTheDocument();
    expect(screen.getByText('Aliases')).toBeInTheDocument();
    expect(screen.getByText('External Services')).toBeInTheDocument();
  });

  it('does not render old Create, Existing, or Suggestions tabs', async () => {
    render(<AssociationsPage />);
    await waitFor(() => expect(screen.getByText('Associations')).toBeInTheDocument());
    expect(screen.queryByText('Create')).not.toBeInTheDocument();
    expect(screen.queryByText('Existing')).not.toBeInTheDocument();
    expect(screen.queryByText('Suggestions')).not.toBeInTheDocument();
  });

  it('shows manage tab by default', async () => {
    render(<AssociationsPage />);
    await waitFor(() => expect(screen.getByTestId('manage-associations')).toBeInTheDocument());
  });

  it('switches to aliases tab', async () => {
    render(<AssociationsPage />);
    await waitFor(() => expect(screen.getByText('Aliases')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Aliases'));
    expect(screen.getByTestId('aliases-manager')).toBeInTheDocument();
  });

  it('switches to external services tab', async () => {
    render(<AssociationsPage />);
    await waitFor(() => expect(screen.getByText('External Services')).toBeInTheDocument());
    fireEvent.click(screen.getByText('External Services'));
    expect(screen.getByTestId('external-services-manager')).toBeInTheDocument();
  });

  it('handles fetchServices error gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetchServices.mockRejectedValue(new Error('Network error'));

    render(<AssociationsPage />);
    await waitFor(() => expect(consoleSpy).toHaveBeenCalled());

    consoleSpy.mockRestore();
  });
});
