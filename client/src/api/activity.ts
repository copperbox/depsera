import type { StatusChangeActivity, UnstableDependency } from '../types/activity';
import { handleResponse } from './common';

export async function fetchRecentActivity(limit = 10): Promise<StatusChangeActivity[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const response = await fetch(`/api/activity/recent?${params}`, { credentials: 'include' });
  return handleResponse<StatusChangeActivity[]>(response);
}

export async function fetchUnstableDependencies(
  hours = 24,
  limit = 5
): Promise<UnstableDependency[]> {
  const params = new URLSearchParams({
    hours: String(hours),
    limit: String(limit),
  });
  const response = await fetch(`/api/activity/unstable?${params}`, { credentials: 'include' });
  return handleResponse<UnstableDependency[]>(response);
}
