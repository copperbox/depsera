import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AlertHistory from './AlertHistory';
import type { AlertChannel } from '../../../types/alert';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockChannels: AlertChannel[] = [
  {
    id: 'ch1',
    team_id: 't1',
    channel_type: 'slack',
    config: JSON.stringify({ webhook_url: 'https://hooks.slack.com/services/T00/B00/xxx' }),
    is_active: 1,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  },
  {
    id: 'ch2',
    team_id: 't1',
    channel_type: 'webhook',
    config: JSON.stringify({ url: 'https://example.com/webhook' }),
    is_active: 1,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  },
];

const mockEntry = {
  id: 'h1',
  alert_channel_id: 'ch1',
  service_id: 's1',
  dependency_id: 'd1',
  event_type: 'status_change',
  payload: JSON.stringify({ serviceName: 'Payment API', dependencyName: 'postgres-main' }),
  sent_at: '2024-01-15T10:30:00Z',
  status: 'sent',
};

const mockFailedEntry = {
  id: 'h2',
  alert_channel_id: 'ch2',
  service_id: 's1',
  dependency_id: null,
  event_type: 'poll_error',
  payload: JSON.stringify({ serviceName: 'Auth Service' }),
  sent_at: '2024-01-15T10:25:00Z',
  status: 'failed',
};

const mockSuppressedEntry = {
  id: 'h3',
  alert_channel_id: 'ch1',
  service_id: 's1',
  dependency_id: 'd1',
  event_type: 'status_change',
  payload: JSON.stringify({ serviceName: 'User API', dependencyName: 'redis-cache' }),
  sent_at: '2024-01-15T10:20:00Z',
  status: 'suppressed',
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('AlertHistory', () => {
  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    render(<AlertHistory teamId="t1" channels={mockChannels} />);

    expect(screen.getByText('Loading alert history...')).toBeInTheDocument();
  });

  it('shows empty state when no history', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ entries: [], limit: 50, offset: 0 }));

    render(<AlertHistory teamId="t1" channels={mockChannels} />);

    await waitFor(() => {
      expect(screen.getByText('No alert history yet.')).toBeInTheDocument();
    });
  });

  it('shows filtered empty state', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ entries: [], limit: 50, offset: 0 }));

    render(<AlertHistory teamId="t1" channels={mockChannels} />);

    await waitFor(() => {
      expect(screen.getByText('No alert history yet.')).toBeInTheDocument();
    });

    // Change filter to "failed"
    mockFetch.mockResolvedValueOnce(jsonResponse({ entries: [], limit: 50, offset: 0 }));
    fireEvent.change(screen.getByLabelText('Filter by status'), {
      target: { value: 'failed' },
    });

    await waitFor(() => {
      expect(screen.getByText('No failed alerts found.')).toBeInTheDocument();
    });
  });

  it('displays alert history entries', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ entries: [mockEntry], limit: 50, offset: 0 })
    );

    render(<AlertHistory teamId="t1" channels={mockChannels} />);

    await waitFor(() => {
      expect(screen.getByText('Payment API')).toBeInTheDocument();
    });

    expect(screen.getByText('postgres-main')).toBeInTheDocument();
    expect(screen.getByText('Status Change')).toBeInTheDocument();
    // 'Sent' appears in both the status filter dropdown and the status badge
    const sentElements = screen.getAllByText('Sent');
    expect(sentElements.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Slack')).toBeInTheDocument();
  });

  it('displays failed status badge', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ entries: [mockFailedEntry], limit: 50, offset: 0 })
    );

    render(<AlertHistory teamId="t1" channels={mockChannels} />);

    await waitFor(() => {
      expect(screen.getByText('Auth Service')).toBeInTheDocument();
    });

    // 'Failed' appears in both dropdown and badge
    const failedElements = screen.getAllByText('Failed');
    expect(failedElements.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Webhook')).toBeInTheDocument();
  });

  it('displays suppressed status badge', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ entries: [mockSuppressedEntry], limit: 50, offset: 0 })
    );

    render(<AlertHistory teamId="t1" channels={mockChannels} />);

    await waitFor(() => {
      expect(screen.getByText('Suppressed')).toBeInTheDocument();
    });
  });

  it('shows dash for missing dependency in payload', async () => {
    const entryNoPayload = { ...mockEntry, payload: null };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ entries: [entryNoPayload], limit: 50, offset: 0 })
    );

    render(<AlertHistory teamId="t1" channels={mockChannels} />);

    await waitFor(() => {
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows dash for channel type when channel not found', async () => {
    const entryUnknownChannel = { ...mockEntry, alert_channel_id: 'unknown' };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ entries: [entryUnknownChannel], limit: 50, offset: 0 })
    );

    render(<AlertHistory teamId="t1" channels={mockChannels} />);

    await waitFor(() => {
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows error when load fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(<AlertHistory teamId="t1" channels={mockChannels} />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('dismisses error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(<AlertHistory teamId="t1" channels={mockChannels} />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Dismiss error'));

    expect(screen.queryByText('Network error')).not.toBeInTheDocument();
  });

  it('has Alert History heading', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    render(<AlertHistory teamId="t1" channels={mockChannels} />);

    expect(screen.getByText('Alert History')).toBeInTheDocument();
  });

  it('has status filter dropdown', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    render(<AlertHistory teamId="t1" channels={mockChannels} />);

    expect(screen.getByLabelText('Filter by status')).toBeInTheDocument();
  });

  it('renders table headers', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ entries: [mockEntry], limit: 50, offset: 0 })
    );

    render(<AlertHistory teamId="t1" channels={mockChannels} />);

    await waitFor(() => {
      expect(screen.getByText('Time')).toBeInTheDocument();
    });

    expect(screen.getByText('Service')).toBeInTheDocument();
    expect(screen.getByText('Dependency')).toBeInTheDocument();
    expect(screen.getByText('Event')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Channel')).toBeInTheDocument();
  });

  it('handles malformed payload JSON gracefully', async () => {
    const badEntry = { ...mockEntry, payload: 'not-json' };
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ entries: [badEntry], limit: 50, offset: 0 })
    );

    render(<AlertHistory teamId="t1" channels={mockChannels} />);

    await waitFor(() => {
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays multiple entries', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        entries: [mockEntry, mockFailedEntry, mockSuppressedEntry],
        limit: 50,
        offset: 0,
      })
    );

    render(<AlertHistory teamId="t1" channels={mockChannels} />);

    await waitFor(() => {
      expect(screen.getByText('Payment API')).toBeInTheDocument();
    });

    expect(screen.getByText('Auth Service')).toBeInTheDocument();
    expect(screen.getByText('User API')).toBeInTheDocument();
  });
});
