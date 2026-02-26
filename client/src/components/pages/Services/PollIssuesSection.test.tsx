import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PollIssuesSection from './PollIssuesSection';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockPollHistory = {
  serviceId: 'svc-1',
  errorCount: 2,
  pollWarnings: [],
  entries: [
    {
      error: 'Connection timeout',
      recordedAt: '2024-01-15T10:00:00Z',
      isRecovery: false,
    },
    {
      error: null,
      recordedAt: '2024-01-15T10:05:00Z',
      isRecovery: true,
    },
  ],
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('PollIssuesSection', () => {
  it('shows loading state initially when expanded', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    render(<PollIssuesSection serviceId="svc-1" />);

    // Expand the section to see loading state
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('Loading poll history...')).toBeInTheDocument();
  });

  it('shows collapsed state with badge', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockPollHistory));

    render(<PollIssuesSection serviceId="svc-1" />);

    await waitFor(() => {
      expect(screen.getByText('2 issues')).toBeInTheDocument();
    });

    expect(screen.getByText('Poll Issues')).toBeInTheDocument();
    // Content should not be visible while collapsed
    expect(screen.queryByText('Connection timeout')).not.toBeInTheDocument();
  });

  it('shows "No issues" badge when errorCount is 0', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      serviceId: 'svc-1',
      errorCount: 0,
      pollWarnings: [],
      entries: [],
    }));

    render(<PollIssuesSection serviceId="svc-1" />);

    await waitFor(() => {
      expect(screen.getByText('No issues')).toBeInTheDocument();
    });
  });

  it('shows error count badge when there are issues', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockPollHistory));

    render(<PollIssuesSection serviceId="svc-1" />);

    await waitFor(() => {
      expect(screen.getByText('2 issues')).toBeInTheDocument();
    });
  });

  it('shows singular "issue" for errorCount of 1', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      serviceId: 'svc-1',
      errorCount: 1,
      pollWarnings: [],
      entries: [
        { error: 'Timeout', recordedAt: '2024-01-15T10:00:00Z', isRecovery: false },
      ],
    }));

    render(<PollIssuesSection serviceId="svc-1" />);

    await waitFor(() => {
      expect(screen.getByText('1 issue')).toBeInTheDocument();
    });
  });

  it('expanding shows timeline entries', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockPollHistory));

    render(<PollIssuesSection serviceId="svc-1" />);

    await waitFor(() => {
      expect(screen.getByText('2 issues')).toBeInTheDocument();
    });

    // Expand
    fireEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByText('Connection timeout')).toBeInTheDocument();
    expect(screen.getByText('Recovered')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('shows empty state when expanded with no entries', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({
      serviceId: 'svc-1',
      errorCount: 0,
      pollWarnings: [],
      entries: [],
    }));

    render(<PollIssuesSection serviceId="svc-1" />);

    await waitFor(() => {
      expect(screen.getByText('No issues')).toBeInTheDocument();
    });

    // Expand
    fireEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByText('No poll issues recorded')).toBeInTheDocument();
  });

  it('shows error state with retry button', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(jsonResponse(mockPollHistory));

    render(<PollIssuesSection serviceId="svc-1" />);

    // Expand to see error state
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();

    // Click retry
    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Connection timeout')).toBeInTheDocument();
    });
  });

  it('error entries show error message', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockPollHistory));

    render(<PollIssuesSection serviceId="svc-1" />);

    await waitFor(() => {
      expect(screen.getByText('2 issues')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByText('Connection timeout')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('recovery entries show "Recovered" status', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockPollHistory));

    render(<PollIssuesSection serviceId="svc-1" />);

    await waitFor(() => {
      expect(screen.getByText('2 issues')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });

  it('handles non-Error exception', async () => {
    mockFetch.mockRejectedValueOnce('String error');

    render(<PollIssuesSection serviceId="svc-1" />);

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('Failed to load poll history')).toBeInTheDocument();
    });
  });

  it('does not show badge while loading', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    render(<PollIssuesSection serviceId="svc-1" />);

    expect(screen.queryByText('No issues')).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+ issue/)).not.toBeInTheDocument();
  });

  it('does not show badge on error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fail'));

    render(<PollIssuesSection serviceId="svc-1" />);

    await waitFor(() => {
      expect(screen.queryByText('Loading poll history...')).not.toBeInTheDocument();
    });

    expect(screen.queryByText('No issues')).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+ issue/)).not.toBeInTheDocument();
  });
});
