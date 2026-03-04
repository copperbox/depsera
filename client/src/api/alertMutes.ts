import type { AlertMuteListResponse, CreateAlertMuteInput, AlertMute } from '../types/alert';
import { handleResponse } from './common';
import { withCsrfToken } from './csrf';

export async function fetchAlertMutes(
  teamId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<AlertMuteListResponse> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));

  const query = params.toString();
  const url = `/api/teams/${teamId}/alert-mutes${query ? `?${query}` : ''}`;

  const response = await fetch(url, { credentials: 'include' });
  return handleResponse<AlertMuteListResponse>(response);
}

export async function createAlertMute(
  teamId: string,
  input: CreateAlertMuteInput
): Promise<AlertMute> {
  const response = await fetch(`/api/teams/${teamId}/alert-mutes`, {
    method: 'POST',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
    credentials: 'include',
  });
  return handleResponse<AlertMute>(response);
}

export async function deleteAlertMute(teamId: string, muteId: string): Promise<void> {
  const response = await fetch(`/api/teams/${teamId}/alert-mutes/${muteId}`, {
    method: 'DELETE',
    headers: withCsrfToken(),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Delete failed' }));
    throw new Error(error.message || error.error || `HTTP error ${response.status}`);
  }
}

export async function fetchAdminAlertMutes(
  options: { limit?: number; offset?: number; teamId?: string } = {}
): Promise<AlertMuteListResponse> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  if (options.teamId) params.set('teamId', options.teamId);

  const query = params.toString();
  const url = `/api/admin/alert-mutes${query ? `?${query}` : ''}`;

  const response = await fetch(url, { credentials: 'include' });
  return handleResponse<AlertMuteListResponse>(response);
}
