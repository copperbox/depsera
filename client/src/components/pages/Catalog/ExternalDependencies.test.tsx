import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExternalDependencies from './ExternalDependencies';

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

const mockEntries = [
  {
    canonical_name: 'postgresql',
    description: 'Primary relational database',
    teams: [
      { id: 't1', name: 'Team Alpha', key: 'team-alpha' },
      { id: 't2', name: 'Team Beta', key: 'team-beta' },
    ],
    aliases: ['pg', 'postgres'],
    usage_count: 5,
  },
  {
    canonical_name: 'redis',
    description: null,
    teams: [{ id: 't1', name: 'Team Alpha', key: 'team-alpha' }],
    aliases: [],
    usage_count: 2,
  },
  {
    canonical_name: 'rabbitmq',
    description: 'Message broker',
    teams: [{ id: 't2', name: 'Team Beta', key: 'team-beta' }],
    aliases: ['rmq'],
    usage_count: 1,
  },
];

function renderComponent() {
  return render(<ExternalDependencies />);
}

describe('ExternalDependencies', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation((url: string) => {
      if (url.startsWith('/api/catalog/external-dependencies')) {
        return Promise.resolve(jsonResponse(mockEntries));
      }
      return Promise.resolve(jsonResponse([], 404));
    });
  });

  it('should show loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));
    renderComponent();
    expect(
      screen.getByText('Loading external dependencies...'),
    ).toBeInTheDocument();
  });

  it('should render table with entries', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('postgresql')).toBeInTheDocument();
    });

    expect(screen.getByText('redis')).toBeInTheDocument();
    expect(screen.getByText('rabbitmq')).toBeInTheDocument();
  });

  it('should show descriptions', async () => {
    renderComponent();

    await waitFor(() => {
      expect(
        screen.getByText('Primary relational database'),
      ).toBeInTheDocument();
    });

    expect(screen.getByText('Message broker')).toBeInTheDocument();
  });

  it('should show "No description" when description is null', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('postgresql')).toBeInTheDocument();
    });

    // redis has null description
    expect(screen.getAllByText('No description')).toHaveLength(1);
  });

  it('should show team chips', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('postgresql')).toBeInTheDocument();
    });

    // Team Alpha appears for both postgresql and redis
    expect(screen.getAllByText('Team Alpha')).toHaveLength(2);
    // Team Beta appears for postgresql and rabbitmq
    expect(screen.getAllByText('Team Beta')).toHaveLength(2);
  });

  it('should show alias badges', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('pg')).toBeInTheDocument();
    });

    expect(screen.getByText('postgres')).toBeInTheDocument();
    expect(screen.getByText('rmq')).toBeInTheDocument();
  });

  it('should show "None" when no aliases exist', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('postgresql')).toBeInTheDocument();
    });

    // redis has no aliases
    expect(screen.getAllByText('None')).toHaveLength(1);
  });

  it('should filter by canonical name', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('postgresql')).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByPlaceholderText('Search by canonical name or alias...'),
      { target: { value: 'post' } },
    );

    expect(screen.getByText('postgresql')).toBeInTheDocument();
    expect(screen.queryByText('redis')).not.toBeInTheDocument();
    expect(screen.queryByText('rabbitmq')).not.toBeInTheDocument();
  });

  it('should filter by alias', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('postgresql')).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByPlaceholderText('Search by canonical name or alias...'),
      { target: { value: 'rmq' } },
    );

    expect(screen.getByText('rabbitmq')).toBeInTheDocument();
    expect(screen.queryByText('postgresql')).not.toBeInTheDocument();
  });

  it('should show empty state when no data', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(jsonResponse([])),
    );

    renderComponent();

    await waitFor(() => {
      expect(
        screen.getByText('No external dependencies found.'),
      ).toBeInTheDocument();
    });
  });

  it('should show no-match state when search excludes all', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('postgresql')).toBeInTheDocument();
    });

    fireEvent.change(
      screen.getByPlaceholderText('Search by canonical name or alias...'),
      { target: { value: 'nonexistent-xyz' } },
    );

    expect(
      screen.getByText('No external dependencies match your search.'),
    ).toBeInTheDocument();
  });

  it('should show error state with retry', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(jsonResponse({ message: 'Server error' }, 500)),
    );

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });

    // Set up success response for retry
    mockFetch.mockImplementation((url: string) => {
      if (url.startsWith('/api/catalog/external-dependencies')) {
        return Promise.resolve(jsonResponse(mockEntries));
      }
      return Promise.resolve(jsonResponse([], 404));
    });

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('postgresql')).toBeInTheDocument();
    });
  });

  it('should have copy buttons for canonical names', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('postgresql')).toBeInTheDocument();
    });

    const copyButtons = screen.getAllByTitle('Copy canonical name');
    expect(copyButtons).toHaveLength(3);
  });

  it('should copy canonical name on click', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('postgresql')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Copy postgresql'));

    expect(writeText).toHaveBeenCalledWith('postgresql');
  });

  it('should have table headers', async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('postgresql')).toBeInTheDocument();
    });

    expect(screen.getByText('Canonical Name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Used By')).toBeInTheDocument();
    expect(screen.getByText('Aliases')).toBeInTheDocument();
  });
});
