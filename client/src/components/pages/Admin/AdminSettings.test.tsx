import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminSettings from './AdminSettings';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockSettingsResponse = {
  settings: {
    data_retention_days: { value: 365, source: 'default' },
    retention_cleanup_time: { value: '02:00', source: 'default' },
    default_poll_interval_ms: { value: 30000, source: 'default' },
    ssrf_allowlist: { value: 'localhost,*.internal', source: 'database' },
    global_rate_limit: { value: 100, source: 'default' },
    global_rate_limit_window_minutes: { value: 15, source: 'default' },
    auth_rate_limit: { value: 10, source: 'default' },
    auth_rate_limit_window_minutes: { value: 1, source: 'default' },
    alert_cooldown_minutes: { value: 5, source: 'default' },
    alert_rate_limit_per_hour: { value: 30, source: 'default' },
  },
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('AdminSettings', () => {
  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    render(<AdminSettings />);

    expect(screen.getByText('Loading settings...')).toBeInTheDocument();
  });

  it('displays settings form after loading', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockSettingsResponse));

    render(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    expect(screen.getByText('Data Retention')).toBeInTheDocument();
    expect(screen.getByText('Polling Defaults')).toBeInTheDocument();
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('Alerts')).toBeInTheDocument();
  });

  it('displays error state and allows retry', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(jsonResponse(mockSettingsResponse));

    render(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
  });

  it('handles non-Error exception on load', async () => {
    mockFetch.mockRejectedValueOnce('String error');

    render(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load settings')).toBeInTheDocument();
    });
  });

  it('loads form values from settings response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockSettingsResponse));

    render(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    const retentionInput = screen.getByLabelText('Retention period (days)') as HTMLInputElement;
    expect(retentionInput.value).toBe('365');

    const pollInput = screen.getByLabelText('Default poll interval (ms)') as HTMLInputElement;
    expect(pollInput.value).toBe('30000');

    const rateInputs = screen.getAllByLabelText(/Max requests per window/i);
    expect((rateInputs[0] as HTMLInputElement).value).toBe('100');
    expect((rateInputs[1] as HTMLInputElement).value).toBe('10');
  });

  it('converts comma-separated ssrf_allowlist to newline-separated', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockSettingsResponse));

    render(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    const ssrfTextarea = screen.getByLabelText('SSRF allowlist') as HTMLTextAreaElement;
    expect(ssrfTextarea.value).toBe('localhost\n*.internal');
  });

  it('collapses and expands sections', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockSettingsResponse));

    render(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    // All sections start expanded - check a field is visible
    expect(screen.getByLabelText('Retention period (days)')).toBeInTheDocument();

    // Collapse Data Retention section
    fireEvent.click(screen.getByText('Data Retention'));

    // Field should be hidden
    expect(screen.queryByLabelText('Retention period (days)')).not.toBeInTheDocument();

    // Expand it again
    fireEvent.click(screen.getByText('Data Retention'));

    expect(screen.getByLabelText('Retention period (days)')).toBeInTheDocument();
  });

  it('validates form before saving - invalid retention days', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockSettingsResponse));

    render(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    // Set invalid retention days
    fireEvent.change(screen.getByLabelText('Retention period (days)'), {
      target: { value: '0' },
    });

    fireEvent.click(screen.getByText('Save Settings'));

    expect(screen.getByText('Retention period must be between 1 and 3650')).toBeInTheDocument();
    // Should not have made a PUT request
    expect(mockFetch).toHaveBeenCalledTimes(1); // Only the initial GET
  });

  it('validates form before saving - invalid poll interval', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockSettingsResponse));

    render(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Default poll interval (ms)'), {
      target: { value: '1000' },
    });

    fireEvent.click(screen.getByText('Save Settings'));

    expect(screen.getByText('Poll interval must be between 5000 and 3600000')).toBeInTheDocument();
  });

  it('validates form before saving - invalid time format', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockSettingsResponse));

    render(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Daily cleanup time'), {
      target: { value: 'invalid' },
    });

    fireEvent.click(screen.getByText('Save Settings'));

    expect(screen.getByText('Must be in HH:MM format')).toBeInTheDocument();
  });

  it('validates invalid time values', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockSettingsResponse));

    render(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    // jsdom normalizes out-of-range time values to "" for type="time" inputs,
    // so setting "25:00" results in an empty value that fails the HH:MM regex check
    fireEvent.change(screen.getByLabelText('Daily cleanup time'), {
      target: { value: '25:00' },
    });

    fireEvent.click(screen.getByText('Save Settings'));

    expect(screen.getByText('Must be in HH:MM format')).toBeInTheDocument();
  });

  it('saves settings successfully', async () => {
    const updatedSettings = {
      settings: {
        ...mockSettingsResponse.settings,
        data_retention_days: { value: 90, source: 'database' as const },
      },
      updated: 10,
    };

    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockSettingsResponse))
      .mockResolvedValueOnce(jsonResponse(updatedSettings));

    render(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    // Change retention days
    fireEvent.change(screen.getByLabelText('Retention period (days)'), {
      target: { value: '90' },
    });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(screen.getByText(/Settings saved successfully/)).toBeInTheDocument();
    });

    // Verify the PUT request was made
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const putCall = mockFetch.mock.calls[1];
    expect(putCall[0]).toBe('/api/admin/settings');
    expect(putCall[1].method).toBe('PUT');
    expect(putCall[1].headers).toEqual({
      'Content-Type': 'application/json',
      'X-CSRF-Token': 'test-csrf-token',
    });
  });

  it('converts newline-separated ssrf allowlist to comma-separated on save', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockSettingsResponse))
      .mockResolvedValueOnce(jsonResponse({ ...mockSettingsResponse, updated: 10 }));

    render(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    // Change SSRF allowlist
    fireEvent.change(screen.getByLabelText('SSRF allowlist'), {
      target: { value: 'localhost\n*.internal\n10.0.0.0/8' },
    });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    const putCall = mockFetch.mock.calls[1];
    const body = JSON.parse(putCall[1].body);
    expect(body.ssrf_allowlist).toBe('localhost,*.internal,10.0.0.0/8');
  });

  it('shows save error and allows dismissal', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockSettingsResponse))
      .mockRejectedValueOnce(new Error('Save failed'));

    render(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(screen.getByText('Save failed')).toBeInTheDocument();
    });

    // Dismiss the error
    fireEvent.click(screen.getByText('Dismiss'));
    expect(screen.queryByText('Save failed')).not.toBeInTheDocument();
  });

  it('handles non-Error exception on save', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockSettingsResponse))
      .mockRejectedValueOnce('String error');

    render(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(screen.getByText('Failed to save settings')).toBeInTheDocument();
    });
  });

  it('dismisses success banner', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockSettingsResponse))
      .mockResolvedValueOnce(jsonResponse({ ...mockSettingsResponse, updated: 10 }));

    render(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(screen.getByText(/Settings saved successfully/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Dismiss'));
    expect(screen.queryByText(/Settings saved successfully/)).not.toBeInTheDocument();
  });

  it('clears validation error when field value changes', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockSettingsResponse));

    render(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    // Set invalid value to trigger error
    fireEvent.change(screen.getByLabelText('Retention period (days)'), {
      target: { value: '0' },
    });

    fireEvent.click(screen.getByText('Save Settings'));

    expect(screen.getByText('Retention period must be between 1 and 3650')).toBeInTheDocument();

    // Fix the value - error should clear
    fireEvent.change(screen.getByLabelText('Retention period (days)'), {
      target: { value: '90' },
    });

    expect(screen.queryByText('Retention period must be between 1 and 3650')).not.toBeInTheDocument();
  });

  it('clears success/error feedback when editing', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockSettingsResponse))
      .mockResolvedValueOnce(jsonResponse({ ...mockSettingsResponse, updated: 10 }));

    render(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      expect(screen.getByText(/Settings saved successfully/)).toBeInTheDocument();
    });

    // Edit a field - success message should clear
    fireEvent.change(screen.getByLabelText('Retention period (days)'), {
      target: { value: '90' },
    });

    expect(screen.queryByText(/Settings saved successfully/)).not.toBeInTheDocument();
  });

  it('disables save button while saving', async () => {
    let resolveSave: (value: unknown) => void;
    const savePromise = new Promise((resolve) => {
      resolveSave = resolve;
    });

    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockSettingsResponse))
      .mockReturnValueOnce(savePromise);

    render(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save Settings'));

    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(screen.getByText('Saving...')).toBeDisabled();

    // Resolve the save
    resolveSave!(jsonResponse({ ...mockSettingsResponse, updated: 10 }));

    await waitFor(() => {
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });
  });

  it('handles empty ssrf allowlist', async () => {
    const emptyAllowlist = {
      settings: {
        ...mockSettingsResponse.settings,
        ssrf_allowlist: { value: '', source: 'default' as const },
      },
    };

    mockFetch.mockResolvedValueOnce(jsonResponse(emptyAllowlist));

    render(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    const ssrfTextarea = screen.getByLabelText('SSRF allowlist') as HTMLTextAreaElement;
    expect(ssrfTextarea.value).toBe('');
  });

  it('validates alert settings', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockSettingsResponse));

    render(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Alert cooldown (minutes)'), {
      target: { value: '-1' },
    });

    fireEvent.change(screen.getByLabelText('Max alerts per hour'), {
      target: { value: '0' },
    });

    fireEvent.click(screen.getByText('Save Settings'));

    expect(screen.getByText('Alert cooldown must be between 0 and 1440')).toBeInTheDocument();
    expect(screen.getByText('Alert rate limit must be between 1 and 1000')).toBeInTheDocument();
  });

  it('validates rate limit fields', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockSettingsResponse));

    render(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    // Set invalid global rate limit window
    const windowInputs = screen.getAllByLabelText('Window (minutes)');
    fireEvent.change(windowInputs[0], { target: { value: '0' } });
    fireEvent.change(windowInputs[1], { target: { value: '1441' } });

    fireEvent.click(screen.getByText('Save Settings'));

    expect(screen.getByText('Global window must be between 1 and 1440')).toBeInTheDocument();
    expect(screen.getByText('Auth window must be between 1 and 1440')).toBeInTheDocument();
  });

  it('fetches settings from the correct endpoint', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockSettingsResponse));

    render(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/admin/settings', { credentials: 'include' });
  });
});
