import type {
  Topology,
  Service,
  Scenario,
  ActiveFailure,
  FailureMode,
  FailureConfig,
  ApiResponse,
} from '../types';

const API_BASE = '/control/api';

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const result: ApiResponse<T> = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Request failed');
  }
  return result.data as T;
}

export async function fetchTopology(): Promise<Topology> {
  return fetchJson<Topology>(`${API_BASE}/topology`);
}

export async function fetchServices(): Promise<Service[]> {
  return fetchJson<Service[]>(`${API_BASE}/services`);
}

export async function fetchService(id: string): Promise<Service> {
  return fetchJson<Service>(`${API_BASE}/services/${id}`);
}

export async function fetchScenarios(): Promise<Scenario[]> {
  return fetchJson<Scenario[]>(`${API_BASE}/scenarios`);
}

export async function fetchFailures(): Promise<ActiveFailure[]> {
  return fetchJson<ActiveFailure[]>(`${API_BASE}/failures`);
}

export async function injectFailure(
  serviceId: string,
  mode: FailureMode,
  config?: FailureConfig,
  cascade: boolean = true
): Promise<void> {
  await fetchJson<void>(`${API_BASE}/services/${serviceId}/failure`, {
    method: 'POST',
    body: JSON.stringify({ mode, config, cascade }),
  });
}

export async function clearFailure(serviceId: string): Promise<void> {
  await fetchJson<void>(`${API_BASE}/services/${serviceId}/failure`, {
    method: 'DELETE',
  });
}

export async function clearAllFailures(): Promise<void> {
  await fetchJson<void>(`${API_BASE}/failures`, {
    method: 'DELETE',
  });
}

export async function applyScenario(name: string): Promise<void> {
  await fetchJson<void>(`${API_BASE}/scenarios/${name}`, {
    method: 'POST',
  });
}

export async function resetTopology(count: number = 20): Promise<void> {
  await fetchJson<void>(`${API_BASE}/reset`, {
    method: 'POST',
    body: JSON.stringify({ count }),
  });
}
