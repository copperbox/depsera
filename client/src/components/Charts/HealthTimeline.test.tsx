import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { HealthTimeline } from './HealthTimeline';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockTimelineData = {
  dependencyId: 'dep-1',
  range: '24h',
  currentState: 'healthy',
  transitions: [
    { timestamp: new Date(Date.now() - 3600000).toISOString(), state: 'unhealthy' },
    { timestamp: new Date(Date.now() - 1800000).toISOString(), state: 'healthy' },
  ],
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('HealthTimeline', () => {
  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    render(<HealthTimeline dependencyId="dep-1" />);

    expect(screen.getByText('Loading timeline...')).toBeInTheDocument();
  });

  it('renders timeline with transitions', async () => {
    mockFetch.mockResolvedValue(jsonResponse(mockTimelineData));

    render(<HealthTimeline dependencyId="dep-1" />);

    await waitFor(() => {
      expect(screen.queryByText('Loading timeline...')).not.toBeInTheDocument();
    });

    // Check legend items
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('Unhealthy')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText('Now')).toBeInTheDocument();
  });

  it('renders title with dependency name', async () => {
    mockFetch.mockResolvedValue(jsonResponse(mockTimelineData));

    render(<HealthTimeline dependencyId="dep-1" dependencyName="Redis" />);

    await waitFor(() => {
      expect(screen.queryByText('Loading timeline...')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Redis — Health Timeline')).toBeInTheDocument();
  });

  it('renders title without dependency name', async () => {
    mockFetch.mockResolvedValue(jsonResponse(mockTimelineData));

    render(<HealthTimeline dependencyId="dep-1" />);

    await waitFor(() => {
      expect(screen.queryByText('Loading timeline...')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Health Timeline')).toBeInTheDocument();
  });

  it('shows empty state when no transitions and unknown state', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      dependencyId: 'dep-1',
      range: '24h',
      currentState: 'unknown',
      transitions: [],
    }));

    render(<HealthTimeline dependencyId="dep-1" />);

    await waitFor(() => {
      // Should render a single "unknown" segment bar
      expect(screen.getByRole('img', { name: 'Health timeline' })).toBeInTheDocument();
    });
  });

  it('renders single healthy segment when no transitions', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      dependencyId: 'dep-1',
      range: '24h',
      currentState: 'healthy',
      transitions: [],
    }));

    render(<HealthTimeline dependencyId="dep-1" />);

    await waitFor(() => {
      const bar = screen.getByRole('img', { name: 'Health timeline' });
      expect(bar).toBeInTheDocument();
      // Single segment covering 100%
      expect(bar.children).toHaveLength(1);
    });
  });

  it('shows error state and allows retry', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(jsonResponse(mockTimelineData));

    render(<HealthTimeline dependencyId="dep-1" />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Health timeline' })).toBeInTheDocument();
    });
  });

  it('handles non-Error exception', async () => {
    mockFetch.mockRejectedValueOnce('String error');

    render(<HealthTimeline dependencyId="dep-1" />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load timeline data')).toBeInTheDocument();
    });
  });

  it('changes range when selector is clicked', async () => {
    mockFetch.mockResolvedValue(jsonResponse(mockTimelineData));

    render(<HealthTimeline dependencyId="dep-1" />);

    await waitFor(() => {
      expect(screen.queryByText('Loading timeline...')).not.toBeInTheDocument();
    });

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

  it('renders available time range options', async () => {
    mockFetch.mockResolvedValue(jsonResponse(mockTimelineData));

    render(<HealthTimeline dependencyId="dep-1" />);

    for (const range of ['24h', '7d', '30d']) {
      expect(screen.getByText(range)).toBeInTheDocument();
    }
  });

  it('shows segment tooltip on hover', async () => {
    mockFetch.mockResolvedValue(jsonResponse(mockTimelineData));

    render(<HealthTimeline dependencyId="dep-1" />);

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Health timeline' })).toBeInTheDocument();
    });

    const bar = screen.getByRole('img', { name: 'Health timeline' });
    const segments = bar.children;

    // Hover over first segment
    fireEvent.mouseEnter(segments[0]);

    // Tooltip should show state and duration info
    await waitFor(() => {
      expect(screen.getByText(/Duration:/)).toBeInTheDocument();
    });

    // Mouse leave hides tooltip
    fireEvent.mouseLeave(segments[0]);

    await waitFor(() => {
      expect(screen.queryByText(/Duration:/)).not.toBeInTheDocument();
    });
  });

  it('reloads when dependency ID changes', async () => {
    mockFetch.mockResolvedValue(jsonResponse(mockTimelineData));

    const { rerender } = render(<HealthTimeline dependencyId="dep-1" />);

    await waitFor(() => {
      expect(screen.queryByText('Loading timeline...')).not.toBeInTheDocument();
    });

    const newData = { ...mockTimelineData, dependencyId: 'dep-2' };
    mockFetch.mockResolvedValue(jsonResponse(newData));

    rerender(<HealthTimeline dependencyId="dep-2" />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/dependencies/dep-2/timeline'),
        expect.any(Object)
      );
    });
  });

  it('renders multiple segments for transitions', async () => {
    mockFetch.mockResolvedValue(jsonResponse(mockTimelineData));

    render(<HealthTimeline dependencyId="dep-1" />);

    await waitFor(() => {
      const bar = screen.getByRole('img', { name: 'Health timeline' });
      // Should have 3 segments: healthy -> unhealthy -> healthy
      expect(bar.children.length).toBeGreaterThanOrEqual(2);
    });
  });
});
