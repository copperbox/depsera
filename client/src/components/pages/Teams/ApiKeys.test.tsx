import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ApiKeys from './ApiKeys';

// Mock HTMLDialogElement for ConfirmDialog
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

const mockKeys = [
  {
    id: 'k1',
    team_id: 't1',
    name: 'Production Collector',
    key_prefix: 'dps_a1b2c3d4',
    last_used_at: '2026-03-14T10:00:00Z',
    created_at: '2026-03-01T10:00:00Z',
    created_by: 'u1',
  },
  {
    id: 'k2',
    team_id: 't1',
    name: 'Staging Collector',
    key_prefix: 'dps_e5f6g7h8',
    last_used_at: null,
    created_at: '2026-03-10T10:00:00Z',
    created_by: 'u1',
  },
];

beforeEach(() => {
  mockFetch.mockReset();
});

describe('ApiKeys', () => {
  it('renders key list with prefix and dates', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockKeys));

    render(<ApiKeys teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Production Collector')).toBeInTheDocument();
      expect(screen.getByText('Staging Collector')).toBeInTheDocument();
    });

    expect(screen.getByText('dps_a1b2c3d4...')).toBeInTheDocument();
    expect(screen.getByText('dps_e5f6g7h8...')).toBeInTheDocument();
    expect(screen.getByText('Never used')).toBeInTheDocument();
  });

  it('renders empty state correctly', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    render(<ApiKeys teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('No API keys yet.')).toBeInTheDocument();
    });

    expect(screen.getByText(/Create a key to start pushing OTLP metrics/)).toBeInTheDocument();
  });

  it('empty state does not show create hint for non-managers', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    render(<ApiKeys teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('No API keys yet.')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Create a key to start pushing OTLP metrics/)).not.toBeInTheDocument();
  });

  it('create shows raw key once with copy button', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockKeys)); // initial load
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 'k3',
        team_id: 't1',
        name: 'New Key',
        key_prefix: 'dps_newkey12',
        rawKey: 'dps_newkey1234567890abcdef1234567890abcdef',
        last_used_at: null,
        created_at: '2026-03-15T10:00:00Z',
        created_by: 'u1',
      }, 201)
    );
    mockFetch.mockResolvedValueOnce(jsonResponse([...mockKeys, { id: 'k3', team_id: 't1', name: 'New Key', key_prefix: 'dps_newkey12', last_used_at: null, created_at: '2026-03-15T10:00:00Z', created_by: 'u1' }])); // reload

    render(<ApiKeys teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Production Collector')).toBeInTheDocument();
    });

    // Click create button
    fireEvent.click(screen.getByText('Create Key'));

    // Fill name and generate
    fireEvent.change(screen.getByPlaceholderText(/Key name/), { target: { value: 'New Key' } });
    fireEvent.click(screen.getByText('Generate'));

    await waitFor(() => {
      expect(screen.getByText('API Key Created')).toBeInTheDocument();
    });

    expect(screen.getByText('dps_newkey1234567890abcdef1234567890abcdef')).toBeInTheDocument();
    expect(screen.getByText(/will not be shown again/)).toBeInTheDocument();
  });

  it('delete shows confirm dialog', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockKeys));

    render(<ApiKeys teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Production Collector')).toBeInTheDocument();
    });

    // Click delete button on first key
    const deleteButtons = screen.getAllByTitle('Revoke key');
    fireEvent.click(deleteButtons[0]);

    // Confirm dialog should appear
    expect(screen.getByText('Revoke API Key')).toBeInTheDocument();
    expect(screen.getByText(/Any collectors using it will no longer be able to push metrics/)).toBeInTheDocument();
  });

  it('non-manager cannot see Create Key button', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockKeys));

    render(<ApiKeys teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('Production Collector')).toBeInTheDocument();
    });

    expect(screen.queryByText('Create Key')).not.toBeInTheDocument();
  });

  it('non-manager cannot see delete buttons', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockKeys));

    render(<ApiKeys teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('Production Collector')).toBeInTheDocument();
    });

    expect(screen.queryByTitle('Revoke key')).not.toBeInTheDocument();
  });

  it('shows collector configuration help text', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    render(<ApiKeys teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Collector Configuration')).toBeInTheDocument();
    });

    expect(screen.getByText(/otlphttp/)).toBeInTheDocument();
    expect(screen.getByText(/Bearer dps_/)).toBeInTheDocument();
  });

  it('handles API error when loading keys', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401));

    render(<ApiKeys teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Unauthorized')).toBeInTheDocument();
    });
  });

  it('cancel button hides create form', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    render(<ApiKeys teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Create Key')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create Key'));
    expect(screen.getByPlaceholderText(/Key name/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText(/Key name/)).not.toBeInTheDocument();
  });

  it('generate button is disabled when name is empty', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    render(<ApiKeys teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Create Key')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create Key'));

    const generateButton = screen.getByText('Generate');
    expect(generateButton).toBeDisabled();
  });
});
