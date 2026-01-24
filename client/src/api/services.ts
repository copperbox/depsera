import type {
  Service,
  ServiceWithDependencies,
  CreateServiceInput,
  UpdateServiceInput,
  TeamWithCounts,
} from '../types/service';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP error ${response.status}`);
  }
  return response.json();
}

export async function fetchServices(teamId?: string): Promise<Service[]> {
  const url = teamId ? `/api/services?team_id=${teamId}` : '/api/services';
  const response = await fetch(url);
  return handleResponse<Service[]>(response);
}

export async function fetchService(id: string): Promise<ServiceWithDependencies> {
  const response = await fetch(`/api/services/${id}`);
  return handleResponse<ServiceWithDependencies>(response);
}

export async function createService(input: CreateServiceInput): Promise<Service> {
  const response = await fetch('/api/services', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<Service>(response);
}

export async function updateService(id: string, input: UpdateServiceInput): Promise<Service> {
  const response = await fetch(`/api/services/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<Service>(response);
}

export async function deleteService(id: string): Promise<void> {
  const response = await fetch(`/api/services/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Delete failed' }));
    throw new Error(error.message || `HTTP error ${response.status}`);
  }
}

export async function fetchTeams(): Promise<TeamWithCounts[]> {
  const response = await fetch('/api/teams');
  return handleResponse<TeamWithCounts[]>(response);
}
