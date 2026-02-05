import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TeamsList from './TeamsList';

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock HTMLDialogElement
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = jest.fn();
  HTMLDialogElement.prototype.close = jest.fn();
});

// Mock auth context
const mockUseAuth = jest.fn();
jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockTeams = [
  { id: 't1', name: 'Team Alpha', description: 'First team', member_count: 3, service_count: 2 },
  { id: 't2', name: 'Team Beta', description: null, member_count: 1, service_count: 1 },
];

function renderTeamsList(isAdmin = false) {
  mockUseAuth.mockReturnValue({ isAdmin });
  return render(
    <MemoryRouter>
      <TeamsList />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  mockUseAuth.mockReset();
});

describe('TeamsList', () => {
  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    renderTeamsList();

    expect(screen.getByText('Loading teams...')).toBeInTheDocument();
  });

  it('displays teams after loading', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockTeams));

    renderTeamsList();

    await waitFor(() => {
      expect(screen.getByText('Teams')).toBeInTheDocument();
    });

    expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    expect(screen.getByText('Team Beta')).toBeInTheDocument();
    expect(screen.getByText('First team')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument(); // null description
  });

  it('displays error state and allows retry', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(jsonResponse(mockTeams));

    renderTeamsList();

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    });
  });

  it('filters teams by search query', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockTeams));

    renderTeamsList();

    await waitFor(() => {
      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Search teams...'), {
      target: { value: 'alpha' },
    });

    expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Team Beta')).not.toBeInTheDocument();
  });

  it('shows empty state when no teams match search', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockTeams));

    renderTeamsList();

    await waitFor(() => {
      expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Search teams...'), {
      target: { value: 'nonexistent' },
    });

    expect(screen.getByText('No teams match your search criteria.')).toBeInTheDocument();
  });

  it('shows empty state when no teams exist', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    renderTeamsList();

    await waitFor(() => {
      expect(screen.getByText('No teams have been created yet.')).toBeInTheDocument();
    });
  });

  it('shows add button for admin users', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockTeams));

    renderTeamsList(true);

    await waitFor(() => {
      expect(screen.getByText('Add Team')).toBeInTheDocument();
    });
  });

  it('hides add button for non-admin users', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockTeams));

    renderTeamsList(false);

    await waitFor(() => {
      expect(screen.getByText('Teams')).toBeInTheDocument();
    });

    expect(screen.queryByText('Add Team')).not.toBeInTheDocument();
  });

  it('opens add team modal when button clicked', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockTeams));

    renderTeamsList(true);

    await waitFor(() => {
      expect(screen.getByText('Add Team')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Team'));

    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument();
  });

  it('displays member and service counts with correct labels', async () => {
    const teamsWithVariedCounts = [
      { id: 't1', name: 'Team One', description: null, member_count: 1, service_count: 1 },
      { id: 't2', name: 'Team Two', description: null, member_count: 2, service_count: 5 },
    ];

    mockFetch.mockResolvedValueOnce(jsonResponse(teamsWithVariedCounts));

    renderTeamsList();

    await waitFor(() => {
      expect(screen.getByText('Team One')).toBeInTheDocument();
    });

    // Singular forms (Team One has 1 member, 1 service)
    expect(screen.getAllByText('member').length).toBeGreaterThan(0);
    expect(screen.getAllByText('service').length).toBeGreaterThan(0);

    // Plural forms (Team Two has 2 members, 5 services)
    expect(screen.getAllByText('members').length).toBeGreaterThan(0);
    expect(screen.getAllByText('services').length).toBeGreaterThan(0);
  });
});
