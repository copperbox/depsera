import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AlertRules from './AlertRules';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockRule = {
  id: 'r1',
  team_id: 't1',
  severity_filter: 'warning',
  is_active: 1,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('AlertRules', () => {
  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    render(<AlertRules teamId="t1" canManage={true} />);

    expect(screen.getByText('Loading rules...')).toBeInTheDocument();
  });

  it('shows empty state for non-managers when no rules exist', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    render(<AlertRules teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('No alert rules configured for this team.')).toBeInTheDocument();
    });
  });

  it('shows form controls for managers', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    render(<AlertRules teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Severity Filter')).toBeInTheDocument();
    });

    expect(screen.getByText('Alerting')).toBeInTheDocument();
    expect(screen.getByText('Save Rules')).toBeInTheDocument();
  });

  it('populates form with existing rule data', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockRule]));

    render(<AlertRules teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Warning and above')).toBeInTheDocument();
    });

    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  it('shows read-only summary for non-managers with existing rule', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockRule]));

    render(<AlertRules teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('Warning and above')).toBeInTheDocument();
    });

    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.queryByText('Save Rules')).not.toBeInTheDocument();
  });

  it('shows Disabled badge for inactive rule in read-only view', async () => {
    const inactiveRule = { ...mockRule, is_active: 0 };
    mockFetch.mockResolvedValueOnce(jsonResponse([inactiveRule]));

    render(<AlertRules teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
  });

  it('save button is disabled when no changes made', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockRule]));

    render(<AlertRules teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Save Rules')).toBeInTheDocument();
    });

    expect(screen.getByText('Save Rules')).toBeDisabled();
  });

  it('enables save button when severity filter changes', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockRule]));

    render(<AlertRules teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Warning and above')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue('Warning and above'), {
      target: { value: 'critical' },
    });

    expect(screen.getByText('Save Rules')).not.toBeDisabled();
  });

  it('enables save button when toggle is clicked', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockRule]));

    render(<AlertRules teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Enabled')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('switch'));

    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(screen.getByText('Save Rules')).not.toBeDisabled();
  });

  it('saves rules and shows success message', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([mockRule])) // initial load
      .mockResolvedValueOnce(jsonResponse(mockRule))    // save
      .mockResolvedValueOnce(jsonResponse([mockRule])); // reload

    render(<AlertRules teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Warning and above')).toBeInTheDocument();
    });

    // Make a change
    fireEvent.change(screen.getByDisplayValue('Warning and above'), {
      target: { value: 'all' },
    });

    // Save
    fireEvent.click(screen.getByText('Save Rules'));

    await waitFor(() => {
      expect(screen.getByText('Alert rules saved successfully')).toBeInTheDocument();
    });
  });

  it('shows error when save fails', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([mockRule])) // initial load
      .mockResolvedValueOnce(jsonResponse({ error: 'Save failed' }, 500)); // save fail

    render(<AlertRules teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Warning and above')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue('Warning and above'), {
      target: { value: 'all' },
    });

    fireEvent.click(screen.getByText('Save Rules'));

    await waitFor(() => {
      expect(screen.getByText('Save failed')).toBeInTheDocument();
    });
  });

  it('dismisses error when dismiss button clicked', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Load failed'));

    render(<AlertRules teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Load failed')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Dismiss error'));

    expect(screen.queryByText('Load failed')).not.toBeInTheDocument();
  });

  it('shows Alert Rules heading', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    render(<AlertRules teamId="t1" canManage={true} />);

    expect(screen.getByText('Alert Rules')).toBeInTheDocument();
  });
});
