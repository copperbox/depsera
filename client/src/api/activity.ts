import type { StatusChangeActivity } from '../types/activity';
import { handleResponse } from './common';

export async function fetchRecentActivity(limit = 10): Promise<StatusChangeActivity[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const response = await fetch(`/api/activity/recent?${params}`, { credentials: 'include' });
  return handleResponse<StatusChangeActivity[]>(response);
}
