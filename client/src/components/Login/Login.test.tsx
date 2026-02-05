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

  it('renders login page when not authenticated', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    renderLogin();

    expect(await screen.findByText('Depsera')).toBeInTheDocument();
    expect(screen.getByText('Sign in to continue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In with SSO' })).toBeInTheDocument();
  });

  it('redirects to home when already authenticated', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', name: 'User', role: 'user' }),
    });

    renderLogin();

    expect(await screen.findByText('Home Page')).toBeInTheDocument();
  });

  it('displays auth_failed error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    renderLogin('/login?error=auth_failed');

    expect(await screen.findByText('Authentication failed. Please try again.')).toBeInTheDocument();
  });

  it('displays state_mismatch error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    renderLogin('/login?error=state_mismatch');

    expect(await screen.findByText('Session expired. Please try again.')).toBeInTheDocument();
  });

  it('displays generic error for unknown error codes', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    renderLogin('/login?error=unknown_error');

    expect(await screen.findByText('An error occurred. Please try again.')).toBeInTheDocument();
  });

  it('calls login when SSO button is clicked', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    renderLogin();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign In with SSO' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign In with SSO' }));

    expect(mockLocation.href).toBe('/api/auth/login?returnTo=%2Flogin');
  });
});
