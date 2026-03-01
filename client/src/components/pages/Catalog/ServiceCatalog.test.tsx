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
  },
  {
    id: 's2',
    name: 'Payment Service',
    manifest_key: 'pay-svc',
    description: null,
    is_active: 1,
    team_id: 't2',
    team_name: 'Team Beta',
  },
  {
    id: 's3',
    name: 'Legacy API',
    manifest_key: null,
    description: 'Old API',
    is_active: 0,
    team_id: 't1',
    team_name: 'Team Alpha',
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

  it('should render catalog entries', async () => {
    renderCatalog();

    await waitFor(() => {
      expect(screen.getByText('Auth Service')).toBeInTheDocument();
    });

    expect(screen.getByText('Payment Service')).toBeInTheDocument();
    expect(screen.getByText('Legacy API')).toBeInTheDocument();
  });

  it('should show manifest keys in code elements', async () => {
    renderCatalog();

    await waitFor(() => {
      expect(screen.getByText('auth-svc')).toBeInTheDocument();
    });

    expect(screen.getByText('pay-svc')).toBeInTheDocument();
    expect(screen.getByText('No key')).toBeInTheDocument();
  });

  it('should display team names', async () => {
    renderCatalog();

    await waitFor(() => {
      expect(screen.getByText('Auth Service')).toBeInTheDocument();
    });

    // Team Alpha appears in table rows (2x) and team dropdown (1x) = 3 total
    expect(screen.getAllByText('Team Alpha').length).toBeGreaterThanOrEqual(2);
    // Team Beta appears in table rows (1x) and team dropdown (1x) = 2 total
    expect(screen.getAllByText('Team Beta').length).toBeGreaterThanOrEqual(1);
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
      expect(screen.getByText('auth-svc')).toBeInTheDocument();
    });

    const copyButtons = screen.getAllByTitle('Copy manifest key');
    expect(copyButtons).toHaveLength(2); // Two entries with manifest keys
  });

  it('should render page title', async () => {
    renderCatalog();

    await waitFor(() => {
      expect(screen.getByText('Service Catalog')).toBeInTheDocument();
    });
  });

  describe('sorting', () => {
    function getTableRows() {
      const rows = screen.getAllByRole('row');
      // Skip header row
      return rows.slice(1).map((row) => {
        const cells = row.querySelectorAll('td');
        return cells[0]?.textContent ?? '';
      });
    }

    it('should sort by name ascending by default', async () => {
      renderCatalog();

      await waitFor(() => {
        expect(screen.getByText('Auth Service')).toBeInTheDocument();
      });

      const names = getTableRows();
      expect(names).toEqual(['Auth Service', 'Legacy API', 'Payment Service']);
    });

    it('should toggle name to descending on click', async () => {
      renderCatalog();

      await waitFor(() => {
        expect(screen.getByText('Auth Service')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Name'));

      const names = getTableRows();
      expect(names).toEqual(['Payment Service', 'Legacy API', 'Auth Service']);
    });

    it('should sort by team when Team header is clicked', async () => {
      renderCatalog();

      await waitFor(() => {
        expect(screen.getByText('Auth Service')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Team'));

      const names = getTableRows();
      // Team Alpha (Auth Service, Legacy API) before Team Beta (Payment Service)
      expect(names).toEqual(['Auth Service', 'Legacy API', 'Payment Service']);
    });

    it('should sort by status when Status header is clicked', async () => {
      renderCatalog();

      await waitFor(() => {
        expect(screen.getByText('Auth Service')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Status'));

      // Ascending: inactive (0) first, then active (1)
      const names = getTableRows();
      expect(names[0]).toBe('Legacy API');
    });

    it('should show sort direction indicators', async () => {
      renderCatalog();

      await waitFor(() => {
        expect(screen.getByText('Auth Service')).toBeInTheDocument();
      });

      // Name column header should have ascending aria-sort
      const nameHeader = screen.getByText('Name').closest('th');
      expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');

      // Click to toggle to descending
      fireEvent.click(screen.getByText('Name'));
      expect(nameHeader).toHaveAttribute('aria-sort', 'descending');
    });

    it('should reset to ascending when switching columns', async () => {
      renderCatalog();

      await waitFor(() => {
        expect(screen.getByText('Auth Service')).toBeInTheDocument();
      });

      // Click Name to go descending
      fireEvent.click(screen.getByText('Name'));
      const nameHeader = screen.getByText('Name').closest('th');
      expect(nameHeader).toHaveAttribute('aria-sort', 'descending');

      // Click Team — should be ascending
      fireEvent.click(screen.getByText('Team'));
      const teamHeader = screen.getByText('Team').closest('th');
      expect(teamHeader).toHaveAttribute('aria-sort', 'ascending');
      expect(nameHeader).toHaveAttribute('aria-sort', 'none');
    });
  });
});
