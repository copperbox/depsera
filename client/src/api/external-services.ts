import type {
  ExternalService,
  CreateExternalServiceInput,
  UpdateExternalServiceInput,
} from '../types/external-service';
import type { ServiceWithDependencies } from '../types/service';
import { handleResponse } from './common';
import { withCsrfToken } from './csrf';

export async function fetchExternalServices(teamId?: string): Promise<ExternalService[]> {
  let url = '/api/external-services';
  if (teamId) {
    const params = new URLSearchParams({ team_id: teamId });
    url += `?${params}`;
  }
  const response = await fetch(url, { credentials: 'include' });
  return handleResponse<ExternalService[]>(response);
}

export async function createExternalService(
  input: CreateExternalServiceInput,
): Promise<ExternalService> {
  const response = await fetch('/api/external-services', {
    method: 'POST',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
    credentials: 'include',
  });
  return handleResponse<ExternalService>(response);
}

export async function updateExternalService(
  id: string,
  input: UpdateExternalServiceInput,
): Promise<ExternalService> {
  const response = await fetch(`/api/external-services/${id}`, {
    method: 'PUT',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
    credentials: 'include',
  });
  return handleResponse<ExternalService>(response);
}

export async function fetchExternalServicesWithHealth(): Promise<ServiceWithDependencies[]> {
  const response = await fetch('/api/external-services', { credentials: 'include' });
  return handleResponse<ServiceWithDependencies[]>(response);
}

export async function deleteExternalService(id: string): Promise<void> {
  const response = await fetch(`/api/external-services/${id}`, {
    method: 'DELETE',
    headers: withCsrfToken(),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Delete failed' }));
    throw new Error(error.message || `HTTP error ${response.status}`);
  }
}
