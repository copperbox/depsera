import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UserManagement from './UserManagement';

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock HTMLDialogElement
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = jest.fn();
  HTMLDialogElement.prototype.close = jest.fn();
});

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockUsers = [
  { id: 'u1', name: 'Admin User', email: 'admin@example.com', role: 'admin', is_active: true },
  { id: 'u2', name: 'Regular User', email: 'user@example.com', role: 'user', is_active: true },
  { id: 'u3', name: 'Inactive User', email: 'inactive@example.com', role: 'user', is_active: false },
];

beforeEach(() => {
  mockFetch.mockReset();
});

describe('UserManagement', () => {
  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    render(<UserManagement />);

    expect(screen.getByText('Loading users...')).toBeInTheDocument();
  });

  it('displays users after loading', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockUsers));

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('User Management')).toBeInTheDocument();
    });

    expect(screen.getByText('Admin User')).toBeInTheDocument();
    expect(screen.getByText('Regular User')).toBeInTheDocument();
    expect(screen.getByText('Inactive User')).toBeInTheDocument();
    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
  });

  it('displays error state and allows retry', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(jsonResponse(mockUsers));

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });
  });

  it('handles non-Error exception', async () => {
    mockFetch.mockRejectedValueOnce('String error');

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load users')).toBeInTheDocument();
    });
  });

  it('filters users by search query', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockUsers));

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Search by name or email...'), {
      target: { value: 'admin' },
    });

    expect(screen.getByText('Admin User')).toBeInTheDocument();
    expect(screen.queryByText('Regular User')).not.toBeInTheDocument();
  });

  it('filters users by email', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockUsers));

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Search by name or email...'), {
      target: { value: 'user@example.com' },
    });

    expect(screen.getByText('Regular User')).toBeInTheDocument();
    expect(screen.queryByText('Admin User')).not.toBeInTheDocument();
  });

  it('filters users by status - active only', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockUsers));

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Filter by status'), {
      target: { value: 'active' },
    });

    expect(screen.getByText('Admin User')).toBeInTheDocument();
    expect(screen.getByText('Regular User')).toBeInTheDocument();
    expect(screen.queryByText('Inactive User')).not.toBeInTheDocument();
  });

  it('filters users by status - inactive only', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockUsers));

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Filter by status'), {
      target: { value: 'inactive' },
    });

    expect(screen.getByText('Inactive User')).toBeInTheDocument();
    expect(screen.queryByText('Admin User')).not.toBeInTheDocument();
    expect(screen.queryByText('Regular User')).not.toBeInTheDocument();
  });

  it('shows empty state when no users match search', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockUsers));

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Search by name or email...'), {
      target: { value: 'nonexistent' },
    });

    expect(screen.getByText('No users match your search criteria.')).toBeInTheDocument();
  });

  it('shows empty state when no users exist', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('No users found.')).toBeInTheDocument();
    });
  });

  it('prevents demoting last admin', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockUsers));

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    const demoteButton = screen.getByText('Demote');
    expect(demoteButton).toBeDisabled();
    expect(demoteButton).toHaveAttribute('title', 'Cannot demote the last admin');
  });

  it('opens reactivate confirmation dialog', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockUsers));

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Inactive User')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Reactivate'));

    expect(screen.getByText('Reactivate User')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to reactivate/)).toBeInTheDocument();
  });

  it('handles role update error', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockUsers))
      .mockRejectedValueOnce(new Error('Failed to update role'));

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Regular User')).toBeInTheDocument();
    });

    const promoteButtons = screen.getAllByText('Promote');
    fireEvent.click(promoteButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Failed to update role')).toBeInTheDocument();
    });

    // Dismiss error
    fireEvent.click(screen.getByText('Dismiss'));
    expect(screen.queryByText('Failed to update role')).not.toBeInTheDocument();
  });

  it('closes reactivate dialog on cancel', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockUsers));

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Inactive User')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Reactivate'));

    expect(screen.getByText('Reactivate User')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { hidden: false })).not.toBeInTheDocument();
    });
  });

  it('displays role badges correctly', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockUsers));

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getAllByText('User').length).toBeGreaterThan(0);
  });

  it('displays status badges correctly', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockUsers));

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('prevents deactivating last admin', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockUsers));

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    // The deactivate button for the only admin should be disabled
    const deactivateButtons = screen.getAllByTitle(/Cannot deactivate the last admin|Deactivate user/);
    const lastAdminDeactivateBtn = deactivateButtons.find(
      (btn) => btn.getAttribute('title') === 'Cannot deactivate the last admin'
    );
    expect(lastAdminDeactivateBtn).toBeDisabled();
  });

  it('handles non-Error exception in role update', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockUsers))
      .mockRejectedValueOnce('String error');

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Regular User')).toBeInTheDocument();
    });

    const promoteButtons = screen.getAllByText('Promote');
    fireEvent.click(promoteButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Failed to update role')).toBeInTheDocument();
    });
  });
});
