import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import { AuthProvider } from './../../contexts/AuthContext';

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Helper to render protected route with router context
function renderProtectedRoute(
  {
    requireAdmin = false,
    initialPath = '/protected',
  }: { requireAdmin?: boolean; initialPath?: string } = {}
) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/" element={<div>Home Page</div>} />
          <Route
            path="/protected"
            element={
              <ProtectedRoute requireAdmin={requireAdmin}>
                <div>Protected Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('shows loading state while checking auth', () => {
    // Never resolve the fetch to keep it in loading state
    mockFetch.mockImplementation(() => new Promise(() => {}));

    renderProtectedRoute();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders children when authenticated', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', name: 'User', role: 'user' }),
    });

    renderProtectedRoute();

    expect(await screen.findByText('Protected Content')).toBeInTheDocument();
  });

  it('redirects to login when not authenticated', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    renderProtectedRoute();

    expect(await screen.findByText('Login Page')).toBeInTheDocument();
  });

  it('redirects to home when requireAdmin but user is not admin', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', name: 'User', role: 'user' }),
    });

    renderProtectedRoute({ requireAdmin: true });

    expect(await screen.findByText('Home Page')).toBeInTheDocument();
  });

  it('renders children when requireAdmin and user is admin', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', name: 'Admin', role: 'admin' }),
    });

    renderProtectedRoute({ requireAdmin: true });

    expect(await screen.findByText('Protected Content')).toBeInTheDocument();
  });
});
