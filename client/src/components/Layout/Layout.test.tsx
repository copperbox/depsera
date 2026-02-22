import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Layout from './Layout';
import { AuthProvider } from './../../contexts/AuthContext';
import { ThemeProvider } from './../../contexts/ThemeContext';

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock window.location
const mockLocation = {
  href: '',
  pathname: '/',
};
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

function renderLayout(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<div>Dashboard Content</div>} />
              <Route path="/services" element={<div>Services Content</div>} />
              <Route path="/teams" element={<div>Teams Content</div>} />
              <Route path="/admin/users" element={<div>Admin Content</div>} />
            </Route>
            <Route path="/login" element={<div>Login Page</div>} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe('Layout', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    localStorage.clear();
    mockLocation.href = '';
    document.documentElement.removeAttribute('data-theme');
    // Mock matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  it('renders header with app title', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', name: 'Test User', role: 'user' }),
    });

    renderLayout();

    expect(await screen.findByText('Depsera')).toBeInTheDocument();
  });

  it('displays user name and role', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', name: 'Test User', role: 'admin' }),
    });

    renderLayout();

    expect(await screen.findByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
  });

  it('toggles theme when theme button is clicked', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', name: 'Test User', role: 'user' }),
    });

    renderLayout();

    await screen.findByText('Test User');

    const themeButton = screen.getByLabelText('Switch to dark theme');
    fireEvent.click(themeButton);

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByLabelText('Switch to light theme')).toBeInTheDocument();
  });

  it('toggles mobile sidebar', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', name: 'Test User', role: 'user' }),
    });

    renderLayout();

    await screen.findByText('Test User');

    const menuButton = screen.getByLabelText('Toggle navigation');
    fireEvent.click(menuButton);

    // Sidebar should have open class
    const sidebar = document.querySelector('[class*="sidebar"]');
    expect(sidebar?.className).toContain('sidebarOpen');
  });

  it('closes sidebar when clicking overlay', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', name: 'Test User', role: 'user' }),
    });

    renderLayout();

    await screen.findByText('Test User');

    // Open sidebar
    fireEvent.click(screen.getByLabelText('Toggle navigation'));

    // Click overlay
    const overlay = document.querySelector('[class*="overlay"]');
    if (overlay) {
      fireEvent.click(overlay);
    }

    // Sidebar should be closed
    const sidebar = document.querySelector('[class*="sidebar"]');
    expect(sidebar?.className).not.toContain('sidebarOpen');
  });

  it('toggles sidebar collapse state', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', name: 'Test User', role: 'user' }),
    });

    renderLayout();

    await screen.findByText('Test User');

    const collapseButton = screen.getByLabelText('Collapse sidebar');
    fireEvent.click(collapseButton);

    expect(localStorage.getItem('sidebar-collapsed')).toBe('true');
    expect(screen.getByLabelText('Expand sidebar')).toBeInTheDocument();
  });

  it('restores sidebar collapsed state from localStorage', async () => {
    localStorage.setItem('sidebar-collapsed', 'true');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', name: 'Test User', role: 'user' }),
    });

    renderLayout();

    await screen.findByText('Test User');

    expect(screen.getByLabelText('Expand sidebar')).toBeInTheDocument();
  });

  it('renders navigation links', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', name: 'Test User', role: 'user' }),
    });

    renderLayout();

    await screen.findByText('Test User');

    expect(screen.getByTitle('Dashboard')).toBeInTheDocument();
    expect(screen.getByTitle('Services')).toBeInTheDocument();
    expect(screen.getByTitle('Teams')).toBeInTheDocument();
    expect(screen.getByTitle('Dependency Graph')).toBeInTheDocument();
    expect(screen.getByTitle('Associations')).toBeInTheDocument();
    expect(screen.getByTitle('Wallboard')).toBeInTheDocument();
  });

  it('shows admin link for admin users', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', name: 'Admin User', role: 'admin' }),
    });

    renderLayout();

    await screen.findByText('Admin User');

    expect(screen.getByTitle('Users')).toBeInTheDocument();
    expect(screen.getByTitle('Settings')).toBeInTheDocument();
  });

  it('hides admin link for non-admin users', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', name: 'Regular User', role: 'user' }),
    });

    renderLayout();

    await screen.findByText('Regular User');

    expect(screen.queryByTitle('Users')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Settings')).not.toBeInTheDocument();
  });

  it('closes sidebar when nav link is clicked', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', name: 'Test User', role: 'user' }),
    });

    renderLayout();

    await screen.findByText('Test User');

    // Open sidebar
    fireEvent.click(screen.getByLabelText('Toggle navigation'));

    // Click a nav link
    fireEvent.click(screen.getByTitle('Services'));

    // Sidebar should be closed
    const sidebar = document.querySelector('[class*="sidebar"]');
    expect(sidebar?.className).not.toContain('sidebarOpen');
  });

  it('renders outlet content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', name: 'Test User', role: 'user' }),
    });

    renderLayout();

    expect(await screen.findByText('Dashboard Content')).toBeInTheDocument();
  });

  it('renders footer with copyright', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: '1', name: 'Test User', role: 'user' }),
    });

    renderLayout();

    await screen.findByText('Test User');

    const year = new Date().getFullYear();
    expect(screen.getByText(`© ${year} Depsera`)).toBeInTheDocument();
  });

  it('handles logout', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '1', name: 'Test User', role: 'user' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ redirectUrl: '/login' }),
      });

    renderLayout();

    await screen.findByText('Test User');

    fireEvent.click(screen.getByText('Logout'));

    await waitFor(() => {
      expect(mockLocation.href).toBe('/login');
    });
  });
});
