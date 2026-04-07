import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OtlpStats from './OtlpStats';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = jest.fn();
  HTMLDialogElement.prototype.close = jest.fn();
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

const baseKey = {
  id: 'k1',
  name: 'Prod Key',
  key_prefix: 'dps_abc123',
  last_used_at: '2026-04-04T10:00:00Z',
  created_at: '2026-03-01T10:00:00Z',
  rate_limit_rpm: 150000,
  rate_limit_is_custom: false,
  rate_limit_admin_locked: false,
  usage_1h: 500,
  usage_24h: 8000,
  usage_7d: 50000,
  rejected_24h: 0,
  rejected_7d: 0,
};

function makeStatsResponse(keyOverrides = {}) {
  return {
    services: [
      {
        id: 's1',
        name: 'my-service',
        is_active: 1,
        last_push_success: 1,
        last_push_error: null,
        last_push_warnings: null,
        last_push_at: '2026-04-04T09:00:00Z',
        dependency_count: 3,
        errors_24h: 0,
        schema_config: null,
      },
    ],
    apiKeys: [{ ...baseKey, ...keyOverrides }],
    summary: {
      total_otlp_services: 1,
      active_services: 1,
      services_with_errors: 0,
      services_never_pushed: 0,
    },
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  localStorage.clear();
});

describe('OtlpStats', () => {
  // --- Warning badge tests (DPS-102d) ---

  it('renders warning badge when rejected_24h > 0', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeStatsResponse({ rejected_24h: 42 })));

    render(<OtlpStats teamId="t1" canManage />);

    await waitFor(() => {
      expect(screen.getByText('Approaching limit')).toBeInTheDocument();
    });
  });

  it('does not render warning badge when rejected_24h is 0', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeStatsResponse({ rejected_24h: 0, rejected_7d: 0 })));

    render(<OtlpStats teamId="t1" canManage />);

    await waitFor(() => {
      expect(screen.getByText('Prod Key')).toBeInTheDocument();
    });

    expect(screen.queryByText('Approaching limit')).not.toBeInTheDocument();
  });

  it('renders muted 7d rejection text when rejected_7d > 0 but rejected_24h is 0', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeStatsResponse({ rejected_24h: 0, rejected_7d: 15 })));

    render(<OtlpStats teamId="t1" canManage />);

    await waitFor(() => {
      expect(screen.getByText('15 rejected in 7d')).toBeInTheDocument();
    });

    expect(screen.queryByText('Approaching limit')).not.toBeInTheDocument();
  });

  it('renders rejected_24h count in usage summary', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeStatsResponse({ rejected_24h: 10 })));

    render(<OtlpStats teamId="t1" canManage />);

    await waitFor(() => {
      expect(screen.getByText('10 rejected in 24h')).toBeInTheDocument();
    });
  });

  // --- Rate limit display tests ---

  it('renders edit button for team lead on unlocked key', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeStatsResponse()));

    render(<OtlpStats teamId="t1" canManage />);

    await waitFor(() => {
      expect(screen.getByTitle('Edit rate limit')).toBeInTheDocument();
    });
  });

  it('does not render edit button when rate_limit_admin_locked is true', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeStatsResponse({ rate_limit_admin_locked: true })));

    render(<OtlpStats teamId="t1" canManage />);

    await waitFor(() => {
      expect(screen.getByText('Prod Key')).toBeInTheDocument();
    });

    expect(screen.queryByTitle('Edit rate limit')).not.toBeInTheDocument();
  });

  it('renders lock icon when rate_limit_admin_locked is true', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeStatsResponse({ rate_limit_admin_locked: true })));

    render(<OtlpStats teamId="t1" canManage />);

    await waitFor(() => {
      expect(screen.getByTitle('Locked by admin')).toBeInTheDocument();
    });
  });

  it('does not render edit button when canManage is false', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeStatsResponse()));

    render(<OtlpStats teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('Prod Key')).toBeInTheDocument();
    });

    expect(screen.queryByTitle('Edit rate limit')).not.toBeInTheDocument();
  });

  it('displays (default) suffix for non-custom rate limit', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeStatsResponse()));

    render(<OtlpStats teamId="t1" canManage />);

    await waitFor(() => {
      expect(screen.getByText('(default)')).toBeInTheDocument();
    });
  });

  it('displays (custom) suffix for custom rate limit', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeStatsResponse({
      rate_limit_rpm: 50000,
      rate_limit_is_custom: true,
    })));

    render(<OtlpStats teamId="t1" canManage />);

    await waitFor(() => {
      expect(screen.getByText('(custom)')).toBeInTheDocument();
    });
  });

  // --- Rate limit edit dialog tests (DPS-102b) ---

  it('opens rate limit dialog on pencil click', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeStatsResponse()));

    render(<OtlpStats teamId="t1" canManage />);

    await waitFor(() => {
      expect(screen.getByTitle('Edit rate limit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Edit rate limit'));

    expect(screen.getByText('Edit Rate Limit')).toBeInTheDocument();
    expect(screen.getByText(/Set the rate limit for/)).toBeInTheDocument();
  });

  it('Save button is disabled when input is non-integer', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeStatsResponse()));

    render(<OtlpStats teamId="t1" canManage />);

    await waitFor(() => {
      expect(screen.getByTitle('Edit rate limit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Edit rate limit'));

    const input = screen.getByPlaceholderText('150000');
    fireEvent.change(input, { target: { value: '-5' } });

    expect(screen.getByText('Save')).toBeDisabled();
  });

  it('Save button is enabled when input is empty (reset to default)', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeStatsResponse()));

    render(<OtlpStats teamId="t1" canManage />);

    await waitFor(() => {
      expect(screen.getByTitle('Edit rate limit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Edit rate limit'));

    // Empty input = reset to default, should be valid
    const input = screen.getByPlaceholderText('150000');
    fireEvent.change(input, { target: { value: '' } });

    expect(screen.getByText('Save')).not.toBeDisabled();
  });

  it('Reset to default calls updateApiKeyRateLimit with null', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(makeStatsResponse({
      rate_limit_rpm: 50000,
      rate_limit_is_custom: true,
    })));

    render(<OtlpStats teamId="t1" canManage />);

    await waitFor(() => {
      expect(screen.getByTitle('Edit rate limit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Edit rate limit'));

    // Mock the PATCH call and the stats reload
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    mockFetch.mockResolvedValueOnce(jsonResponse(makeStatsResponse()));

    fireEvent.click(screen.getByText('Reset to default'));

    await waitFor(() => {
      // Verify PATCH was called with null rate_limit_rpm
      const patchCall = mockFetch.mock.calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (c: any[]) => c[1]?.method === 'PATCH'
      );
      expect(patchCall).toBeDefined();
      expect(JSON.parse(patchCall![1].body)).toEqual({ rate_limit_rpm: null });
    });
  });

  it('Reset to default is disabled when key uses default rate limit', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeStatsResponse({
      rate_limit_is_custom: false,
    })));

    render(<OtlpStats teamId="t1" canManage />);

    await waitFor(() => {
      expect(screen.getByTitle('Edit rate limit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Edit rate limit'));

    expect(screen.getByText('Reset to default')).toBeDisabled();
  });

  it('saving a valid value calls updateApiKeyRateLimit with correct integer', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(makeStatsResponse()));

    render(<OtlpStats teamId="t1" canManage />);

    await waitFor(() => {
      expect(screen.getByTitle('Edit rate limit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Edit rate limit'));

    const input = screen.getByPlaceholderText('150000');
    fireEvent.change(input, { target: { value: '75000' } });

    // Mock the PATCH call and reload
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    mockFetch.mockResolvedValueOnce(jsonResponse(makeStatsResponse()));

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      const patchCall = mockFetch.mock.calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (c: any[]) => c[1]?.method === 'PATCH'
      );
      expect(patchCall).toBeDefined();
      expect(JSON.parse(patchCall![1].body)).toEqual({ rate_limit_rpm: 75000 });
    });
  });

  // --- Expand/collapse chart tests ---

  it('chart is not present before View usage button is clicked', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeStatsResponse()));

    render(<OtlpStats teamId="t1" canManage />);

    await waitFor(() => {
      expect(screen.getByText('Prod Key')).toBeInTheDocument();
    });

    // The chart title should not be in the DOM
    expect(screen.queryByText('Prod Key (dps_abc123) — Usage')).not.toBeInTheDocument();
  });

  it('View usage button mounts ApiKeyUsageChart on click', async () => {
    // Initial stats load
    mockFetch.mockResolvedValueOnce(jsonResponse(makeStatsResponse()));

    render(<OtlpStats teamId="t1" canManage />);

    await waitFor(() => {
      expect(screen.getByText('Prod Key')).toBeInTheDocument();
    });

    // Mock the chart's API call
    mockFetch.mockResolvedValue(jsonResponse({
      api_key_id: 'k1',
      granularity: 'minute',
      from: '2026-04-03T10:00:00Z',
      to: '2026-04-04T10:00:00Z',
      buckets: [],
    }));

    fireEvent.click(screen.getByTitle('View usage graph'));

    await waitFor(() => {
      expect(screen.getByText('Prod Key (dps_abc123) — Usage')).toBeInTheDocument();
    });
  });

  // --- Usage summary display ---

  it('renders usage summary row with push counts', async () => {
    mockFetch.mockResolvedValue(jsonResponse(makeStatsResponse()));

    render(<OtlpStats teamId="t1" canManage />);

    await waitFor(() => {
      expect(screen.getByText(/500 pushes in last hour/)).toBeInTheDocument();
      expect(screen.getByText(/8,000 in 24h/)).toBeInTheDocument();
      expect(screen.getByText(/50,000 in 7d/)).toBeInTheDocument();
    });
  });
});
