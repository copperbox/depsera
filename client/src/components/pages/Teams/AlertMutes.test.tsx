import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AlertMutes from './AlertMutes';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockMutes = {
  mutes: [
    {
      id: 'mute-1',
      team_id: 't1',
      dependency_id: 'dep-1',
      canonical_name: null,
      service_id: null,
      reason: 'Maintenance',
      created_by: 'user-1',
      created_by_name: 'Test User',
      dependency_name: 'postgres-primary',
      service_name: 'Service One',
      expires_at: null,
      created_at: '2026-01-01T00:00:00Z',
    },
    {
      id: 'mute-2',
      team_id: 't1',
      dependency_id: null,
      canonical_name: 'redis',
      service_id: null,
      reason: null,
      created_by: 'user-1',
      created_by_name: 'Test User',
      dependency_name: undefined,
      service_name: undefined,
      expires_at: '2027-12-31T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
    },
  ],
  total: 2,
  limit: 50,
  offset: 0,
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('AlertMutes', () => {
  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    render(<AlertMutes teamId="t1" canManage={true} />);

    expect(screen.getByText('Loading mutes...')).toBeInTheDocument();
  });

  it('shows empty state when no mutes', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ mutes: [], total: 0, limit: 50, offset: 0 }));

    render(<AlertMutes teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('No active alert mutes for this team.')).toBeInTheDocument();
    });
  });

  it('shows Alert Mutes heading', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ mutes: [], total: 0, limit: 50, offset: 0 }));

    render(<AlertMutes teamId="t1" canManage={true} />);

    expect(screen.getByText('Alert Mutes')).toBeInTheDocument();
  });

  it('shows Add Mute button for managers', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ mutes: [], total: 0, limit: 50, offset: 0 }));

    render(<AlertMutes teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Add Mute')).toBeInTheDocument();
    });
  });

  it('does not show Add Mute button for non-managers', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ mutes: [], total: 0, limit: 50, offset: 0 }));

    render(<AlertMutes teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('No active alert mutes for this team.')).toBeInTheDocument();
    });

    expect(screen.queryByText('Add Mute')).not.toBeInTheDocument();
  });

  it('displays mute list with correct data', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockMutes));

    render(<AlertMutes teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('Instance')).toBeInTheDocument();
    });

    expect(screen.getByText('Canonical')).toBeInTheDocument();
    expect(screen.getByText('postgres-primary')).toBeInTheDocument();
    expect(screen.getByText('redis')).toBeInTheDocument();
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
  });

  it('shows delete button for managers in mute list', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockMutes));

    render(<AlertMutes teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getAllByText('Delete')).toHaveLength(2);
    });
  });

  it('does not show delete button for non-managers', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockMutes));

    render(<AlertMutes teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('Instance')).toBeInTheDocument();
    });

    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('shows confirm/cancel on delete click', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockMutes));

    render(<AlertMutes teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getAllByText('Delete')).toHaveLength(2);
    });

    fireEvent.click(screen.getAllByText('Delete')[0]);

    expect(screen.getByText('Confirm')).toBeInTheDocument();
    // Check there's a Cancel button in the row
    expect(screen.getAllByText('Cancel')).toHaveLength(1);
  });

  it('opens mute form when Add Mute clicked', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ mutes: [], total: 0, limit: 50, offset: 0 }));

    render(<AlertMutes teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Add Mute')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Mute'));

    expect(screen.getByText('Scope')).toBeInTheDocument();
    expect(screen.getByText('Dependency ID')).toBeInTheDocument();
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('Reason (optional)')).toBeInTheDocument();
    expect(screen.getByText('Create Mute')).toBeInTheDocument();
  });

  it('shows canonical name input when scope changes', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ mutes: [], total: 0, limit: 50, offset: 0 }));

    render(<AlertMutes teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Add Mute')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Mute'));

    // Change scope to canonical
    fireEvent.change(screen.getByDisplayValue('Specific dependency'), {
      target: { value: 'canonical' },
    });

    expect(screen.getByText('Canonical Name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. redis, postgresql')).toBeInTheDocument();
  });

  it('disables Create Mute button when form is empty', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ mutes: [], total: 0, limit: 50, offset: 0 }));

    render(<AlertMutes teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Add Mute')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Mute'));

    expect(screen.getByText('Create Mute')).toBeDisabled();
  });

  it('enables Create Mute button when dependency ID is entered', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ mutes: [], total: 0, limit: 50, offset: 0 }));

    render(<AlertMutes teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Add Mute')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Mute'));

    fireEvent.change(screen.getByPlaceholderText('Dependency UUID'), {
      target: { value: 'dep-1' },
    });

    expect(screen.getByText('Create Mute')).not.toBeDisabled();
  });

  it('closes form on Cancel', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ mutes: [], total: 0, limit: 50, offset: 0 }));

    render(<AlertMutes teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Add Mute')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Mute'));
    expect(screen.getByText('Create Mute')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Create Mute')).not.toBeInTheDocument();
  });

  it('shows Never for mutes without expiry', async () => {
    const mutesWithNoExpiry = {
      mutes: [{ ...mockMutes.mutes[0], expires_at: null }],
      total: 1,
      limit: 50,
      offset: 0,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(mutesWithNoExpiry));

    render(<AlertMutes teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('Never')).toBeInTheDocument();
    });
  });

  it('shows service name in parentheses for instance mutes', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockMutes));

    render(<AlertMutes teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('(Service One)')).toBeInTheDocument();
    });
  });

  it('shows dash for mutes without reason', async () => {
    const mutesNoReason = {
      mutes: [{ ...mockMutes.mutes[1] }],
      total: 1,
      limit: 50,
      offset: 0,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(mutesNoReason));

    render(<AlertMutes teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('-')).toBeInTheDocument();
    });
  });

  it('displays service mute correctly in table', async () => {
    const serviceMutes = {
      mutes: [
        {
          id: 'mute-svc',
          team_id: 't1',
          dependency_id: null,
          canonical_name: null,
          service_id: 'svc-1',
          reason: 'Flaky endpoint',
          created_by: 'user-1',
          created_by_name: 'Test User',
          dependency_name: undefined,
          service_name: 'Payment Service',
          expires_at: null,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(serviceMutes));

    render(<AlertMutes teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('Service')).toBeInTheDocument();
    });
    expect(screen.getByText('Payment Service')).toBeInTheDocument();
    expect(screen.getByText('Flaky endpoint')).toBeInTheDocument();
  });

  it('shows service ID input when service scope is selected', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ mutes: [], total: 0, limit: 50, offset: 0 }));

    render(<AlertMutes teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Add Mute')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Mute'));

    // Change scope to service
    fireEvent.change(screen.getByDisplayValue('Specific dependency'), {
      target: { value: 'service' },
    });

    expect(screen.getByText('Service ID')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Service UUID')).toBeInTheDocument();
  });
});
