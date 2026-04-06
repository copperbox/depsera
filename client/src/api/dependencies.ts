import type { Dependency } from '../types/service';
import { handleResponse } from './common';
import { withCsrfToken } from './csrf';

export interface DependencyOverrideInput {
  contact_override?: Record<string, unknown> | null;
  impact_override?: string | null;
}

export async function updateDependencyOverrides(
  id: string,
  input: DependencyOverrideInput
): Promise<Dependency> {
  const response = await fetch(`/api/dependencies/${id}/overrides`, {
    method: 'PUT',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
    credentials: 'include',
  });
  return handleResponse<Dependency>(response);
}

export async function clearDependencyOverrides(id: string): Promise<void> {
  const response = await fetch(`/api/dependencies/${id}/overrides`, {
    method: 'DELETE',
    headers: withCsrfToken(),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to clear overrides' }));
    throw new Error(error.message || `HTTP error ${response.status}`);
  }
}

export interface DependencyEnrichmentInput {
  displayName?: string | null;
  description?: string | null;
  impact?: string | null;
}

export async function enrichDependency(
  id: string,
  input: DependencyEnrichmentInput,
): Promise<Dependency> {
  const response = await fetch(`/api/dependencies/${id}/enrich`, {
    method: 'PATCH',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
    credentials: 'include',
  });
  return handleResponse<Dependency>(response);
}

export async function listDiscoveredDependencies(
  serviceId: string,
): Promise<Dependency[]> {
  const response = await fetch(`/api/services/${serviceId}/discovered-dependencies`, {
    credentials: 'include',
  });
  return handleResponse<Dependency[]>(response);
}
