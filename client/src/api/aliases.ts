import type { DependencyAlias, CreateAliasInput, UpdateAliasInput } from '../types/alias';
import { handleResponse } from './common';

export async function fetchAliases(): Promise<DependencyAlias[]> {
  const response = await fetch('/api/aliases', { credentials: 'include' });
  return handleResponse<DependencyAlias[]>(response);
}

export async function createAlias(input: CreateAliasInput): Promise<DependencyAlias> {
  const response = await fetch('/api/aliases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  });
  return handleResponse<DependencyAlias>(response);
}

export async function updateAlias(id: string, input: UpdateAliasInput): Promise<DependencyAlias> {
  const response = await fetch(`/api/aliases/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  });
  return handleResponse<DependencyAlias>(response);
}

export async function deleteAlias(id: string): Promise<void> {
  const response = await fetch(`/api/aliases/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Delete failed' }));
    throw new Error(error.message || `HTTP error ${response.status}`);
  }
}

export async function fetchCanonicalNames(): Promise<string[]> {
  const response = await fetch('/api/aliases/canonical-names', { credentials: 'include' });
  return handleResponse<string[]>(response);
}
