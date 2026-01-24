import type {
  TeamWithCounts,
  TeamWithDetails,
  CreateTeamInput,
  UpdateTeamInput,
  AddMemberInput,
  UpdateMemberInput,
  TeamMember,
} from '../types/team';
import type { User } from '../types/user';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || error.error || `HTTP error ${response.status}`);
  }
  return response.json();
}

export async function fetchTeams(): Promise<TeamWithCounts[]> {
  const response = await fetch('/api/teams', { credentials: 'include' });
  return handleResponse<TeamWithCounts[]>(response);
}

export async function fetchTeam(id: string): Promise<TeamWithDetails> {
  const response = await fetch(`/api/teams/${id}`, { credentials: 'include' });
  return handleResponse<TeamWithDetails>(response);
}

export async function createTeam(input: CreateTeamInput): Promise<TeamWithCounts> {
  const response = await fetch('/api/teams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  });
  return handleResponse<TeamWithCounts>(response);
}

export async function updateTeam(id: string, input: UpdateTeamInput): Promise<TeamWithCounts> {
  const response = await fetch(`/api/teams/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  });
  return handleResponse<TeamWithCounts>(response);
}

export async function deleteTeam(id: string): Promise<void> {
  const response = await fetch(`/api/teams/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Delete failed' }));
    throw new Error(error.message || error.error || `HTTP error ${response.status}`);
  }
}

export async function addTeamMember(
  teamId: string,
  input: AddMemberInput
): Promise<TeamMember> {
  const response = await fetch(`/api/teams/${teamId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  });
  return handleResponse<TeamMember>(response);
}

export async function updateTeamMember(
  teamId: string,
  userId: string,
  input: UpdateMemberInput
): Promise<TeamMember> {
  const response = await fetch(`/api/teams/${teamId}/members/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  });
  return handleResponse<TeamMember>(response);
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  const response = await fetch(`/api/teams/${teamId}/members/${userId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Remove failed' }));
    throw new Error(error.message || error.error || `HTTP error ${response.status}`);
  }
}

export async function fetchUsers(): Promise<User[]> {
  const response = await fetch('/api/users', { credentials: 'include' });
  return handleResponse<User[]>(response);
}
