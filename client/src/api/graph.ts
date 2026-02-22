import { GraphResponse } from '../types/graph';
import { handleResponse } from './common';

export async function fetchGraph(params?: {
  team?: string;
  service?: string;
  dependency?: string;
}): Promise<GraphResponse> {
  const searchParams = new URLSearchParams();
  if (params?.team) searchParams.set('team', params.team);
  if (params?.service) searchParams.set('service', params.service);
  if (params?.dependency) searchParams.set('dependency', params.dependency);

  const queryString = searchParams.toString();
  const url = `/api/graph${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, { credentials: 'include' });
  return handleResponse<GraphResponse>(response);
}
