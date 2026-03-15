import { handleResponse } from './common';
import { withCsrfToken } from './csrf';

export interface ApiKey {
  id: string;
  team_id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  created_at: string;
  created_by: string;
}

export interface ApiKeyWithRawKey extends ApiKey {
  rawKey: string;
}

export async function listApiKeys(teamId: string): Promise<ApiKey[]> {
  const response = await fetch(`/api/teams/${teamId}/api-keys`, {
    credentials: 'include',
  });
  return handleResponse<ApiKey[]>(response);
}

export async function createApiKey(
  teamId: string,
  name: string
): Promise<ApiKeyWithRawKey> {
  const response = await fetch(`/api/teams/${teamId}/api-keys`, {
    method: 'POST',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name }),
    credentials: 'include',
  });
  return handleResponse<ApiKeyWithRawKey>(response);
}

export async function deleteApiKey(teamId: string, keyId: string): Promise<void> {
  const response = await fetch(`/api/teams/${teamId}/api-keys/${keyId}`, {
    method: 'DELETE',
    headers: withCsrfToken(),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Delete failed' }));
    throw new Error(error.message || error.error || `HTTP error ${response.status}`);
  }
}
