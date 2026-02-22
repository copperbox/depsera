import { renderHook, act } from '@testing-library/react';
import { useTeamDetail, useTeamMembers } from './useTeamDetail';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

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
  description: 'A test team',
  members: [
    { user_id: 'u1', role: 'lead', user: { id: 'u1', name: 'User 1', email: 'u1@test.com' } },
    { user_id: 'u2', role: 'member', user: { id: 'u2', name: 'User 2', email: 'u2@test.com' } },
  ],
};

const mockUsers = [
  { id: 'u1', name: 'User 1', email: 'u1@test.com', role: 'user' },
  { id: 'u2', name: 'User 2', email: 'u2@test.com', role: 'user' },
  { id: 'u3', name: 'User 3', email: 'u3@test.com', role: 'user' },
];

beforeEach(() => {
  mockFetch.mockReset();
  mockNavigate.mockReset();
});

describe('useTeamDetail', () => {
  it('starts in loading state', () => {
    mockFetch.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useTeamDetail('t1', false));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.team).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('does not load when id is undefined', async () => {
    const { result } = renderHook(() => useTeamDetail(undefined, false));

    await act(async () => {
      await result.current.loadTeam();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('loads team for non-admin user (no users fetch)', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(mockTeam));

    const { result } = renderHook(() => useTeamDetail('t1', false));

    await act(async () => {
      await result.current.loadTeam();
    });

    expect(result.current.team).toEqual(mockTeam);
    expect(result.current.users).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('loads team and users for admin user', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTeam))
      .mockResolvedValueOnce(jsonResponse(mockUsers));

    const { result } = renderHook(() => useTeamDetail('t1', true));

    await act(async () => {
      await result.current.loadTeam();
    });

    expect(result.current.team).toEqual(mockTeam);
    expect(result.current.users).toEqual(mockUsers);
  });

  it('calculates available users (excluding team members)', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTeam))
      .mockResolvedValueOnce(jsonResponse(mockUsers));

    const { result } = renderHook(() => useTeamDetail('t1', true));

    await act(async () => {
      await result.current.loadTeam();
    });

    // Only u3 is not in the team
    expect(result.current.availableUsers).toHaveLength(1);
    expect(result.current.availableUsers[0].id).toBe('u3');
  });

  it('handles load error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useTeamDetail('t1', false));

    await act(async () => {
      await result.current.loadTeam();
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.isLoading).toBe(false);
  });

  it('handles non-Error load exception', async () => {
    mockFetch.mockRejectedValueOnce('String error');

    const { result } = renderHook(() => useTeamDetail('t1', false));

    await act(async () => {
      await result.current.loadTeam();
    });

    expect(result.current.error).toBe('Failed to load team');
  });

  it('deletes team and navigates', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204, json: () => Promise.resolve({}) });

    const { result } = renderHook(() => useTeamDetail('t1', false));

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(mockNavigate).toHaveBeenCalledWith('/teams');
  });

  it('does not delete when id is undefined', async () => {
    const { result } = renderHook(() => useTeamDetail(undefined, false));

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles delete error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Delete failed' }),
    });

    const { result } = renderHook(() => useTeamDetail('t1', false));

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(result.current.error).toBe('Delete failed');
    expect(result.current.isDeleting).toBe(false);
  });

  it('handles non-Error delete exception', async () => {
    mockFetch.mockRejectedValueOnce('String error');

    const { result } = renderHook(() => useTeamDetail('t1', false));

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(result.current.error).toBe('Failed to delete team');
  });

  it('allows setting error externally', () => {
    const { result } = renderHook(() => useTeamDetail('t1', false));

    act(() => {
      result.current.setError('Custom error');
    });

    expect(result.current.error).toBe('Custom error');
  });
});

describe('useTeamMembers', () => {
  const mockLoadTeam = jest.fn();
  const mockSetError = jest.fn();

  beforeEach(() => {
    mockLoadTeam.mockReset();
    mockSetError.mockReset();
  });

  it('initializes with default values', () => {
    const { result } = renderHook(() => useTeamMembers('t1', mockLoadTeam, mockSetError));

    expect(result.current.selectedUserId).toBe('');
    expect(result.current.selectedRole).toBe('member');
    expect(result.current.isAddingMember).toBe(false);
    expect(result.current.addMemberError).toBeNull();
    expect(result.current.actionInProgress).toBeNull();
  });

  it('adds a team member', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ team_id: 't1', user_id: 'u3', role: 'member' }));

    const { result } = renderHook(() => useTeamMembers('t1', mockLoadTeam, mockSetError));

    act(() => {
      result.current.setSelectedUserId('u3');
      result.current.setSelectedRole('lead');
    });

    await act(async () => {
      await result.current.handleAddMember();
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/t1/members', expect.any(Object));
    expect(mockLoadTeam).toHaveBeenCalled();
    expect(result.current.selectedUserId).toBe('');
    expect(result.current.selectedRole).toBe('member');
  });

  it('does not add member when id is undefined', async () => {
    const { result } = renderHook(() => useTeamMembers(undefined, mockLoadTeam, mockSetError));

    act(() => {
      result.current.setSelectedUserId('u3');
    });

    await act(async () => {
      await result.current.handleAddMember();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not add member when user not selected', async () => {
    const { result } = renderHook(() => useTeamMembers('t1', mockLoadTeam, mockSetError));

    await act(async () => {
      await result.current.handleAddMember();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles add member error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Add failed'));

    const { result } = renderHook(() => useTeamMembers('t1', mockLoadTeam, mockSetError));

    act(() => {
      result.current.setSelectedUserId('u3');
    });

    await act(async () => {
      await result.current.handleAddMember();
    });

    expect(result.current.addMemberError).toBe('Add failed');
    expect(result.current.isAddingMember).toBe(false);
  });

  it('handles non-Error add member exception', async () => {
    mockFetch.mockRejectedValueOnce('String error');

    const { result } = renderHook(() => useTeamMembers('t1', mockLoadTeam, mockSetError));

    act(() => {
      result.current.setSelectedUserId('u3');
    });

    await act(async () => {
      await result.current.handleAddMember();
    });

    expect(result.current.addMemberError).toBe('Failed to add member');
  });

  it('toggles member role from member to lead', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ team_id: 't1', user_id: 'u2', role: 'lead' }));

    const { result } = renderHook(() => useTeamMembers('t1', mockLoadTeam, mockSetError));

    const member = { user_id: 'u2', role: 'member' as const, team_id: 't1', created_at: '', user: { id: 'u2', email: 'u2@test.com', name: 'User 2', role: 'user', is_active: 1 } };

    await act(async () => {
      await result.current.handleToggleRole(member);
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/t1/members/u2', expect.objectContaining({
      body: JSON.stringify({ role: 'lead' }),
    }));
    expect(mockLoadTeam).toHaveBeenCalled();
  });

  it('toggles member role from lead to member', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ team_id: 't1', user_id: 'u1', role: 'member' }));

    const { result } = renderHook(() => useTeamMembers('t1', mockLoadTeam, mockSetError));

    const member = { user_id: 'u1', role: 'lead' as const, team_id: 't1', created_at: '', user: { id: 'u1', email: 'u1@test.com', name: 'User 1', role: 'user', is_active: 1 } };

    await act(async () => {
      await result.current.handleToggleRole(member);
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/t1/members/u1', expect.objectContaining({
      body: JSON.stringify({ role: 'member' }),
    }));
  });

  it('does not toggle role when id is undefined', async () => {
    const { result } = renderHook(() => useTeamMembers(undefined, mockLoadTeam, mockSetError));

    const member = { user_id: 'u1', role: 'lead' as const, team_id: 't1', created_at: '', user: { id: 'u1', email: 'u1@test.com', name: 'User 1', role: 'user', is_active: 1 } };

    await act(async () => {
      await result.current.handleToggleRole(member);
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles toggle role error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Toggle failed'));

    const { result } = renderHook(() => useTeamMembers('t1', mockLoadTeam, mockSetError));

    const member = { user_id: 'u1', role: 'lead' as const, team_id: 't1', created_at: '', user: { id: 'u1', email: 'u1@test.com', name: 'User 1', role: 'user', is_active: 1 } };

    await act(async () => {
      await result.current.handleToggleRole(member);
    });

    expect(mockSetError).toHaveBeenCalledWith('Toggle failed');
    expect(result.current.actionInProgress).toBeNull();
  });

  it('handles non-Error toggle role exception', async () => {
    mockFetch.mockRejectedValueOnce('String error');

    const { result } = renderHook(() => useTeamMembers('t1', mockLoadTeam, mockSetError));

    const member = { user_id: 'u1', role: 'lead' as const, team_id: 't1', created_at: '', user: { id: 'u1', email: 'u1@test.com', name: 'User 1', role: 'user', is_active: 1 } };

    await act(async () => {
      await result.current.handleToggleRole(member);
    });

    expect(mockSetError).toHaveBeenCalledWith('Failed to update role');
  });

  it('removes team member', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204, json: () => Promise.resolve({}) });

    const { result } = renderHook(() => useTeamMembers('t1', mockLoadTeam, mockSetError));

    await act(async () => {
      await result.current.handleRemoveMember('u2');
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/teams/t1/members/u2', expect.any(Object));
    expect(mockLoadTeam).toHaveBeenCalled();
  });

  it('does not remove member when id is undefined', async () => {
    const { result } = renderHook(() => useTeamMembers(undefined, mockLoadTeam, mockSetError));

    await act(async () => {
      await result.current.handleRemoveMember('u2');
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('handles remove member error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Remove failed'));

    const { result } = renderHook(() => useTeamMembers('t1', mockLoadTeam, mockSetError));

    await act(async () => {
      await result.current.handleRemoveMember('u2');
    });

    expect(mockSetError).toHaveBeenCalledWith('Remove failed');
    expect(result.current.actionInProgress).toBeNull();
  });

  it('handles non-Error remove member exception', async () => {
    mockFetch.mockRejectedValueOnce('String error');

    const { result } = renderHook(() => useTeamMembers('t1', mockLoadTeam, mockSetError));

    await act(async () => {
      await result.current.handleRemoveMember('u2');
    });

    expect(mockSetError).toHaveBeenCalledWith('Failed to remove member');
  });

  it('tracks action in progress', async () => {
    let resolvePromise: (value: unknown) => void;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    mockFetch.mockReturnValueOnce(pendingPromise);

    const { result } = renderHook(() => useTeamMembers('t1', mockLoadTeam, mockSetError));

    act(() => {
      result.current.handleRemoveMember('u2');
    });

    expect(result.current.actionInProgress).toBe('u2');

    await act(async () => {
      resolvePromise!({ ok: true, status: 204, json: () => Promise.resolve({}) });
    });

    expect(result.current.actionInProgress).toBeNull();
  });
});
