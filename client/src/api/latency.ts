import { LatencyStatsResponse } from '../types/graph';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP error ${response.status}`);
  }
  return response.json();
}

export async function fetchLatencyStats(dependencyId: string): Promise<LatencyStatsResponse> {
  const response = await fetch(`/api/latency/${dependencyId}`, { credentials: 'include' });
  return handleResponse<LatencyStatsResponse>(response);
}
