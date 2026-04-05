import { handleResponse } from './common';
import type { OtlpStatsResponse, AdminOtlpStatsResponse, ApiKeyUsageResponse, AdminOtlpUsageResponse } from '../types/otlpStats';

export async function getTeamOtlpStats(teamId: string): Promise<OtlpStatsResponse> {
  const response = await fetch(`/api/teams/${teamId}/otlp-stats`, {
    credentials: 'include',
  });
  return handleResponse<OtlpStatsResponse>(response);
}

export async function getAdminOtlpStats(): Promise<AdminOtlpStatsResponse> {
  const response = await fetch('/api/admin/otlp-stats', {
    credentials: 'include',
  });
  return handleResponse<AdminOtlpStatsResponse>(response);
}

export async function getApiKeyUsage(
  teamId: string,
  keyId: string,
  params: { from: string; to: string; granularity: 'minute' | 'hour' },
): Promise<ApiKeyUsageResponse> {
  const qs = new URLSearchParams(params).toString();
  const response = await fetch(`/api/teams/${teamId}/api-keys/${keyId}/usage?${qs}`, {
    credentials: 'include',
  });
  return handleResponse<ApiKeyUsageResponse>(response);
}

export async function updateApiKeyRateLimit(
  teamId: string,
  keyId: string,
  rateLimit: number | null,
): Promise<unknown> {
  const response = await fetch(`/api/teams/${teamId}/api-keys/${keyId}/rate-limit`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rate_limit_rpm: rateLimit }),
  });
  return handleResponse(response);
}

export async function getAdminApiKeyUsage(
  keyId: string,
  params: { from: string; to: string; granularity: 'minute' | 'hour' },
): Promise<ApiKeyUsageResponse> {
  const qs = new URLSearchParams(params).toString();
  const response = await fetch(`/api/admin/api-keys/${keyId}/usage?${qs}`, {
    credentials: 'include',
  });
  return handleResponse<ApiKeyUsageResponse>(response);
}

export async function updateAdminApiKeyRateLimit(
  keyId: string,
  payload: { rate_limit_rpm: number | null; admin_locked?: boolean },
): Promise<unknown> {
  const response = await fetch(`/api/admin/api-keys/${keyId}/rate-limit`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}

export async function getAdminOtlpUsage(
  params: { from: string; to: string },
): Promise<AdminOtlpUsageResponse> {
  const qs = new URLSearchParams(params).toString();
  const response = await fetch(`/api/admin/otlp-usage?${qs}`, {
    credentials: 'include',
  });
  return handleResponse(response);
}
