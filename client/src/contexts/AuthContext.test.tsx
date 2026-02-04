import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock window.location
const mockLocation = {
  href: '',
  pathname: '/dashboard',
};
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

// Test component that uses the auth context
function TestComponent() {
  const { user, isLoading, isAuthenticated, isAdmin, login, logout, checkAuth } = useAuth();
  return (
    <div>
      <span data-testid="loading">{isLoading ? 'loading' : 'done'}</span>
      <span data-testid="authenticated">{isAuthenticated ? 'yes' : 'no'}</span>
      <span data-testid="admin">{isAdmin ? 'yes' : 'no'}</span>
      <span data-testid="user">{user?.name || 'none'}</span>
      <button onClick={login}>Login</button>
      <button onClick={logout}>Logout</button>
      <button onClick={checkAuth}>Check Auth</button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocation.href = '';
    mockLocation.pathname = '/dashboard';
  });

  it('starts in loading state and checks auth on mount', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', name: 'Test User', role: 'user' }),
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Initially loading
    expect(screen.getByTestId('loading')).toHaveTextContent('loading');

    // Wait for auth check to complete
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('done');
    });

    expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
    expect(screen.getByTestId('user')).toHaveTextContent('Test User');
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/me', { credentials: 'include' });
  });

  it('sets user to null when auth check returns non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('done');
    });

    expect(screen.getByTestId('authenticated')).toHaveTextContent('no');
    expect(screen.getByTestId('user')).toHaveTextContent('none');
  });

  it('sets user to null when auth check throws error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('done');
    });

    expect(screen.getByTestId('authenticated')).toHaveTextContent('no');
  });

  it('identifies admin users', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', name: 'Admin User', role: 'admin' }),
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('done');
    });

    expect(screen.getByTestId('admin')).toHaveTextContent('yes');
  });

  it('login redirects to OIDC endpoint with return URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('done');
    });

    fireEvent.click(screen.getByText('Login'));

    expect(mockLocation.href).toBe('/api/auth/login?returnTo=%2Fdashboard');
  });

  it('logout clears user and redirects to external URL', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '1', name: 'Test User', role: 'user' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ redirectUrl: 'https://auth.example.com/logout' }),
      });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Logout'));
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    expect(mockLocation.href).toBe('https://auth.example.com/logout');
  });

  it('logout redirects to internal URL', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '1', name: 'Test User', role: 'user' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ redirectUrl: '/login' }),
      });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Logout'));
    });

    expect(mockLocation.href).toBe('/login');
  });

  it('logout handles error and redirects to login', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '1', name: 'Test User', role: 'user' }),
      })
      .mockRejectedValueOnce(new Error('Network error'));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('yes');
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Logout'));
    });

    expect(mockLocation.href).toBe('/login');
    expect(screen.getByTestId('authenticated')).toHaveTextContent('no');

    consoleSpy.mockRestore();
  });

  it('checkAuth can be called manually', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '1', name: 'New User', role: 'user' }),
      });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('no');
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Check Auth'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('New User');
    });
  });
});

describe('useAuth', () => {
  it('throws error when used outside AuthProvider', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useAuth must be used within an AuthProvider');

    consoleSpy.mockRestore();
  });
});
