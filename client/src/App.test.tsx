import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import App from './App';

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

const renderApp = () => {
  render(
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('App', () => {
  it('redirects unauthenticated users to login', async () => {
    // /api/auth/me returns 401, then /api/auth/mode returns oidc
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ mode: 'oidc' }) });

    renderApp();
    expect(await screen.findByText('Sign in to continue')).toBeInTheDocument();
  });

  it('shows the dashboard title on login page', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ mode: 'oidc' }) });

    renderApp();
    expect(await screen.findByRole('heading', { name: 'Depsera' })).toBeInTheDocument();
  });
});
