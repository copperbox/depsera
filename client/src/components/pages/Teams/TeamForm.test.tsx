import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TeamForm from './TeamForm';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

const mockTeam = {
  id: 't1',
  name: 'Test Team',
  key: 'test-team',
  description: 'Test description',
  contact: null,
  members: [],
  services: [],
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe('TeamForm', () => {
  it('renders create form with empty fields', () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm onSuccess={onSuccess} onCancel={onCancel} />);

    expect(screen.getByLabelText(/Name/)).toHaveValue('');
    expect(screen.getByLabelText(/Key/)).toHaveValue('');
    expect(screen.getByLabelText(/Description/)).toHaveValue('');
    expect(screen.getByText('Create Team')).toBeInTheDocument();
  });

  it('renders edit form with populated fields', () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm team={mockTeam} onSuccess={onSuccess} onCancel={onCancel} />);

    expect(screen.getByLabelText(/Name/)).toHaveValue('Test Team');
    expect(screen.getByLabelText(/Key/)).toHaveValue('test-team');
    expect(screen.getByLabelText(/Description/)).toHaveValue('Test description');
    expect(screen.getByText('Save Changes')).toBeInTheDocument();
  });

  it('renders key field with existing value in edit mode', () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm team={mockTeam} onSuccess={onSuccess} onCancel={onCancel} />);

    expect(screen.getByLabelText(/Key/)).toHaveValue('test-team');
  });

  it('auto-derives key from name in create mode', () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Platform Team' } });

    expect(screen.getByLabelText(/Key/)).toHaveValue('platform-team');
  });

  it('stops auto-deriving key after manual edit', () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Platform Team' } });
    expect(screen.getByLabelText(/Key/)).toHaveValue('platform-team');

    // Manually edit the key
    fireEvent.change(screen.getByLabelText(/Key/), { target: { value: 'custom-key' } });
    expect(screen.getByLabelText(/Key/)).toHaveValue('custom-key');

    // Changing name should no longer update key
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Another Team' } });
    expect(screen.getByLabelText(/Key/)).toHaveValue('custom-key');
  });

  it('validates required name field', async () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.click(screen.getByText('Create Team'));

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('validates whitespace-only name', async () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: '   ' } });
    fireEvent.click(screen.getByText('Create Team'));

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });
  });

  it('validates empty key', async () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Test' } });
    // Manually clear the key
    fireEvent.change(screen.getByLabelText(/Key/), { target: { value: '' } });
    fireEvent.click(screen.getByText('Create Team'));

    await waitFor(() => {
      expect(screen.getByText('Key is required')).toBeInTheDocument();
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('validates invalid key format', async () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText(/Key/), { target: { value: '-invalid' } });
    fireEvent.click(screen.getByText('Create Team'));

    await waitFor(() => {
      expect(screen.getByText(/Key must start with a letter or number/)).toBeInTheDocument();
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('creates team successfully', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 't2', name: 'New Team' }));

    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'New Team' } });

    fireEvent.click(screen.getByText('Create Team'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/teams',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'New Team', key: 'new-team' }),
        })
      );
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('creates team with user-entered key', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 't2', name: 'New Team' }));

    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'New Team' } });
    fireEvent.change(screen.getByLabelText(/Key/), { target: { value: 'my-custom-key' } });

    fireEvent.click(screen.getByText('Create Team'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/teams',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'New Team', key: 'my-custom-key' }),
        })
      );
    });
  });

  it('creates team with description', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 't2', name: 'New Team' }));

    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'New Team' } });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: 'Team description' } });

    fireEvent.click(screen.getByText('Create Team'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/teams',
        expect.objectContaining({
          body: JSON.stringify({
            name: 'New Team',
            key: 'new-team',
            description: 'Team description',
          }),
        })
      );
    });
  });

  it('updates team successfully', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ...mockTeam, name: 'Updated Team' }));

    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm team={mockTeam} onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Updated Team' } });

    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/teams/t1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            name: 'Updated Team',
            key: 'test-team',
            description: 'Test description',
          }),
        })
      );
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('includes key in update payload', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ...mockTeam, key: 'new-key' }));

    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm team={mockTeam} onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/Key/), { target: { value: 'new-key' } });

    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/teams/t1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            name: 'Test Team',
            key: 'new-key',
            description: 'Test description',
          }),
        })
      );
    });
  });

  it('handles submit error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Failed to create team'));

    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'New Team' } });
    fireEvent.click(screen.getByText('Create Team'));

    await waitFor(() => {
      expect(screen.getByText('Failed to create team')).toBeInTheDocument();
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('handles non-Error exception', async () => {
    mockFetch.mockRejectedValueOnce('String error');

    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'New Team' } });
    fireEvent.click(screen.getByText('Create Team'));

    await waitFor(() => {
      expect(screen.getByText('Failed to save team')).toBeInTheDocument();
    });
  });

  it('calls onCancel when cancel button clicked', () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.click(screen.getByText('Cancel'));

    expect(onCancel).toHaveBeenCalled();
  });

  it('disables form fields during submission', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'New Team' } });
    fireEvent.click(screen.getByText('Create Team'));

    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/Name/)).toBeDisabled();
    expect(screen.getByLabelText(/Key/)).toBeDisabled();
    expect(screen.getByLabelText(/Description/)).toBeDisabled();
    expect(screen.getByText('Cancel')).toBeDisabled();
  });

  it('clears submit error when starting new submission', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('First error'))
      .mockResolvedValueOnce(jsonResponse({ id: 't2', name: 'New Team' }));

    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'New Team' } });
    fireEvent.click(screen.getByText('Create Team'));

    await waitFor(() => {
      expect(screen.getByText('First error')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Create Team'));

    await waitFor(() => {
      expect(screen.queryByText('First error')).not.toBeInTheDocument();
    });
  });

  it('handles team with null description', () => {
    const teamWithNullDesc = { ...mockTeam, description: null };
    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm team={teamWithNullDesc} onSuccess={onSuccess} onCancel={onCancel} />);

    expect(screen.getByLabelText(/Description/)).toHaveValue('');
  });

  it('handles team with null key', () => {
    const teamWithNullKey = { ...mockTeam, key: null };
    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm team={teamWithNullKey} onSuccess={onSuccess} onCancel={onCancel} />);

    expect(screen.getByLabelText(/Key/)).toHaveValue('');
  });

  it('updates team without description', async () => {
    const teamWithNullDesc = { ...mockTeam, description: null };
    mockFetch.mockResolvedValueOnce(jsonResponse({ ...teamWithNullDesc, name: 'Updated Team' }));

    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm team={teamWithNullDesc} onSuccess={onSuccess} onCancel={onCancel} />);

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Updated Team' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/teams/t1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated Team', key: 'test-team' }),
        })
      );
    });
  });

  it('shows hint text for key field', () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm onSuccess={onSuccess} onCancel={onCancel} />);

    expect(screen.getByText(/Used in manifest references/)).toBeInTheDocument();
  });
});
