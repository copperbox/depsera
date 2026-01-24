import type { User, UserRole } from '../types/user';

export interface UserWithTeams extends User {
  teams: {
    team_id: string;
    role: string;
    team: {
      id: string;
      name: string;
      description: string | null;
    };
  }[];
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || error.error || `HTTP error ${response.status}`);
  }
  return response.json();
}

export async function fetchUsers(): Promise<User[]> {
  const response = await fetch('/api/users', { credentials: 'include' });
  return handleResponse<User[]>(response);
}

export async function fetchUser(id: string): Promise<UserWithTeams> {
  const response = await fetch(`/api/users/${id}`, { credentials: 'include' });
  return handleResponse<UserWithTeams>(response);
}

export async function updateUserRole(id: string, role: UserRole): Promise<User> {
  const response = await fetch(`/api/users/${id}/role`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
    credentials: 'include',
  });
  return handleResponse<User>(response);
}

export async function deactivateUser(id: string): Promise<void> {
  const response = await fetch(`/api/users/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Deactivation failed' }));
    throw new Error(error.message || error.error || `HTTP error ${response.status}`);
  }
}

export async function reactivateUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}/reactivate`, {
    method: 'POST',
    credentials: 'include',
  });
  return handleResponse<User>(response);
}
