import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ServiceCatalog from './ServiceCatalog';

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock auth context
jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Admin', role: 'admin', teams: [] },
    isAdmin: true,
  }),
}));

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
    description: 'Handles authentication',
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
    name: 'Legacy API',
    manifest_key: null,
    description: 'Old API',
    is_active: 0,
    team_id: 't1',
    team_name: 'Team Alpha',
    team_key: 'team-alpha',
  },
];

const mockTeams = [
  { id: 't1', name: 'Team Alpha', service_count: 2 },
  { id: 't2', name: 'Team Beta', service_count: 1 },
];

function renderCatalog() {
  return render(
    <MemoryRouter>
      <ServiceCatalog />
    </MemoryRouter>,
  );
}

describe('ServiceCatalog', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Default: catalog then teams
    mockFetch.mockImplementation((url: string) => {
      if (url.startsWith('/api/services/catalog')) return Promise.resolve(jsonResponse(mockCatalog));
      if (url === '/api/teams') return Promise.resolve(jsonResponse(mockTeams));
      return Promise.resolve(jsonResponse([], 404));
    });
  });

  it('should show loading state initially', () => {
    // Never resolve the fetch
    mockFetch.mockImplementation(() => new Promise(() => {}));
    renderCatalog();
    expect(screen.getByText('Loading service catalog...')).toBeInTheDocument();
  });

  it('should render catalog entries grouped by team', async () => {
    renderCatalog();

    await waitFor(() => {
      expect(screen.getByText('Auth Service')).toBeInTheDocument();
    });

    expect(screen.getByText('Payment Service')).toBeInTheDocument();
    expect(screen.getByText('Legacy API')).toBeInTheDocument();

    // Team headers should be visible
    expect(screen.getByRole('button', { name: /Team Alpha/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Team Beta/ })).toBeInTheDocument();
  });

  it('should show team key badges', async () => {
    renderCatalog();

    await waitFor(() => {
      expect(screen.getByText('team-alpha')).toBeInTheDocument();
    });

    expect(screen.getByText('team-beta')).toBeInTheDocument();
  });

  it('should show service counts per team', async () => {
    renderCatalog();

    await waitFor(() => {
      expect(screen.getByText('2 services')).toBeInTheDocument();
    });

    expect(screen.getByText('1 service')).toBeInTheDocument();
  });

  it('should show namespaced manifest keys', async () => {
    renderCatalog();

    await waitFor(() => {
      expect(screen.getByText('team-alpha/auth-svc')).toBeInTheDocument();
    });

    expect(screen.getByText('team-beta/pay-svc')).toBeInTheDocument();
    expect(screen.getByText('No key')).toBeInTheDocument();
  });

  it('should display status badges', async () => {
    renderCatalog();

    await waitFor(() => {
      expect(screen.getAllByText('Active')).toHaveLength(2);
    });

    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('should filter by search query on name', async () => {
    renderCatalog();

    await waitFor(() => {
      expect(screen.getByText('Auth Service')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Search by name or manifest key...'), {
      target: { value: 'auth' },
    });

    expect(screen.getByText('Auth Service')).toBeInTheDocument();
    expect(screen.queryByText('Payment Service')).not.toBeInTheDocument();
    expect(screen.queryByText('Legacy API')).not.toBeInTheDocument();
  });

  it('should filter by search query on manifest_key', async () => {
    renderCatalog();

    await waitFor(() => {
      expect(screen.getByText('Auth Service')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Search by name or manifest key...'), {
      target: { value: 'pay-svc' },
    });

    expect(screen.getByText('Payment Service')).toBeInTheDocument();
    expect(screen.queryByText('Auth Service')).not.toBeInTheDocument();
  });

  it('should filter by team', async () => {
    renderCatalog();

    await waitFor(() => {
      expect(screen.getByText('Auth Service')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Filter by team'), {
      target: { value: 't2' },
    });

    expect(screen.getByText('Payment Service')).toBeInTheDocument();
    expect(screen.queryByText('Auth Service')).not.toBeInTheDocument();
    expect(screen.queryByText('Legacy API')).not.toBeInTheDocument();
  });

  it('should hide empty team sections when filtering', async () => {
    renderCatalog();

    await waitFor(() => {
      expect(screen.getByText('Auth Service')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Search by name or manifest key...'), {
      target: { value: 'payment' },
    });

    // Team Beta should still be visible (has matching service)
    expect(screen.getByRole('button', { name: /Team Beta/ })).toBeInTheDocument();
    // Team Alpha should be hidden (no matching services)
    expect(screen.queryByRole('button', { name: /Team Alpha/ })).not.toBeInTheDocument();
  });

  it('should show empty state when no services exist', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.startsWith('/api/services/catalog')) return Promise.resolve(jsonResponse([]));
      if (url === '/api/teams') return Promise.resolve(jsonResponse([]));
      return Promise.resolve(jsonResponse([], 404));
    });

    renderCatalog();

    await waitFor(() => {
      expect(screen.getByText('No services have been registered yet.')).toBeInTheDocument();
    });
  });

  it('should show no-match state when filters exclude everything', async () => {
    renderCatalog();

    await waitFor(() => {
      expect(screen.getByText('Auth Service')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Search by name or manifest key...'), {
      target: { value: 'nonexistent-xyz' },
    });

    expect(screen.getByText('No services match your search criteria.')).toBeInTheDocument();
  });

  it('should show error state and retry', async () => {
    mockFetch.mockImplementation(() => Promise.resolve(jsonResponse({ message: 'Server error' }, 500)));

    renderCatalog();

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });

    // Set up success response for retry
    mockFetch.mockImplementation((url: string) => {
      if (url.startsWith('/api/services/catalog')) return Promise.resolve(jsonResponse(mockCatalog));
      if (url === '/api/teams') return Promise.resolve(jsonResponse(mockTeams));
      return Promise.resolve(jsonResponse([], 404));
    });

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Auth Service')).toBeInTheDocument();
    });
  });

  it('should have copy buttons for manifest keys', async () => {
    renderCatalog();

    await waitFor(() => {
      expect(screen.getByText('team-alpha/auth-svc')).toBeInTheDocument();
    });

    const copyButtons = screen.getAllByTitle('Copy manifest key');
    expect(copyButtons).toHaveLength(2); // Two entries with manifest keys
  });

  it('should copy namespaced key format', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderCatalog();

    await waitFor(() => {
      expect(screen.getByText('team-alpha/auth-svc')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Copy team-alpha/auth-svc'));

    expect(writeText).toHaveBeenCalledWith('team-alpha/auth-svc');
  });

  it('should render page title', async () => {
    renderCatalog();

    await waitFor(() => {
      expect(screen.getByText('Service Catalog')).toBeInTheDocument();
    });
  });

  describe('accordion', () => {
    it('should collapse a team section when clicked', async () => {
      renderCatalog();

      await waitFor(() => {
        expect(screen.getByText('Auth Service')).toBeInTheDocument();
      });

      // Click Team Alpha header to collapse
      fireEvent.click(screen.getByRole('button', { name: /Team Alpha/ }));

      // Services in Team Alpha should be hidden
      expect(screen.queryByText('Auth Service')).not.toBeInTheDocument();
      expect(screen.queryByText('Legacy API')).not.toBeInTheDocument();

      // Team Beta services should still be visible
      expect(screen.getByText('Payment Service')).toBeInTheDocument();
    });

    it('should expand a collapsed team section when clicked again', async () => {
      renderCatalog();

      await waitFor(() => {
        expect(screen.getByText('Auth Service')).toBeInTheDocument();
      });

      // Collapse
      fireEvent.click(screen.getByRole('button', { name: /Team Alpha/ }));
      expect(screen.queryByText('Auth Service')).not.toBeInTheDocument();

      // Expand again
      fireEvent.click(screen.getByRole('button', { name: /Team Alpha/ }));
      expect(screen.getByText('Auth Service')).toBeInTheDocument();
    });

    it('should auto-expand all sections when searching', async () => {
      renderCatalog();

      await waitFor(() => {
        expect(screen.getByText('Auth Service')).toBeInTheDocument();
      });

      // Collapse Team Alpha
      fireEvent.click(screen.getByRole('button', { name: /Team Alpha/ }));
      expect(screen.queryByText('Auth Service')).not.toBeInTheDocument();

      // Search — should auto-expand matching teams
      fireEvent.change(screen.getByPlaceholderText('Search by name or manifest key...'), {
        target: { value: 'auth' },
      });

      expect(screen.getByText('Auth Service')).toBeInTheDocument();
    });
  });

  it('should show description in cards', async () => {
    renderCatalog();

    await waitFor(() => {
      expect(screen.getByText('Handles authentication')).toBeInTheDocument();
    });

    expect(screen.getByText('Old API')).toBeInTheDocument();
  });
});
