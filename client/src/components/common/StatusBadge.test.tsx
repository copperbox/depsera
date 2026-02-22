import { render, screen } from '@testing-library/react';
import StatusBadge from './StatusBadge';

describe('StatusBadge', () => {
  it('renders healthy status with label', () => {
    render(<StatusBadge status="healthy" />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Healthy');
    expect(screen.getByText('Healthy')).toBeInTheDocument();
  });

  it('renders warning status with label', () => {
    render(<StatusBadge status="warning" />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Warning');
    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  it('renders critical status with label', () => {
    render(<StatusBadge status="critical" />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Critical');
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('renders unknown status with label', () => {
    render(<StatusBadge status="unknown" />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Unknown');
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('hides label when showLabel is false', () => {
    render(<StatusBadge status="healthy" showLabel={false} />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Healthy');
    expect(screen.queryByText('Healthy')).not.toBeInTheDocument();
  });

  it('applies small size class', () => {
    render(<StatusBadge status="healthy" size="small" />);

    const badge = screen.getByRole('status');
    expect(badge.className).toContain('small');
  });

  it('applies medium size class by default', () => {
    render(<StatusBadge status="healthy" />);

    const badge = screen.getByRole('status');
    expect(badge.className).toContain('medium');
  });
});
