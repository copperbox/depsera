import { handleResponse } from './common';
import { withCsrfToken } from './csrf';

export interface ExternalNodeEnrichment {
  id: string;
  canonical_name: string;
  display_name: string | null;
  description: string | null;
  impact: string | null;
  contact: string | null;
  service_type: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface UpsertExternalNodeInput {
  displayName?: string | null;
  description?: string | null;
  impact?: string | null;
  contact?: Record<string, unknown> | null;
  serviceType?: string | null;
}

export async function fetchExternalNodes(): Promise<ExternalNodeEnrichment[]> {
  const response = await fetch('/api/external-nodes', {
    credentials: 'include',
  });
  return handleResponse<ExternalNodeEnrichment[]>(response);
}

export async function upsertExternalNode(
  canonicalName: string,
  input: UpsertExternalNodeInput,
): Promise<ExternalNodeEnrichment> {
  const response = await fetch(`/api/external-nodes/${encodeURIComponent(canonicalName)}`, {
    method: 'PUT',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
    credentials: 'include',
  });
  return handleResponse<ExternalNodeEnrichment>(response);
}

export async function deleteExternalNode(canonicalName: string): Promise<void> {
  const response = await fetch(`/api/external-nodes/${encodeURIComponent(canonicalName)}`, {
    method: 'DELETE',
    headers: withCsrfToken(),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Delete failed' }));
    throw new Error(error.message || `HTTP error ${response.status}`);
  }
}
