import { handleResponse } from './common';
import { withCsrfToken } from './csrf';

export interface SettingValue {
  value: number | string;
  source: 'database' | 'default';
}

export interface SettingsResponse {
  settings: Record<string, SettingValue>;
}

export interface UpdateSettingsResponse extends SettingsResponse {
  updated: number;
  unknownKeys?: string[];
}

export async function fetchSettings(): Promise<SettingsResponse> {
  const response = await fetch('/api/admin/settings', { credentials: 'include' });
  return handleResponse<SettingsResponse>(response);
}

export async function updateSettings(
  updates: Record<string, string | number>,
): Promise<UpdateSettingsResponse> {
  const response = await fetch('/api/admin/settings', {
    method: 'PUT',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(updates),
    credentials: 'include',
  });
  return handleResponse<UpdateSettingsResponse>(response);
}
