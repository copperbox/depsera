import { HealthTimelineResponse, TimelineRange } from '../types/chart';
import { handleResponse } from './common';

export async function fetchHealthTimeline(
  dependencyId: string,
  range: TimelineRange = '24h'
): Promise<HealthTimelineResponse> {
  const params = new URLSearchParams({ range });
  const response = await fetch(`/api/dependencies/${dependencyId}/timeline?${params}`, {
    credentials: 'include',
  });
  return handleResponse<HealthTimelineResponse>(response);
}
