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

/**
 * Helper to set up fetch mock that handles URL routing.
 * The component makes parallel calls to /api/users and /api/auth/mode.
 */
function setupFetchMock(options: {
  users?: unknown;
  usersStatus?: number;
  usersError?: Error | string;
  authMode?: string;
  // Additional sequential responses after the initial load
  additionalResponses?: Array<{ data?: unknown; status?: number; error?: Error | string }>;
} = {}) {
  const {
    users = mockUsers,
    usersStatus = 200,
    usersError,
    authMode = 'oidc',
    additionalResponses = [],
  } = options;

  let additionalIndex = 0;

  mockFetch.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/auth/mode')) {
      return Promise.resolve(jsonResponse({ mode: authMode }));
    }
    if (typeof url === 'string' && url.includes('/api/users')) {
      // First users call or reload
      if (additionalIndex < additionalResponses.length) {
        // Check if we already served the initial response
        // This is for subsequent calls (e.g., after actions)
      }
      if (usersError) {
        return typeof usersError === 'string'
          ? Promise.reject(usersError)
          : Promise.reject(usersError);
      }
      return Promise.resolve(jsonResponse(users, usersStatus));
    }
    return Promise.resolve(jsonResponse({}));
  });

  // Override for sequential responses after initial load
  if (additionalResponses.length > 0) {
    const originalImpl = mockFetch.getMockImplementation()!;
    let callCount = 0;
    mockFetch.mockImplementation((url: string, ...args: unknown[]) => {
      if (typeof url === 'string' && url.includes('/api/auth/mode')) {
        return Promise.resolve(jsonResponse({ mode: authMode }));
      }
      if (typeof url === 'string' && url.includes('/api/users')) {
        callCount++;
        if (callCount === 1) {
          // Initial load
          return Promise.resolve(jsonResponse(users, usersStatus));
        }
        // Subsequent calls
        if (additionalIndex < additionalResponses.length) {
          const resp = additionalResponses[additionalIndex++];
          if (resp.error) {
            return typeof resp.error === 'string'
              ? Promise.reject(resp.error)
              : Promise.reject(resp.error);
          }
          return Promise.resolve(jsonResponse(resp.data ?? users, resp.status ?? 200));
        }
        return Promise.resolve(jsonResponse(users));
      }
      return originalImpl(url, ...args);
    });
  }
}

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
    setupFetchMock();

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
    let callCount = 0;
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/auth/mode')) {
        return Promise.resolve(jsonResponse({ mode: 'oidc' }));
      }
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve(jsonResponse(mockUsers));
    });

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
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/auth/mode')) {
        return Promise.resolve(jsonResponse({ mode: 'oidc' }));
      }
      return Promise.reject('String error');
    });

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load users')).toBeInTheDocument();
    });
  });

  it('filters users by search query', async () => {
    setupFetchMock();

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
    setupFetchMock();

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
    setupFetchMock();

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
    setupFetchMock();

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
    setupFetchMock();

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
    setupFetchMock({ users: [] });

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('No users found.')).toBeInTheDocument();
    });
  });

  it('prevents demoting last admin', async () => {
    setupFetchMock();

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    const demoteButton = screen.getByText('Demote');
    expect(demoteButton).toBeDisabled();
    expect(demoteButton).toHaveAttribute('title', 'Cannot demote the last admin');
  });

  it('opens reactivate confirmation dialog', async () => {
    setupFetchMock();

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Inactive User')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Reactivate'));

    expect(screen.getByText('Reactivate User')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to reactivate/)).toBeInTheDocument();
  });

  it('handles role update error', async () => {
    let userCallCount = 0;
    mockFetch.mockImplementation((url: string, _options?: { method?: string }) => {
      if (typeof url === 'string' && url.includes('/api/auth/mode')) {
        return Promise.resolve(jsonResponse({ mode: 'oidc' }));
      }
      if (typeof url === 'string' && url.includes('/role')) {
        return Promise.reject(new Error('Failed to update role'));
      }
      if (typeof url === 'string' && url.includes('/api/users')) {
        userCallCount++;
        return Promise.resolve(jsonResponse(mockUsers));
      }
      return Promise.resolve(jsonResponse({}));
    });

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
    setupFetchMock();

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
    setupFetchMock();

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getAllByText('User').length).toBeGreaterThan(0);
  });

  it('displays status badges correctly', async () => {
    setupFetchMock();

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('prevents deactivating last admin', async () => {
    setupFetchMock();

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
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/auth/mode')) {
        return Promise.resolve(jsonResponse({ mode: 'oidc' }));
      }
      if (typeof url === 'string' && url.includes('/role')) {
        return Promise.reject('String error');
      }
      return Promise.resolve(jsonResponse(mockUsers));
    });

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

describe('UserManagement - Local Auth Mode', () => {
  it('shows Create User button in local auth mode', async () => {
    setupFetchMock({ authMode: 'local' });

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    expect(screen.getByText('Create User')).toBeInTheDocument();
  });

  it('does not show Create User button in OIDC mode', async () => {
    setupFetchMock({ authMode: 'oidc' });

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    expect(screen.queryByText('Create User')).not.toBeInTheDocument();
  });

  it('shows Reset Password button for active users in local mode', async () => {
    setupFetchMock({ authMode: 'local' });

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    const resetButtons = screen.getAllByText('Reset Password');
    // Should have buttons for active users (u1 and u2)
    expect(resetButtons.length).toBe(2);
  });

  it('does not show Reset Password button in OIDC mode', async () => {
    setupFetchMock({ authMode: 'oidc' });

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    expect(screen.queryByText('Reset Password')).not.toBeInTheDocument();
  });

  it('opens and closes create user form', async () => {
    setupFetchMock({ authMode: 'local' });

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    // Open form
    fireEvent.click(screen.getByText('Create User'));
    expect(screen.getByText('Create New User')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Display Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Role')).toBeInTheDocument();

    // Close form via Cancel
    const cancelButtons = screen.getAllByText('Cancel');
    fireEvent.click(cancelButtons[0]);
    expect(screen.queryByText('Create New User')).not.toBeInTheDocument();
  });

  it('validates password match on create user form', async () => {
    setupFetchMock({ authMode: 'local' });

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create User'));

    // Fill form with mismatched passwords
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'New User' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'different' } });

    // Submit
    const submitButtons = screen.getAllByText('Create User');
    const formSubmit = submitButtons.find(btn => btn.getAttribute('type') === 'submit');
    fireEvent.click(formSubmit!);

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
  });

  it('validates password length on create user form', async () => {
    setupFetchMock({ authMode: 'local' });

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create User'));

    // Fill form with short password
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'New User' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'short' } });

    // Submit
    const submitButtons = screen.getAllByText('Create User');
    const formSubmit = submitButtons.find(btn => btn.getAttribute('type') === 'submit');
    fireEvent.click(formSubmit!);

    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
  });

  it('submits create user form successfully', async () => {
    const newUser = {
      id: 'u4',
      name: 'New User',
      email: 'new@example.com',
      role: 'user',
      is_active: true,
    };

    mockFetch.mockImplementation((url: string, options?: { method?: string }) => {
      if (typeof url === 'string' && url.includes('/api/auth/mode')) {
        return Promise.resolve(jsonResponse({ mode: 'local' }));
      }
      if (typeof url === 'string' && url === '/api/users' && options?.method === 'POST') {
        return Promise.resolve(jsonResponse(newUser, 201));
      }
      return Promise.resolve(jsonResponse(mockUsers));
    });

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create User'));

    // Fill valid form
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'New User' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password123' } });

    // Submit
    const submitButtons = screen.getAllByText('Create User');
    const formSubmit = submitButtons.find(btn => btn.getAttribute('type') === 'submit');
    fireEvent.click(formSubmit!);

    await waitFor(() => {
      expect(screen.getByText('User created successfully')).toBeInTheDocument();
    });

    // Form should be closed
    expect(screen.queryByText('Create New User')).not.toBeInTheDocument();
  });

  it('handles create user API error', async () => {
    mockFetch.mockImplementation((url: string, options?: { method?: string }) => {
      if (typeof url === 'string' && url.includes('/api/auth/mode')) {
        return Promise.resolve(jsonResponse({ mode: 'local' }));
      }
      if (typeof url === 'string' && url === '/api/users' && options?.method === 'POST') {
        return Promise.resolve(jsonResponse({ error: 'A user with this email already exists' }, 409));
      }
      return Promise.resolve(jsonResponse(mockUsers));
    });

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create User'));

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'existing@example.com' } });
    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'Existing' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'password123' } });

    const submitButtons = screen.getAllByText('Create User');
    const formSubmit = submitButtons.find(btn => btn.getAttribute('type') === 'submit');
    fireEvent.click(formSubmit!);

    await waitFor(() => {
      expect(screen.getByText('A user with this email already exists')).toBeInTheDocument();
    });
  });

  it('opens reset password modal', async () => {
    setupFetchMock({ authMode: 'local' });

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    const resetButtons = screen.getAllByText('Reset Password');
    fireEvent.click(resetButtons[0]);

    expect(screen.getByText(/Reset Password for/)).toBeInTheDocument();
    expect(screen.getByLabelText('New Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
  });

  it('closes reset password modal on cancel', async () => {
    setupFetchMock({ authMode: 'local' });

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    const resetButtons = screen.getAllByText('Reset Password');
    fireEvent.click(resetButtons[0]);

    expect(screen.getByText(/Reset Password for/)).toBeInTheDocument();

    // Click cancel in modal
    const cancelButtons = screen.getAllByText('Cancel');
    fireEvent.click(cancelButtons[cancelButtons.length - 1]);

    expect(screen.queryByText(/Reset Password for/)).not.toBeInTheDocument();
  });

  it('closes reset password modal on overlay click', async () => {
    setupFetchMock({ authMode: 'local' });

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });

    const resetButtons = screen.getAllByText('Reset Password');
    fireEvent.click(resetButtons[0]);

    expect(screen.getByText(/Reset Password for/)).toBeInTheDocument();

    // Click overlay (the modal overlay div)
    const overlay = screen.getByText(/Reset Password for/).closest('[class*=modalContent]')?.parentElement;
    if (overlay) {
      fireEvent.click(overlay);
    }

    expect(screen.queryByText(/Reset Password for/)).not.toBeInTheDocument();
  });
});
