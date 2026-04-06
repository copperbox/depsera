import type { Association, CreateAssociationInput } from '../types/association';
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

export async function confirmAssociation(
  depId: string,
  assocId: string,
): Promise<{ success: boolean }> {
  const response = await fetch(
    `/api/dependencies/${depId}/associations/${assocId}/confirm`,
    { method: 'PUT', headers: withCsrfToken(), credentials: 'include' },
  );
  return handleResponse<{ success: boolean }>(response);
}

export async function dismissAssociation(
  depId: string,
  assocId: string,
): Promise<{ success: boolean }> {
  const response = await fetch(
    `/api/dependencies/${depId}/associations/${assocId}/dismiss`,
    { method: 'PUT', headers: withCsrfToken(), credentials: 'include' },
  );
  return handleResponse<{ success: boolean }>(response);
}
