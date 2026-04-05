import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OtlpAdmin from './OtlpAdmin';

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

const baseTeam = {
  team_id: 't1',
  team_name: 'Alpha Team',
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
  apiKeys: [baseKey],
};

function makeAdminStatsResponse(keyOverrides = {}) {
  return {
    teams: [{
      ...baseTeam,
      apiKeys: [{ ...baseKey, ...keyOverrides }],
    }],
    summary: {
      total_otlp_services: 1,
      active_services: 1,
      services_with_errors: 0,
      services_never_pushed: 0,
      total_teams: 1,
    },
  };
}

const emptyUsageResponse = {
  from: '2026-03-28T00:00:00Z',
  to: '2026-04-04T00:00:00Z',
  buckets: [],
};

beforeEach(() => {
  mockFetch.mockReset();
  localStorage.clear();
});

function renderAdminWithData(keyOverrides = {}) {
  // OtlpAdmin makes two parallel fetches: getAdminOtlpStats and getAdminOtlpUsage
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/api/admin/otlp-stats')) {
      return Promise.resolve(jsonResponse(makeAdminStatsResponse(keyOverrides)));
    }
    if (url.includes('/api/admin/otlp-usage')) {
      return Promise.resolve(jsonResponse(emptyUsageResponse));
    }
    return Promise.resolve(jsonResponse({}));
  });
  return render(<OtlpAdmin />);
}

describe('OtlpAdmin', () => {
  // --- Admin lock checkbox tests (DPS-102c) ---

  it('Lock checkbox is present in admin rate limit dialog', async () => {
    renderAdminWithData();

    await waitFor(() => {
      expect(screen.getByText('Prod Key')).toBeInTheDocument();
    });

    // Admin always has an edit button
    fireEvent.click(screen.getByTitle('Edit rate limit'));

    expect(screen.getByText('Edit Rate Limit (Admin)')).toBeInTheDocument();
    expect(screen.getByLabelText(/Lock — prevent team from changing this limit/)).toBeInTheDocument();
  });

  it('saving with lock checkbox checked sends admin_locked: true', async () => {
    renderAdminWithData();

    await waitFor(() => {
      expect(screen.getByText('Prod Key')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Edit rate limit'));

    // Check the lock checkbox
    const lockCheckbox = screen.getByLabelText(/Lock — prevent team from changing this limit/);
    fireEvent.click(lockCheckbox);

    // Lock note should appear
    expect(screen.getByText('Team members will see this limit but cannot change it.')).toBeInTheDocument();

    // Enter a value
    const input = screen.getByPlaceholderText('150000');
    fireEvent.change(input, { target: { value: '100000' } });

    // Mock the PATCH and reload
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'PATCH') {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      if (url.includes('/api/admin/otlp-stats')) {
        return Promise.resolve(jsonResponse(makeAdminStatsResponse()));
      }
      if (url.includes('/api/admin/otlp-usage')) {
        return Promise.resolve(jsonResponse(emptyUsageResponse));
      }
      return Promise.resolve(jsonResponse({}));
    });

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      const patchCall = mockFetch.mock.calls.find(
        (c: [string, RequestInit?]) => c[1]?.method === 'PATCH'
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse(patchCall![1]!.body as string);
      expect(body.admin_locked).toBe(true);
      expect(body.rate_limit_rpm).toBe(100000);
    });
  });

  it('saving with lock checkbox unchecked sends admin_locked: false', async () => {
    renderAdminWithData({ rate_limit_admin_locked: true });

    await waitFor(() => {
      expect(screen.getByText('Prod Key')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Edit rate limit'));

    // Uncheck the lock checkbox (it should be checked by default since key is locked)
    const lockCheckbox = screen.getByLabelText(/Lock — prevent team from changing this limit/) as HTMLInputElement;
    expect(lockCheckbox.checked).toBe(true);
    fireEvent.click(lockCheckbox);

    // Mock the PATCH and reload
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'PATCH') {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      if (url.includes('/api/admin/otlp-stats')) {
        return Promise.resolve(jsonResponse(makeAdminStatsResponse()));
      }
      if (url.includes('/api/admin/otlp-usage')) {
        return Promise.resolve(jsonResponse(emptyUsageResponse));
      }
      return Promise.resolve(jsonResponse({}));
    });

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      const patchCall = mockFetch.mock.calls.find(
        (c: [string, RequestInit?]) => c[1]?.method === 'PATCH'
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse(patchCall![1]!.body as string);
      expect(body.admin_locked).toBe(false);
    });
  });

  it('admin dialog allows input of 0 without validation error', async () => {
    renderAdminWithData();

    await waitFor(() => {
      expect(screen.getByText('Prod Key')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Edit rate limit'));

    const input = screen.getByPlaceholderText('150000');
    fireEvent.change(input, { target: { value: '0' } });

    // Save should be enabled (0 is valid for admin)
    expect(screen.getByText('Save')).not.toBeDisabled();
  });

  it('admin dialog shows description mentioning "Enter 0 for unlimited"', async () => {
    renderAdminWithData();

    await waitFor(() => {
      expect(screen.getByText('Prod Key')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('Edit rate limit'));

    expect(screen.getByText(/Enter 0 for unlimited/)).toBeInTheDocument();
  });

  // --- Admin locked key display (DPS-102c) ---

  it('locked key shows admin lock indicator', async () => {
    renderAdminWithData({ rate_limit_admin_locked: true });

    await waitFor(() => {
      expect(screen.getByText('Admin locked')).toBeInTheDocument();
    });

    expect(screen.getByTitle('Locked by admin')).toBeInTheDocument();
  });

  // --- Warning badge in admin view ---

  it('renders "Rate limited" badge when rejected_24h > 0', async () => {
    renderAdminWithData({ rejected_24h: 42 });

    await waitFor(() => {
      expect(screen.getByText('Rate limited')).toBeInTheDocument();
    });
  });

  it('renders muted 7d rejection text when rejected_7d > 0 but rejected_24h is 0', async () => {
    renderAdminWithData({ rejected_24h: 0, rejected_7d: 15 });

    await waitFor(() => {
      expect(screen.getByText('15 rejected in 7d')).toBeInTheDocument();
    });

    expect(screen.queryByText('Rate limited')).not.toBeInTheDocument();
  });

  it('does not render warning badge when no rejections', async () => {
    renderAdminWithData({ rejected_24h: 0, rejected_7d: 0 });

    await waitFor(() => {
      expect(screen.getByText('Prod Key')).toBeInTheDocument();
    });

    expect(screen.queryByText('Rate limited')).not.toBeInTheDocument();
    expect(screen.queryByText(/rejected in 7d/)).not.toBeInTheDocument();
  });

  // --- Admin edit button always shows ---

  it('admin always has edit button regardless of lock state', async () => {
    renderAdminWithData({ rate_limit_admin_locked: true });

    await waitFor(() => {
      expect(screen.getByTitle('Edit rate limit')).toBeInTheDocument();
    });
  });
});
