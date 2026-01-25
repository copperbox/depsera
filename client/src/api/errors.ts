import { ErrorHistoryResponse } from '../types/graph';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP error ${response.status}`);
  }
  return response.json();
}

export async function fetchErrorHistory(dependencyId: string): Promise<ErrorHistoryResponse> {
  const response = await fetch(`/api/errors/${dependencyId}`, { credentials: 'include' });
  return handleResponse<ErrorHistoryResponse>(response);
}
