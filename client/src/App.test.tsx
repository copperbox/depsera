import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import App from './App';

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
  it('redirects unauthenticated users to login', () => {
    renderApp();
    expect(screen.getByText('Sign in to continue')).toBeInTheDocument();
  });

  it('shows the dashboard title on login page', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: 'Dependencies Dashboard' })).toBeInTheDocument();
  });
});
