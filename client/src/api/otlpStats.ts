import { handleResponse } from './common';
import type { OtlpStatsResponse, AdminOtlpStatsResponse } from '../types/otlpStats';

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
