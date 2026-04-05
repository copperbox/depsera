import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ApiKeyUsageChart } from './ApiKeyUsageChart';

// Mock recharts to avoid jsdom SVG issues
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

const mockBuckets = [
  { bucket_start: '2026-04-04T10:00:00', push_count: 120, rejected_count: 0 },
  { bucket_start: '2026-04-04T10:01:00', push_count: 95, rejected_count: 5 },
  { bucket_start: '2026-04-04T10:02:00', push_count: 110, rejected_count: 0 },
];

const defaultUsageResponse = {
  api_key_id: 'k1',
  granularity: 'minute' as const,
  from: '2026-04-03T10:00:00Z',
  to: '2026-04-04T10:00:00Z',
  buckets: mockBuckets,
};

const emptyUsageResponse = {
  api_key_id: 'k1',
  granularity: 'minute' as const,
  from: '2026-04-03T10:00:00Z',
  to: '2026-04-04T10:00:00Z',
  buckets: [],
};

beforeEach(() => {
  mockFetch.mockReset();
  localStorage.clear();
});

describe('ApiKeyUsageChart', () => {
  it('renders loading state initially', () => {
    // Return a never-resolving promise to keep loading state
    mockFetch.mockReturnValue(new Promise(() => {}));

    render(
      <ApiKeyUsageChart
        teamId="t1"
        apiKeyId="k1"
        keyName="Prod Key"
        keyPrefix="dps_abc123"
      />
    );

    expect(screen.getByText('Loading usage data...')).toBeInTheDocument();
  });

  it('renders chart content when data is returned', async () => {
    mockFetch.mockResolvedValue(jsonResponse(defaultUsageResponse));

    render(
      <ApiKeyUsageChart
        teamId="t1"
        apiKeyId="k1"
        keyName="Prod Key"
        keyPrefix="dps_abc123"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    expect(screen.queryByText('Loading usage data...')).not.toBeInTheDocument();
    expect(screen.queryByText('No push data for this period.')).not.toBeInTheDocument();
  });

  it('renders empty state when buckets is empty', async () => {
    mockFetch.mockResolvedValue(jsonResponse(emptyUsageResponse));

    render(
      <ApiKeyUsageChart
        teamId="t1"
        apiKeyId="k1"
        keyName="Prod Key"
        keyPrefix="dps_abc123"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('No push data for this period.')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('responsive-container')).not.toBeInTheDocument();
  });

  it('renders error state when fetch fails', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Server error' }, 500));

    render(
      <ApiKeyUsageChart
        teamId="t1"
        apiKeyId="k1"
        keyName="Prod Key"
        keyPrefix="dps_abc123"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('renders title with key name and prefix', async () => {
    mockFetch.mockResolvedValue(jsonResponse(defaultUsageResponse));

    render(
      <ApiKeyUsageChart
        teamId="t1"
        apiKeyId="k1"
        keyName="Prod Key"
        keyPrefix="dps_abc123"
      />
    );

    expect(screen.getByText('Prod Key (dps_abc123) — Usage')).toBeInTheDocument();
  });

  it('renders title with prefix only when keyName is empty', async () => {
    mockFetch.mockResolvedValue(jsonResponse(defaultUsageResponse));

    render(
      <ApiKeyUsageChart
        teamId="t1"
        apiKeyId="k1"
        keyName=""
        keyPrefix="dps_abc123"
      />
    );

    expect(screen.getByText('dps_abc123 — Usage')).toBeInTheDocument();
  });

  it('uses team endpoint when teamId is provided and isAdmin is false', async () => {
    mockFetch.mockResolvedValue(jsonResponse(defaultUsageResponse));

    render(
      <ApiKeyUsageChart
        teamId="t1"
        apiKeyId="k1"
        keyName="Prod Key"
        keyPrefix="dps_abc123"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/teams/t1/api-keys/k1/usage?'),
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('uses admin endpoint when isAdmin is true', async () => {
    mockFetch.mockResolvedValue(jsonResponse(defaultUsageResponse));

    render(
      <ApiKeyUsageChart
        apiKeyId="k1"
        keyName="Prod Key"
        keyPrefix="dps_abc123"
        isAdmin
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/api-keys/k1/usage?'),
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('uses admin endpoint when teamId is not provided', async () => {
    mockFetch.mockResolvedValue(jsonResponse(defaultUsageResponse));

    render(
      <ApiKeyUsageChart
        apiKeyId="k1"
        keyName="Prod Key"
        keyPrefix="dps_abc123"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/api-keys/k1/usage?'),
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('default range uses granularity=minute', async () => {
    mockFetch.mockResolvedValue(jsonResponse(defaultUsageResponse));

    render(
      <ApiKeyUsageChart
        teamId="t1"
        apiKeyId="k1"
        keyName="Prod Key"
        keyPrefix="dps_abc123"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    // Default range is 24h which uses minute granularity
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('granularity=minute'),
      expect.anything()
    );
  });

  it('switching to 7d range uses granularity=hour', async () => {
    mockFetch.mockResolvedValue(jsonResponse(defaultUsageResponse));

    render(
      <ApiKeyUsageChart
        teamId="t1"
        apiKeyId="k1"
        keyName="Prod Key"
        keyPrefix="dps_abc123"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    mockFetch.mockClear();
    mockFetch.mockResolvedValue(jsonResponse(defaultUsageResponse));

    // Click the 7d range button
    fireEvent.click(screen.getByText('7d'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('granularity=hour'),
        expect.anything()
      );
    });
  });

  it('switching to 30d range uses granularity=hour', async () => {
    mockFetch.mockResolvedValue(jsonResponse(defaultUsageResponse));

    render(
      <ApiKeyUsageChart
        teamId="t1"
        apiKeyId="k1"
        keyName="Prod Key"
        keyPrefix="dps_abc123"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    mockFetch.mockClear();
    mockFetch.mockResolvedValue(jsonResponse(defaultUsageResponse));

    fireEvent.click(screen.getByText('30d'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('granularity=hour'),
        expect.anything()
      );
    });
  });

  it('switching to 1h range uses granularity=minute', async () => {
    mockFetch.mockResolvedValue(jsonResponse(defaultUsageResponse));

    render(
      <ApiKeyUsageChart
        teamId="t1"
        apiKeyId="k1"
        keyName="Prod Key"
        keyPrefix="dps_abc123"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    mockFetch.mockClear();
    mockFetch.mockResolvedValue(jsonResponse(defaultUsageResponse));

    fireEvent.click(screen.getByText('1h'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('granularity=minute'),
        expect.anything()
      );
    });
  });

  it('switching time range triggers a new fetch', async () => {
    mockFetch.mockResolvedValue(jsonResponse(defaultUsageResponse));

    render(
      <ApiKeyUsageChart
        teamId="t1"
        apiKeyId="k1"
        keyName="Prod Key"
        keyPrefix="dps_abc123"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    const initialCallCount = mockFetch.mock.calls.length;
    mockFetch.mockResolvedValue(jsonResponse(defaultUsageResponse));

    fireEvent.click(screen.getByText('6h'));

    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  it('retry button re-fetches data after error', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'Timeout' }, 500));

    render(
      <ApiKeyUsageChart
        teamId="t1"
        apiKeyId="k1"
        keyName="Prod Key"
        keyPrefix="dps_abc123"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Timeout')).toBeInTheDocument();
    });

    mockFetch.mockResolvedValueOnce(jsonResponse(defaultUsageResponse));
    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    expect(screen.queryByText('Timeout')).not.toBeInTheDocument();
  });

  it('renders all time range buttons', async () => {
    mockFetch.mockResolvedValue(jsonResponse(defaultUsageResponse));

    render(
      <ApiKeyUsageChart
        teamId="t1"
        apiKeyId="k1"
        keyName="Prod Key"
        keyPrefix="dps_abc123"
      />
    );

    expect(screen.getByText('1h')).toBeInTheDocument();
    expect(screen.getByText('6h')).toBeInTheDocument();
    expect(screen.getByText('24h')).toBeInTheDocument();
    expect(screen.getByText('7d')).toBeInTheDocument();
    expect(screen.getByText('30d')).toBeInTheDocument();
  });
});
