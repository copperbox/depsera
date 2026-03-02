import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ServiceKeyLookup from './ServiceKeyLookup';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockCatalog = [
  {
    id: 's1',
    name: 'Auth Service',
    manifest_key: 'auth-svc',
    description: 'Auth',
    is_active: 1,
    team_id: 't1',
    team_name: 'Team Alpha',
    team_key: 'team-alpha',
  },
  {
    id: 's2',
    name: 'Payment Service',
    manifest_key: 'pay-svc',
    description: null,
    is_active: 1,
    team_id: 't2',
    team_name: 'Team Beta',
    team_key: 'team-beta',
  },
  {
    id: 's3',
    name: 'No Key Service',
    manifest_key: null,
    description: null,
    is_active: 1,
    team_id: 't1',
    team_name: 'Team Alpha',
    team_key: 'team-alpha',
  },
];

describe('ServiceKeyLookup', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation(() => Promise.resolve(jsonResponse(mockCatalog)));
  });

  it('should render collapsed by default', () => {
    render(<ServiceKeyLookup />);
    expect(screen.getByText('Service Key Lookup')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search services or keys...')).not.toBeInTheDocument();
  });

  it('should not fetch data until expanded', () => {
    render(<ServiceKeyLookup />);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should fetch and display catalog on expand', async () => {
    render(<ServiceKeyLookup />);

    fireEvent.click(screen.getByText('Service Key Lookup'));

    await waitFor(() => {
      expect(screen.getByText('Auth Service')).toBeInTheDocument();
    });

    expect(screen.getByText('Payment Service')).toBeInTheDocument();
    expect(screen.getByText('No Key Service')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/services/catalog', { credentials: 'include' });
  });

  it('should show namespaced manifest keys in code elements', async () => {
    render(<ServiceKeyLookup />);
    fireEvent.click(screen.getByText('Service Key Lookup'));

    await waitFor(() => {
      expect(screen.getByText('team-alpha/auth-svc')).toBeInTheDocument();
    });

    expect(screen.getByText('team-beta/pay-svc')).toBeInTheDocument();
  });

  it('should show team names', async () => {
    render(<ServiceKeyLookup />);
    fireEvent.click(screen.getByText('Service Key Lookup'));

    await waitFor(() => {
      expect(screen.getAllByText('Team Alpha')).toHaveLength(2);
    });

    expect(screen.getByText('Team Beta')).toBeInTheDocument();
  });

  it('should filter by search on name', async () => {
    render(<ServiceKeyLookup />);
    fireEvent.click(screen.getByText('Service Key Lookup'));

    await waitFor(() => {
      expect(screen.getByText('Auth Service')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Search services or keys...'), {
      target: { value: 'payment' },
    });

    expect(screen.getByText('Payment Service')).toBeInTheDocument();
    expect(screen.queryByText('Auth Service')).not.toBeInTheDocument();
  });

  it('should filter by search on manifest_key', async () => {
    render(<ServiceKeyLookup />);
    fireEvent.click(screen.getByText('Service Key Lookup'));

    await waitFor(() => {
      expect(screen.getByText('Auth Service')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Search services or keys...'), {
      target: { value: 'auth-svc' },
    });

    expect(screen.getByText('Auth Service')).toBeInTheDocument();
    expect(screen.queryByText('Payment Service')).not.toBeInTheDocument();
  });

  it('should show empty message when search matches nothing', async () => {
    render(<ServiceKeyLookup />);
    fireEvent.click(screen.getByText('Service Key Lookup'));

    await waitFor(() => {
      expect(screen.getByText('Auth Service')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Search services or keys...'), {
      target: { value: 'zzz-no-match' },
    });

    expect(screen.getByText('No services match your search.')).toBeInTheDocument();
  });

  it('should show error state with retry', async () => {
    mockFetch.mockImplementation(() => Promise.resolve(jsonResponse({ message: 'Server error' }, 500)));

    render(<ServiceKeyLookup />);
    fireEvent.click(screen.getByText('Service Key Lookup'));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });

    // Fix the mock and retry
    mockFetch.mockImplementation(() => Promise.resolve(jsonResponse(mockCatalog)));
    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Auth Service')).toBeInTheDocument();
    });
  });

  it('should have copy buttons for entries with manifest keys', async () => {
    render(<ServiceKeyLookup />);
    fireEvent.click(screen.getByText('Service Key Lookup'));

    await waitFor(() => {
      expect(screen.getByText('team-alpha/auth-svc')).toBeInTheDocument();
    });

    const copyButtons = screen.getAllByTitle('Copy key');
    expect(copyButtons).toHaveLength(2); // Two entries with keys
  });

  it('should copy namespaced key format', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<ServiceKeyLookup />);
    fireEvent.click(screen.getByText('Service Key Lookup'));

    await waitFor(() => {
      expect(screen.getByText('team-alpha/auth-svc')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Copy team-alpha/auth-svc'));

    expect(writeText).toHaveBeenCalledWith('team-alpha/auth-svc');
  });

  it('should not re-fetch data when collapsed and re-expanded', async () => {
    render(<ServiceKeyLookup />);

    // Expand
    fireEvent.click(screen.getByText('Service Key Lookup'));
    await waitFor(() => {
      expect(screen.getByText('Auth Service')).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Collapse
    fireEvent.click(screen.getByText('Service Key Lookup'));

    // Re-expand
    fireEvent.click(screen.getByText('Service Key Lookup'));

    // Should not fetch again
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
