import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { LatencyChart } from './LatencyChart';

// Mock recharts to avoid SVG rendering issues in jsdom
jest.mock('recharts', () => {
  const OriginalModule = jest.requireActual('recharts');
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockBucketsData = {
  dependencyId: 'dep-1',
  range: '24h',
  buckets: [
    { timestamp: '2024-01-15T10:00:00Z', min: 8, avg: 15.3, max: 42, count: 12 },
    { timestamp: '2024-01-15T10:15:00Z', min: 10, avg: 20.7, max: 55, count: 15 },
  ],
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('LatencyChart', () => {
  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    render(<LatencyChart dependencyId="dep-1" />);

    expect(screen.getByText('Loading latency data...')).toBeInTheDocument();
  });

  it('renders chart with data', async () => {
    mockFetch.mockResolvedValue(jsonResponse(mockBucketsData));

    render(<LatencyChart dependencyId="dep-1" />);

    await waitFor(() => {
      expect(screen.queryByText('Loading latency data...')).not.toBeInTheDocument();
    });

    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });

  it('renders title with dependency name', async () => {
    mockFetch.mockResolvedValue(jsonResponse(mockBucketsData));

    render(<LatencyChart dependencyId="dep-1" dependencyName="PostgreSQL" />);

    await waitFor(() => {
      expect(screen.queryByText('Loading latency data...')).not.toBeInTheDocument();
    });

    expect(screen.getByText('PostgreSQL — Latency')).toBeInTheDocument();
  });

  it('renders title without dependency name', async () => {
    mockFetch.mockResolvedValue(jsonResponse(mockBucketsData));

    render(<LatencyChart dependencyId="dep-1" />);

    await waitFor(() => {
      expect(screen.queryByText('Loading latency data...')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Latency')).toBeInTheDocument();
  });

  it('shows empty state when no buckets', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      dependencyId: 'dep-1',
      range: '24h',
      buckets: [],
    }));

    render(<LatencyChart dependencyId="dep-1" />);

    await waitFor(() => {
      expect(screen.getByText('No latency data available for this time range.')).toBeInTheDocument();
    });
  });

  it('shows error state and allows retry', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(jsonResponse(mockBucketsData));

    render(<LatencyChart dependencyId="dep-1" />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });
  });

  it('handles non-Error exception', async () => {
    mockFetch.mockRejectedValueOnce('String error');

    render(<LatencyChart dependencyId="dep-1" />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load latency data')).toBeInTheDocument();
    });
  });

  it('changes range when selector is clicked', async () => {
    mockFetch.mockResolvedValue(jsonResponse(mockBucketsData));

    render(<LatencyChart dependencyId="dep-1" />);

    await waitFor(() => {
      expect(screen.queryByText('Loading latency data...')).not.toBeInTheDocument();
    });

    // The initial call was for the default range
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('range=24h'),
      expect.any(Object)
    );

    fireEvent.click(screen.getByText('7d'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('range=7d'),
        expect.any(Object)
      );
    });
  });

  it('renders all time range options', async () => {
    mockFetch.mockResolvedValue(jsonResponse(mockBucketsData));

    render(<LatencyChart dependencyId="dep-1" />);

    for (const range of ['1h', '6h', '24h', '7d', '30d']) {
      expect(screen.getByText(range)).toBeInTheDocument();
    }
  });

  it('reloads when dependency ID changes', async () => {
    mockFetch.mockResolvedValue(jsonResponse(mockBucketsData));

    const { rerender } = render(<LatencyChart dependencyId="dep-1" />);

    await waitFor(() => {
      expect(screen.queryByText('Loading latency data...')).not.toBeInTheDocument();
    });

    const newData = { ...mockBucketsData, dependencyId: 'dep-2' };
    mockFetch.mockResolvedValue(jsonResponse(newData));

    rerender(<LatencyChart dependencyId="dep-2" />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/latency/dep-2/buckets'),
        expect.any(Object)
      );
    });
  });
});
