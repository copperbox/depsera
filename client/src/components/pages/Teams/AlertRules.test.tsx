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
  use_custom_thresholds: 0,
  cooldown_minutes: null,
  rate_limit_per_hour: null,
  alert_delay_minutes: null,
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

  it('shows override checkbox unchecked by default', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockRule]));

    render(<AlertRules teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Override global defaults')).toBeInTheDocument();
    });

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
  });

  it('disables threshold inputs when override unchecked', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockRule]));

    render(<AlertRules teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Override global defaults')).toBeInTheDocument();
    });

    const cooldownInput = screen.getByPlaceholderText('0-1440');
    const rateLimitInput = screen.getByPlaceholderText('1-1000');

    expect(cooldownInput).toBeDisabled();
    expect(rateLimitInput).toBeDisabled();
  });

  it('enables threshold inputs when override checked', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockRule]));

    render(<AlertRules teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Override global defaults')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox'));

    const cooldownInput = screen.getByPlaceholderText('0-1440');
    const rateLimitInput = screen.getByPlaceholderText('1-1000');

    expect(cooldownInput).not.toBeDisabled();
    expect(rateLimitInput).not.toBeDisabled();
  });

  it('populates threshold inputs from existing rule', async () => {
    const ruleWithThresholds = {
      ...mockRule,
      use_custom_thresholds: 1,
      cooldown_minutes: 10,
      rate_limit_per_hour: 50,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse([ruleWithThresholds]));

    render(<AlertRules teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByRole('checkbox')).toBeChecked();
    });

    expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    expect(screen.getByDisplayValue('50')).toBeInTheDocument();
  });

  it('enables save when override checkbox changes', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockRule]));

    render(<AlertRules teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Save Rules')).toBeDisabled();
    });

    fireEvent.click(screen.getByRole('checkbox'));

    expect(screen.getByText('Save Rules')).not.toBeDisabled();
  });

  it('shows custom threshold values in read-only view when active', async () => {
    const ruleWithThresholds = {
      ...mockRule,
      use_custom_thresholds: 1,
      cooldown_minutes: 15,
      rate_limit_per_hour: 60,
    };
    mockFetch.mockResolvedValueOnce(jsonResponse([ruleWithThresholds]));

    render(<AlertRules teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('15 min')).toBeInTheDocument();
    });
    expect(screen.getByText('60')).toBeInTheDocument();
  });

  it('does not show threshold values in read-only when override is off', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockRule]));

    render(<AlertRules teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('Warning and above')).toBeInTheDocument();
    });

    expect(screen.queryByText('Cooldown:')).not.toBeInTheDocument();
    expect(screen.queryByText('Max/hour:')).not.toBeInTheDocument();
  });

  // ── Alert Delay Tests ──────────────────────────────────────

  it('shows alert delay input for managers', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockRule]));

    render(<AlertRules teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Alert delay (minutes)')).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText('1-60')).toBeInTheDocument();
  });

  it('populates alert delay input from existing rule', async () => {
    const ruleWithDelay = { ...mockRule, alert_delay_minutes: 10 };
    mockFetch.mockResolvedValueOnce(jsonResponse([ruleWithDelay]));

    render(<AlertRules teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    });
  });

  it('enables save when alert delay changes', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockRule]));

    render(<AlertRules teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Save Rules')).toBeDisabled();
    });

    fireEvent.change(screen.getByPlaceholderText('1-60'), {
      target: { value: '5' },
    });

    expect(screen.getByText('Save Rules')).not.toBeDisabled();
  });

  it('disables alert delay input when alerting is inactive', async () => {
    const inactiveRule = { ...mockRule, is_active: 0 };
    mockFetch.mockResolvedValueOnce(jsonResponse([inactiveRule]));

    render(<AlertRules teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('1-60')).toBeDisabled();
    });
  });

  it('shows alert delay in read-only view when set', async () => {
    const ruleWithDelay = { ...mockRule, alert_delay_minutes: 15 };
    mockFetch.mockResolvedValueOnce(jsonResponse([ruleWithDelay]));

    render(<AlertRules teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('Alert after:')).toBeInTheDocument();
    });
    expect(screen.getByText('15 min')).toBeInTheDocument();
  });

  it('does not show alert delay in read-only view when not set', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockRule]));

    render(<AlertRules teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('Warning and above')).toBeInTheDocument();
    });

    expect(screen.queryByText('Alert after:')).not.toBeInTheDocument();
  });

  it('shows helper text for alert delay', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockRule]));

    render(<AlertRules teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText(/continuously unhealthy/)).toBeInTheDocument();
    });
  });
});
