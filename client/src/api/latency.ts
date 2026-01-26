import { LatencyStatsResponse } from '../types/graph';
import { handleResponse } from './common';

export async function fetchLatencyStats(dependencyId: string): Promise<LatencyStatsResponse> {
  const response = await fetch(`/api/latency/${dependencyId}`, { credentials: 'include' });
  return handleResponse<LatencyStatsResponse>(response);
}
