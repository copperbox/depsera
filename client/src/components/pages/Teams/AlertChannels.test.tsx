import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AlertChannels from './AlertChannels';

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock HTMLDialogElement for ConfirmDialog/Modal
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = jest.fn();
  HTMLDialogElement.prototype.close = jest.fn();
});

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockSlackChannel = {
  id: 'ch1',
  team_id: 't1',
  channel_type: 'slack',
  config: JSON.stringify({ webhook_url: 'https://hooks.slack.com/services/T00/B00/xxx' }),
  is_active: 1,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

const mockWebhookChannel = {
  id: 'ch2',
  team_id: 't1',
  channel_type: 'webhook',
  config: JSON.stringify({ url: 'https://example.com/webhook', method: 'POST', headers: { Authorization: 'Bearer token' } }),
  is_active: 0,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('AlertChannels', () => {
  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    render(<AlertChannels teamId="t1" canManage={true} />);

    expect(screen.getByText('Loading channels...')).toBeInTheDocument();
  });

  it('shows empty state when no channels configured', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('No alert channels configured.')).toBeInTheDocument();
    });
  });

  it('shows helper text for managers in empty state', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText(/Add a channel to receive alerts/)).toBeInTheDocument();
    });
  });

  it('hides helper text for non-managers in empty state', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    render(<AlertChannels teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('No alert channels configured.')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Add a channel to receive alerts/)).not.toBeInTheDocument();
  });

  it('displays channel list with Slack channel', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockSlackChannel]));

    render(<AlertChannels teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('Slack')).toBeInTheDocument();
    });

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('1 channel')).toBeInTheDocument();
  });

  it('displays channel list with webhook channel', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockWebhookChannel]));

    render(<AlertChannels teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('Webhook')).toBeInTheDocument();
    });

    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('displays multiple channels with correct count', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockSlackChannel, mockWebhookChannel]));

    render(<AlertChannels teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('2 channels')).toBeInTheDocument();
    });
  });

  it('shows management controls for managers', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockSlackChannel]));

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Slack')).toBeInTheDocument();
    });

    expect(screen.getByText('Test')).toBeInTheDocument();
    expect(screen.getByText('Disable')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('hides management controls for non-managers', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockSlackChannel]));

    render(<AlertChannels teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('Slack')).toBeInTheDocument();
    });

    expect(screen.queryByText('Add Channel')).not.toBeInTheDocument();
    expect(screen.queryByText('Test')).not.toBeInTheDocument();
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('shows Enable button for inactive channels', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockWebhookChannel]));

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Enable')).toBeInTheDocument();
    });
  });

  it('opens create form when Add Channel clicked', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Add Channel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Channel'));

    expect(screen.getByText('Add Alert Channel')).toBeInTheDocument();
    expect(screen.getByText('Channel Type')).toBeInTheDocument();
  });

  it('shows Slack webhook URL field by default', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Add Channel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Channel'));

    expect(screen.getByText('Slack Webhook URL')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://hooks.slack.com/services/T00/B00/xxx')).toBeInTheDocument();
  });

  it('switches to webhook fields when type changed', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Add Channel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Channel'));

    // Change channel type to webhook
    fireEvent.change(screen.getByDisplayValue('Slack'), {
      target: { value: 'webhook' },
    });

    expect(screen.getByText('Webhook URL')).toBeInTheDocument();
    expect(screen.getByText('HTTP Method')).toBeInTheDocument();
    expect(screen.getByText('Custom Headers')).toBeInTheDocument();
  });

  it('validates Slack webhook URL format', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Add Channel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Channel'));

    // Enter invalid URL
    fireEvent.change(screen.getByPlaceholderText('https://hooks.slack.com/services/T00/B00/xxx'), {
      target: { value: 'https://example.com/not-slack' },
    });

    fireEvent.click(screen.getByText('Create Channel'));

    expect(screen.getByText('Must be a valid Slack webhook URL (https://hooks.slack.com/services/...)')).toBeInTheDocument();
  });

  it('validates empty webhook URL', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Add Channel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Channel'));
    fireEvent.click(screen.getByText('Create Channel'));

    expect(screen.getByText('Webhook URL is required')).toBeInTheDocument();
  });

  it('validates webhook URL format', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Add Channel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Channel'));

    // Switch to webhook
    fireEvent.change(screen.getByDisplayValue('Slack'), {
      target: { value: 'webhook' },
    });

    // Enter invalid URL
    fireEvent.change(screen.getByPlaceholderText('https://example.com/webhook'), {
      target: { value: 'not-a-url' },
    });

    // Use fireEvent.submit to bypass browser <input type="url"> validation
    fireEvent.submit(screen.getByText('Create Channel').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Must be a valid URL')).toBeInTheDocument();
    });
  });

  it('creates Slack channel successfully', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([]))  // initial load
      .mockResolvedValueOnce(jsonResponse(mockSlackChannel))  // create
      .mockResolvedValueOnce(jsonResponse([mockSlackChannel]));  // reload

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Add Channel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Channel'));

    fireEvent.change(screen.getByPlaceholderText('https://hooks.slack.com/services/T00/B00/xxx'), {
      target: { value: 'https://hooks.slack.com/services/T00/B00/xxx' },
    });

    fireEvent.click(screen.getByText('Create Channel'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/teams/t1/alert-channels',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            channel_type: 'slack',
            config: { webhook_url: 'https://hooks.slack.com/services/T00/B00/xxx' },
          }),
        })
      );
    });
  });

  it('creates webhook channel with custom headers', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([]))  // initial load
      .mockResolvedValueOnce(jsonResponse(mockWebhookChannel))  // create
      .mockResolvedValueOnce(jsonResponse([mockWebhookChannel]));  // reload

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Add Channel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Channel'));

    // Switch to webhook
    fireEvent.change(screen.getByDisplayValue('Slack'), {
      target: { value: 'webhook' },
    });

    fireEvent.change(screen.getByPlaceholderText('https://example.com/webhook'), {
      target: { value: 'https://example.com/webhook' },
    });

    // Add a header
    fireEvent.click(screen.getByText('+ Add Header'));

    fireEvent.change(screen.getByPlaceholderText('Header name'), {
      target: { value: 'Authorization' },
    });

    fireEvent.change(screen.getByPlaceholderText('Header value'), {
      target: { value: 'Bearer token' },
    });

    fireEvent.click(screen.getByText('Create Channel'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/teams/t1/alert-channels',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            channel_type: 'webhook',
            config: {
              url: 'https://example.com/webhook',
              method: 'POST',
              headers: { Authorization: 'Bearer token' },
            },
          }),
        })
      );
    });
  });

  it('opens edit form with pre-filled values for Slack channel', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockSlackChannel]));

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Edit'));

    expect(screen.getByText('Edit Channel')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://hooks.slack.com/services/T00/B00/xxx')).toBeInTheDocument();
  });

  it('opens edit form with pre-filled values for webhook channel', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockWebhookChannel]));

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Edit'));

    expect(screen.getByText('Edit Channel')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://example.com/webhook')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Authorization')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Bearer token')).toBeInTheDocument();
  });

  it('sends update request when editing', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([mockSlackChannel]))  // initial load
      .mockResolvedValueOnce(jsonResponse(mockSlackChannel))    // update
      .mockResolvedValueOnce(jsonResponse([mockSlackChannel])); // reload

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Edit'));

    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/teams/t1/alert-channels/ch1',
        expect.objectContaining({
          method: 'PUT',
        })
      );
    });
  });

  it('cancels form and returns to list', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Add Channel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Channel'));

    expect(screen.getByText('Add Alert Channel')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.queryByText('Add Alert Channel')).not.toBeInTheDocument();
  });

  it('toggles channel active state', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([mockSlackChannel]))  // initial load
      .mockResolvedValueOnce(jsonResponse({ ...mockSlackChannel, is_active: 0 }))  // update
      .mockResolvedValueOnce(jsonResponse([{ ...mockSlackChannel, is_active: 0 }]));  // reload

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Disable')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Disable'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/teams/t1/alert-channels/ch1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ is_active: false }),
        })
      );
    });
  });

  it('shows delete confirmation dialog', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([mockSlackChannel]));

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete'));

    expect(screen.getByText('Delete Alert Channel')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete this alert channel/)).toBeInTheDocument();
  });

  it('deletes channel after confirmation', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([mockSlackChannel]))  // initial load
      .mockResolvedValueOnce({ ok: true, status: 204, json: () => Promise.resolve({}) })  // delete
      .mockResolvedValueOnce(jsonResponse([]));  // reload

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete'));

    // Confirm deletion
    const confirmButton = screen.getAllByText('Delete').find(
      (el) => el.closest('[class*="confirmButton"]') || el.closest('[class*="destructive"]')
    );
    if (confirmButton) {
      fireEvent.click(confirmButton);
    }

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/teams/t1/alert-channels/ch1',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  it('sends test alert and shows success', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([mockSlackChannel]))  // initial load
      .mockResolvedValueOnce(jsonResponse({ success: true, error: null }));  // test

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Test'));

    await waitFor(() => {
      expect(screen.getByText('Test alert sent successfully!')).toBeInTheDocument();
    });
  });

  it('sends test alert and shows failure', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([mockSlackChannel]))  // initial load
      .mockResolvedValueOnce(jsonResponse({ success: false, error: 'Connection refused' }));  // test

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Test'));

    await waitFor(() => {
      expect(screen.getByText('Test failed: Connection refused')).toBeInTheDocument();
    });
  });

  it('shows error when channel load fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('shows error when create fails', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([]))  // initial load
      .mockRejectedValueOnce(new Error('Validation failed'));  // create

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Add Channel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Channel'));

    fireEvent.change(screen.getByPlaceholderText('https://hooks.slack.com/services/T00/B00/xxx'), {
      target: { value: 'https://hooks.slack.com/services/T00/B00/valid' },
    });

    fireEvent.click(screen.getByText('Create Channel'));

    await waitFor(() => {
      expect(screen.getByText('Validation failed')).toBeInTheDocument();
    });
  });

  it('truncates long URLs in channel list', async () => {
    const longUrlChannel = {
      ...mockSlackChannel,
      config: JSON.stringify({ webhook_url: 'https://hooks.slack.com/services/T00000000/B00000000/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' }),
    };
    mockFetch.mockResolvedValueOnce(jsonResponse([longUrlChannel]));

    render(<AlertChannels teamId="t1" canManage={false} />);

    await waitFor(() => {
      expect(screen.getByText('Slack')).toBeInTheDocument();
    });

    // URL should be truncated
    const urlElement = screen.getByText(/hooks\.slack\.com/);
    expect(urlElement.textContent!.length).toBeLessThanOrEqual(50);
  });

  it('adds and removes custom headers', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]));

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Add Channel')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Channel'));

    // Switch to webhook
    fireEvent.change(screen.getByDisplayValue('Slack'), {
      target: { value: 'webhook' },
    });

    // Add header
    fireEvent.click(screen.getByText('+ Add Header'));

    expect(screen.getByPlaceholderText('Header name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Header value')).toBeInTheDocument();

    // Remove header
    fireEvent.click(screen.getByLabelText('Remove header'));

    expect(screen.queryByPlaceholderText('Header name')).not.toBeInTheDocument();
  });

  it('dismisses test result when dismiss clicked', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([mockSlackChannel]))
      .mockResolvedValueOnce(jsonResponse({ success: true, error: null }));

    render(<AlertChannels teamId="t1" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Test'));

    await waitFor(() => {
      expect(screen.getByText('Test alert sent successfully!')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Dismiss test result'));

    expect(screen.queryByText('Test alert sent successfully!')).not.toBeInTheDocument();
  });
});
