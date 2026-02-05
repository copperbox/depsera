import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import NotFound from './NotFound';

describe('NotFound', () => {
  it('renders 404 page content', () => {
    render(
      <BrowserRouter>
        <NotFound />
      </BrowserRouter>
    );

    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Page Not Found')).toBeInTheDocument();
    expect(
      screen.getByText('The page you are looking for does not exist or has been moved.')
    ).toBeInTheDocument();
  });

  it('has a link to dashboard', () => {
    render(
      <BrowserRouter>
        <NotFound />
      </BrowserRouter>
    );

    const link = screen.getByRole('link', { name: 'Go to Dashboard' });
    expect(link).toHaveAttribute('href', '/');
  });
});
