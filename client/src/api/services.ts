import type {
  Service,
  ServiceWithDependencies,
  CreateServiceInput,
  UpdateServiceInput,
  TeamWithCounts,
} from '../types/service';
import { handleResponse } from './common';
import { withCsrfToken } from './csrf';

export async function fetchServices(teamId?: string): Promise<ServiceWithDependencies[]> {
  const url = teamId ? `/api/services?team_id=${teamId}` : '/api/services';
  const response = await fetch(url, { credentials: 'include' });
  return handleResponse<ServiceWithDependencies[]>(response);
}

export async function fetchService(id: string): Promise<ServiceWithDependencies> {
  const response = await fetch(`/api/services/${id}`, { credentials: 'include' });
  return handleResponse<ServiceWithDependencies>(response);
}

export async function createService(input: CreateServiceInput): Promise<Service> {
  const response = await fetch('/api/services', {
    method: 'POST',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
    credentials: 'include',
  });
  return handleResponse<Service>(response);
}

export async function updateService(id: string, input: UpdateServiceInput): Promise<Service> {
  const response = await fetch(`/api/services/${id}`, {
    method: 'PUT',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
    credentials: 'include',
  });
  return handleResponse<Service>(response);
}

export async function deleteService(id: string): Promise<void> {
  const response = await fetch(`/api/services/${id}`, {
    method: 'DELETE',
    headers: withCsrfToken(),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Delete failed' }));
    throw new Error(error.message || `HTTP error ${response.status}`);
  }
}

export async function fetchTeams(): Promise<TeamWithCounts[]> {
  const response = await fetch('/api/teams', { credentials: 'include' });
  return handleResponse<TeamWithCounts[]>(response);
}
