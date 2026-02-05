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
  description: 'Test description',
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
    expect(screen.getByLabelText(/Description/)).toHaveValue('');
    expect(screen.getByText('Create Team')).toBeInTheDocument();
  });

  it('renders edit form with populated fields', () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();

    render(<TeamForm team={mockTeam} onSuccess={onSuccess} onCancel={onCancel} />);

    expect(screen.getByLabelText(/Name/)).toHaveValue('Test Team');
    expect(screen.getByLabelText(/Description/)).toHaveValue('Test description');
    expect(screen.getByText('Save Changes')).toBeInTheDocument();
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
          body: JSON.stringify({ name: 'New Team' }),
        })
      );
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
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
            description: 'Test description',
          }),
        })
      );
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
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
          body: JSON.stringify({ name: 'Updated Team' }),
        })
      );
    });
  });
});
