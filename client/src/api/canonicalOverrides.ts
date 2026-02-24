import type { CanonicalOverride, CanonicalOverrideInput } from '../types/canonicalOverride';
import { handleResponse } from './common';
import { withCsrfToken } from './csrf';

export async function fetchCanonicalOverrides(): Promise<CanonicalOverride[]> {
  const response = await fetch('/api/canonical-overrides', { credentials: 'include' });
  return handleResponse<CanonicalOverride[]>(response);
}

export async function fetchCanonicalOverride(canonicalName: string): Promise<CanonicalOverride> {
  const response = await fetch(`/api/canonical-overrides/${encodeURIComponent(canonicalName)}`, {
    credentials: 'include',
  });
  return handleResponse<CanonicalOverride>(response);
}

export async function upsertCanonicalOverride(
  canonicalName: string,
  input: CanonicalOverrideInput
): Promise<CanonicalOverride> {
  const response = await fetch(`/api/canonical-overrides/${encodeURIComponent(canonicalName)}`, {
    method: 'PUT',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
    credentials: 'include',
  });
  return handleResponse<CanonicalOverride>(response);
}

export async function deleteCanonicalOverride(canonicalName: string): Promise<void> {
  const response = await fetch(`/api/canonical-overrides/${encodeURIComponent(canonicalName)}`, {
    method: 'DELETE',
    headers: withCsrfToken(),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to delete canonical override' }));
    throw new Error(error.message || `HTTP error ${response.status}`);
  }
}
