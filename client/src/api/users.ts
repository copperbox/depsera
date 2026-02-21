import type { User, UserRole, TeamMemberRole } from '../types/user';
import { handleResponse } from './common';
import { withCsrfToken } from './csrf';

export interface UserWithTeams extends User {
  teams: {
    team_id: string;
    role: TeamMemberRole;
    team: {
      id: string;
      name: string;
      description: string | null;
    };
  }[];
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
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ role }),
    credentials: 'include',
  });
  return handleResponse<User>(response);
}

export async function deactivateUser(id: string): Promise<void> {
  const response = await fetch(`/api/users/${id}`, {
    method: 'DELETE',
    headers: withCsrfToken(),
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
    headers: withCsrfToken(),
    credentials: 'include',
  });
  return handleResponse<User>(response);
}

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role?: UserRole;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
    credentials: 'include',
  });
  return handleResponse<User>(response);
}

export async function resetUserPassword(id: string, password: string): Promise<void> {
  const response = await fetch(`/api/users/${id}/password`, {
    method: 'PUT',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ password }),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Password reset failed' }));
    throw new Error(error.message || error.error || `HTTP error ${response.status}`);
  }
}
