import type {
  AlertChannel,
  CreateAlertChannelInput,
  UpdateAlertChannelInput,
  TestAlertChannelResult,
} from '../types/alert';
import { handleResponse } from './common';
import { withCsrfToken } from './csrf';

export async function fetchAlertChannels(teamId: string): Promise<AlertChannel[]> {
  const response = await fetch(`/api/teams/${teamId}/alert-channels`, {
    credentials: 'include',
  });
  return handleResponse<AlertChannel[]>(response);
}

export async function createAlertChannel(
  teamId: string,
  input: CreateAlertChannelInput
): Promise<AlertChannel> {
  const response = await fetch(`/api/teams/${teamId}/alert-channels`, {
    method: 'POST',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
    credentials: 'include',
  });
  return handleResponse<AlertChannel>(response);
}

export async function updateAlertChannel(
  teamId: string,
  channelId: string,
  input: UpdateAlertChannelInput
): Promise<AlertChannel> {
  const response = await fetch(`/api/teams/${teamId}/alert-channels/${channelId}`, {
    method: 'PUT',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
    credentials: 'include',
  });
  return handleResponse<AlertChannel>(response);
}

export async function deleteAlertChannel(teamId: string, channelId: string): Promise<void> {
  const response = await fetch(`/api/teams/${teamId}/alert-channels/${channelId}`, {
    method: 'DELETE',
    headers: withCsrfToken(),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Delete failed' }));
    throw new Error(error.message || error.error || `HTTP error ${response.status}`);
  }
}

export async function testAlertChannel(
  teamId: string,
  channelId: string
): Promise<TestAlertChannelResult> {
  const response = await fetch(`/api/teams/${teamId}/alert-channels/${channelId}/test`, {
    method: 'POST',
    headers: withCsrfToken(),
    credentials: 'include',
  });
  return handleResponse<TestAlertChannelResult>(response);
}
