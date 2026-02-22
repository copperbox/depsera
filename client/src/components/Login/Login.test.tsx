import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Login from './Login';
import { AuthProvider } from './../../contexts/AuthContext';

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock window.location
const mockLocation = {
  href: '',
  pathname: '/login',
};
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

function renderLogin(initialPath = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<div>Home Page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Login', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockLocation.href = '';
    mockLocation.pathname = '/login';
  });

  it('shows loading state while checking auth', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    renderLogin();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('redirects to home when already authenticated', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      id: '1', name: 'User', role: 'user',
    }));

    renderLogin();

    expect(await screen.findByText('Home Page')).toBeInTheDocument();
  });

  describe('OIDC mode', () => {
    beforeEach(() => {
      // First call: /api/auth/me (not authenticated)
      // Second call: /api/auth/mode (returns oidc)
      mockFetch
        .mockResolvedValueOnce(jsonResponse({}, 401))
        .mockResolvedValueOnce(jsonResponse({ mode: 'oidc' }));
    });

    it('renders SSO button in OIDC mode', async () => {
      renderLogin();

      expect(await screen.findByRole('button', { name: 'Sign In with SSO' })).toBeInTheDocument();
    });

    it('does not render email/password form', async () => {
      renderLogin();

      await screen.findByRole('button', { name: 'Sign In with SSO' });
      expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    });

    it('calls login when SSO button is clicked', async () => {
      renderLogin();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Sign In with SSO' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Sign In with SSO' }));

      expect(mockLocation.href).toBe('/api/auth/login?returnTo=%2Flogin');
    });
  });

  describe('local auth mode', () => {
    beforeEach(() => {
      // First call: /api/auth/me (not authenticated)
      // Second call: /api/auth/mode (returns local)
      mockFetch
        .mockResolvedValueOnce(jsonResponse({}, 401))
        .mockResolvedValueOnce(jsonResponse({ mode: 'local' }));
    });

    it('renders email and password form in local mode', async () => {
      renderLogin();

      expect(await screen.findByLabelText('Email')).toBeInTheDocument();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    });

    it('does not render SSO button', async () => {
      renderLogin();

      await screen.findByLabelText('Email');
      expect(screen.queryByRole('button', { name: 'Sign In with SSO' })).not.toBeInTheDocument();
    });

    it('submits credentials and redirects on success', async () => {
      renderLogin();

      await screen.findByLabelText('Email');

      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'admin@test.com' },
      });
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'password123' },
      });

      // POST /api/auth/login (success)
      // GET /api/auth/me (re-check auth after login)
      mockFetch
        .mockResolvedValueOnce(jsonResponse({
          id: '1', email: 'admin@test.com', name: 'Admin', role: 'admin',
        }))
        .mockResolvedValueOnce(jsonResponse({
          id: '1', email: 'admin@test.com', name: 'Admin', role: 'admin',
        }));

      fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

      expect(await screen.findByText('Home Page')).toBeInTheDocument();
    });

    it('shows error on invalid credentials', async () => {
      renderLogin();

      await screen.findByLabelText('Email');

      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'bad@test.com' },
      });
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'wrong' },
      });

      // POST /api/auth/login (fails)
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ error: 'Invalid email or password' }, 401),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

      expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
    });

    it('shows submitting state during login', async () => {
      renderLogin();

      await screen.findByLabelText('Email');

      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'admin@test.com' },
      });
      fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'password123' },
      });

      // POST /api/auth/login (pending)
      mockFetch.mockImplementationOnce(() => new Promise(() => {}));

      fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

      expect(await screen.findByRole('button', { name: 'Signing in...' })).toBeDisabled();
    });
  });

  describe('error display', () => {
    beforeEach(() => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({}, 401))
        .mockResolvedValueOnce(jsonResponse({ mode: 'oidc' }));
    });

    it('displays auth_failed error', async () => {
      renderLogin('/login?error=auth_failed');

      expect(await screen.findByText('Authentication failed. Please try again.')).toBeInTheDocument();
    });

    it('displays state_mismatch error', async () => {
      renderLogin('/login?error=state_mismatch');

      expect(await screen.findByText('Session expired. Please try again.')).toBeInTheDocument();
    });

    it('displays generic error for unknown error codes', async () => {
      renderLogin('/login?error=unknown_error');

      expect(await screen.findByText('An error occurred. Please try again.')).toBeInTheDocument();
    });
  });

  describe('auth mode fallback', () => {
    it('falls back to OIDC mode when mode endpoint fails', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({}, 401))
        .mockResolvedValueOnce(jsonResponse({ error: 'Server error' }, 500));

      renderLogin();

      expect(await screen.findByRole('button', { name: 'Sign In with SSO' })).toBeInTheDocument();
    });
  });
});
