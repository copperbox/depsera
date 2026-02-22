import {
  fetchTeams,
  fetchTeam,
  createTeam,
  updateTeam,
  deleteTeam,
  addTeamMember,
  updateTeamMember,
  removeTeamMember,
  fetchUsers,
} from './teams';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('fetchTeams', () => {
  it('fetches all teams', async () => {
    const data = [{ id: '1', name: 'Team A' }];
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await fetchTeams();

    expect(mockFetch).toHaveBeenCalledWith('/api/teams', { credentials: 'include' });
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Server error' }, 500));

    await expect(fetchTeams()).rejects.toThrow('Server error');
  });
});

describe('fetchTeam', () => {
  it('fetches a single team', async () => {
    const data = { id: '1', name: 'Team A', members: [] };
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await fetchTeam('1');

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/1', { credentials: 'include' });
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Not found' }, 404));

    await expect(fetchTeam('1')).rejects.toThrow('Not found');
  });
});

describe('createTeam', () => {
  it('creates a team', async () => {
    const input = { name: 'New Team', description: 'A new team' };
    const data = { id: '1', ...input };
    mockFetch.mockResolvedValue(jsonResponse(data, 201));

    const result = await createTeam(input);

    expect(mockFetch).toHaveBeenCalledWith('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf-token' },
      body: JSON.stringify(input),
      credentials: 'include',
    });
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Invalid input' }, 400));

    await expect(createTeam({ name: '' })).rejects.toThrow('Invalid input');
  });
});

describe('updateTeam', () => {
  it('updates a team', async () => {
    const input = { name: 'Updated Team' };
    const data = { id: '1', name: 'Updated Team' };
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await updateTeam('1', input);

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf-token' },
      body: JSON.stringify(input),
      credentials: 'include',
    });
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Not found' }, 404));

    await expect(updateTeam('1', { name: 'Test' })).rejects.toThrow('Not found');
  });
});

describe('deleteTeam', () => {
  it('deletes a team', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve({}) });

    await deleteTeam('1');

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/1', {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': 'test-csrf-token' },
      credentials: 'include',
    });
  });

  it('throws on error response with message', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ message: 'Team not found' }),
    });

    await expect(deleteTeam('1')).rejects.toThrow('Team not found');
  });

  it('throws on error response with error field', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Cannot delete team with members' }),
    });

    await expect(deleteTeam('1')).rejects.toThrow('Cannot delete team with members');
  });

  it('throws with default message when json parse fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('Parse error')),
    });

    await expect(deleteTeam('1')).rejects.toThrow('Delete failed');
  });
});

describe('addTeamMember', () => {
  it('adds a member to a team', async () => {
    const input = { user_id: 'user-1', role: 'member' as const };
    const data = { team_id: 'team-1', user_id: 'user-1', role: 'member' };
    mockFetch.mockResolvedValue(jsonResponse(data, 201));

    const result = await addTeamMember('team-1', input);

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/team-1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf-token' },
      body: JSON.stringify(input),
      credentials: 'include',
    });
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'User already in team' }, 409));

    await expect(addTeamMember('team-1', { user_id: 'user-1', role: 'member' })).rejects.toThrow(
      'User already in team'
    );
  });
});

describe('updateTeamMember', () => {
  it('updates a team member role', async () => {
    const input = { role: 'lead' as const };
    const data = { team_id: 'team-1', user_id: 'user-1', role: 'lead' };
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await updateTeamMember('team-1', 'user-1', input);

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/team-1/members/user-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'test-csrf-token' },
      body: JSON.stringify(input),
      credentials: 'include',
    });
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Member not found' }, 404));

    await expect(updateTeamMember('team-1', 'user-1', { role: 'lead' })).rejects.toThrow('Member not found');
  });
});

describe('removeTeamMember', () => {
  it('removes a member from a team', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve({}) });

    await removeTeamMember('team-1', 'user-1');

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/team-1/members/user-1', {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': 'test-csrf-token' },
      credentials: 'include',
    });
  });

  it('throws on error response with message', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ message: 'Member not found' }),
    });

    await expect(removeTeamMember('team-1', 'user-1')).rejects.toThrow('Member not found');
  });

  it('throws on error response with error field', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Cannot remove last lead' }),
    });

    await expect(removeTeamMember('team-1', 'user-1')).rejects.toThrow('Cannot remove last lead');
  });

  it('throws with default message when json parse fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('Parse error')),
    });

    await expect(removeTeamMember('team-1', 'user-1')).rejects.toThrow('Remove failed');
  });
});

describe('fetchUsers', () => {
  it('fetches all users', async () => {
    const data = [{ id: '1', name: 'User A', email: 'user@example.com' }];
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await fetchUsers();

    expect(mockFetch).toHaveBeenCalledWith('/api/users', { credentials: 'include' });
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Server error' }, 500));

    await expect(fetchUsers()).rejects.toThrow('Server error');
  });
});
