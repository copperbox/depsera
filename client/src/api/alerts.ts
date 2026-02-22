import type {
  AlertChannel,
  AlertRule,
  CreateAlertChannelInput,
  UpdateAlertChannelInput,
  UpdateAlertRuleInput,
  TestAlertChannelResult,
  AlertHistoryResponse,
  AlertHistoryListOptions,
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

export async function fetchAlertRules(teamId: string): Promise<AlertRule[]> {
  const response = await fetch(`/api/teams/${teamId}/alert-rules`, {
    credentials: 'include',
  });
  return handleResponse<AlertRule[]>(response);
}

export async function updateAlertRules(
  teamId: string,
  input: UpdateAlertRuleInput
): Promise<AlertRule> {
  const response = await fetch(`/api/teams/${teamId}/alert-rules`, {
    method: 'PUT',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
    credentials: 'include',
  });
  return handleResponse<AlertRule>(response);
}

export async function fetchAlertHistory(
  teamId: string,
  options: AlertHistoryListOptions = {}
): Promise<AlertHistoryResponse> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  if (options.status) params.set('status', options.status);

  const query = params.toString();
  const url = `/api/teams/${teamId}/alert-history${query ? `?${query}` : ''}`;

  const response = await fetch(url, {
    credentials: 'include',
  });
  return handleResponse<AlertHistoryResponse>(response);
}
