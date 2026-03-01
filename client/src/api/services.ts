import type {
  Service,
  ServiceWithDependencies,
  CreateServiceInput,
  UpdateServiceInput,
  TeamWithCounts,
  SchemaMapping,
  TestSchemaResult,
  CatalogEntry,
} from '../types/service';
import { handleResponse } from './common';
import { withCsrfToken } from './csrf';

export async function fetchServices(teamId?: string): Promise<ServiceWithDependencies[]> {
  let url = '/api/services';
  if (teamId) {
    const params = new URLSearchParams({ team_id: teamId });
    url += `?${params}`;
  }
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

export async function testSchemaMapping(
  url: string,
  schemaConfig: SchemaMapping
): Promise<TestSchemaResult> {
  const response = await fetch('/api/services/test-schema', {
    method: 'POST',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ url, schema_config: schemaConfig }),
    credentials: 'include',
  });
  return handleResponse<TestSchemaResult>(response);
}

export async function fetchServiceCatalog(options?: {
  search?: string;
  teamId?: string;
}): Promise<CatalogEntry[]> {
  const params = new URLSearchParams();
  if (options?.search) params.set('search', options.search);
  if (options?.teamId) params.set('team_id', options.teamId);
  const qs = params.toString();
  const url = `/api/services/catalog${qs ? `?${qs}` : ''}`;
  const response = await fetch(url, { credentials: 'include' });
  return handleResponse<CatalogEntry[]>(response);
}

export async function fetchTeams(): Promise<TeamWithCounts[]> {
  const response = await fetch('/api/teams', { credentials: 'include' });
  return handleResponse<TeamWithCounts[]>(response);
}
