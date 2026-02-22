import type { Association, AssociationSuggestion, CreateAssociationInput } from '../types/association';
import { handleResponse } from './common';
import { withCsrfToken } from './csrf';

export async function fetchAssociations(dependencyId: string): Promise<Association[]> {
  const response = await fetch(`/api/dependencies/${dependencyId}/associations`, {
    credentials: 'include',
  });
  return handleResponse<Association[]>(response);
}

export async function createAssociation(
  dependencyId: string,
  input: CreateAssociationInput,
): Promise<Association> {
  const response = await fetch(`/api/dependencies/${dependencyId}/associations`, {
    method: 'POST',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
    credentials: 'include',
  });
  return handleResponse<Association>(response);
}

export async function deleteAssociation(
  dependencyId: string,
  serviceId: string,
): Promise<void> {
  const response = await fetch(
    `/api/dependencies/${dependencyId}/associations/${serviceId}`,
    { method: 'DELETE', headers: withCsrfToken(), credentials: 'include' },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Delete failed' }));
    throw new Error(error.message || `HTTP error ${response.status}`);
  }
}

export async function generateDependencySuggestions(
  dependencyId: string,
): Promise<AssociationSuggestion[]> {
  const response = await fetch(
    `/api/dependencies/${dependencyId}/suggestions/generate`,
    { method: 'POST', headers: withCsrfToken(), credentials: 'include' },
  );
  return handleResponse<AssociationSuggestion[]>(response);
}

export async function generateServiceSuggestions(
  serviceId: string,
): Promise<AssociationSuggestion[]> {
  const response = await fetch(
    `/api/services/${serviceId}/suggestions/generate`,
    { method: 'POST', headers: withCsrfToken(), credentials: 'include' },
  );
  return handleResponse<AssociationSuggestion[]>(response);
}

export async function fetchSuggestions(): Promise<AssociationSuggestion[]> {
  const response = await fetch('/api/associations/suggestions', {
    credentials: 'include',
  });
  return handleResponse<AssociationSuggestion[]>(response);
}

export async function acceptSuggestion(suggestionId: string): Promise<void> {
  const response = await fetch(
    `/api/associations/suggestions/${suggestionId}/accept`,
    { method: 'POST', headers: withCsrfToken(), credentials: 'include' },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Accept failed' }));
    throw new Error(error.message || `HTTP error ${response.status}`);
  }
}

export async function dismissSuggestion(suggestionId: string): Promise<void> {
  const response = await fetch(
    `/api/associations/suggestions/${suggestionId}/dismiss`,
    { method: 'POST', headers: withCsrfToken(), credentials: 'include' },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Dismiss failed' }));
    throw new Error(error.message || `HTTP error ${response.status}`);
  }
}
