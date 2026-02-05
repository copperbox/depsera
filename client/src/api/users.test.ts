import { fetchUsers, fetchUser, updateUserRole, deactivateUser, reactivateUser } from './users';

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

describe('fetchUsers', () => {
  it('fetches all users', async () => {
    const data = [{ id: '1', name: 'User A', email: 'user@example.com', role: 'user' }];
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

describe('fetchUser', () => {
  it('fetches a single user with teams', async () => {
    const data = {
      id: '1',
      name: 'User A',
      email: 'user@example.com',
      role: 'user',
      teams: [{ team_id: 'team-1', role: 'member', team: { id: 'team-1', name: 'Team A', description: null } }],
    };
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await fetchUser('1');

    expect(mockFetch).toHaveBeenCalledWith('/api/users/1', { credentials: 'include' });
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Not found' }, 404));

    await expect(fetchUser('1')).rejects.toThrow('Not found');
  });
});

describe('updateUserRole', () => {
  it('updates a user role', async () => {
    const data = { id: '1', name: 'User A', email: 'user@example.com', role: 'admin' };
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await updateUserRole('1', 'admin');

    expect(mockFetch).toHaveBeenCalledWith('/api/users/1/role', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
      credentials: 'include',
    });
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'Forbidden' }, 403));

    await expect(updateUserRole('1', 'admin')).rejects.toThrow('Forbidden');
  });
});

describe('deactivateUser', () => {
  it('deactivates a user', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve({}) });

    await deactivateUser('1');

    expect(mockFetch).toHaveBeenCalledWith('/api/users/1', {
      method: 'DELETE',
      credentials: 'include',
    });
  });

  it('throws on error response with message', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ message: 'User not found' }),
    });

    await expect(deactivateUser('1')).rejects.toThrow('User not found');
  });

  it('throws on error response with error field', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Cannot deactivate last admin' }),
    });

    await expect(deactivateUser('1')).rejects.toThrow('Cannot deactivate last admin');
  });

  it('throws with default message when json parse fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('Parse error')),
    });

    await expect(deactivateUser('1')).rejects.toThrow('Deactivation failed');
  });
});

describe('reactivateUser', () => {
  it('reactivates a user', async () => {
    const data = { id: '1', name: 'User A', email: 'user@example.com', role: 'user', is_active: true };
    mockFetch.mockResolvedValue(jsonResponse(data));

    const result = await reactivateUser('1');

    expect(mockFetch).toHaveBeenCalledWith('/api/users/1/reactivate', {
      method: 'POST',
      credentials: 'include',
    });
    expect(result).toEqual(data);
  });

  it('throws on error response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ message: 'User not found' }, 404));

    await expect(reactivateUser('1')).rejects.toThrow('User not found');
  });
});
