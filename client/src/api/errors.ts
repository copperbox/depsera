import { ErrorHistoryResponse } from '../types/graph';
import { handleResponse } from './common';

export async function fetchErrorHistory(dependencyId: string): Promise<ErrorHistoryResponse> {
  const response = await fetch(`/api/errors/${dependencyId}`, { credentials: 'include' });
  return handleResponse<ErrorHistoryResponse>(response);
}
