import { LatencyBucketsResponse, LatencyRange } from '../types/chart';
import { LatencyStatsResponse } from '../types/graph';
import { handleResponse } from './common';

export async function fetchLatencyStats(dependencyId: string): Promise<LatencyStatsResponse> {
  const response = await fetch(`/api/latency/${dependencyId}`, { credentials: 'include' });
  return handleResponse<LatencyStatsResponse>(response);
}

export async function fetchLatencyBuckets(
  dependencyId: string,
  range: LatencyRange = '24h'
): Promise<LatencyBucketsResponse> {
  const params = new URLSearchParams({ range });
  const response = await fetch(`/api/latency/${dependencyId}/buckets?${params}`, {
    credentials: 'include',
  });
  return handleResponse<LatencyBucketsResponse>(response);
}
