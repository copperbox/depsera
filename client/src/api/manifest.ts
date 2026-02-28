import type {
  TeamManifestConfig,
  ManifestConfigInput,
  ManifestSyncResult,
  ManifestValidationResult,
  DriftFlagWithContext,
  DriftSummary,
  DriftFlagsResponse,
  BulkDriftActionResult,
  SyncHistoryResponse,
  DriftFlagListOptions,
  SyncHistoryListOptions,
} from '../types/manifest';
import { handleResponse } from './common';
import { withCsrfToken } from './csrf';

// --- Configuration ---

export async function getManifestConfig(
  teamId: string
): Promise<TeamManifestConfig | null> {
  const response = await fetch(`/api/teams/${teamId}/manifest`, {
    credentials: 'include',
  });
  const data = await handleResponse<{ config: TeamManifestConfig | null }>(response);
  return data.config;
}

export async function saveManifestConfig(
  teamId: string,
  input: ManifestConfigInput
): Promise<TeamManifestConfig> {
  const response = await fetch(`/api/teams/${teamId}/manifest`, {
    method: 'PUT',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
    credentials: 'include',
  });
  const data = await handleResponse<{ config: TeamManifestConfig }>(response);
  return data.config;
}

export async function removeManifestConfig(teamId: string): Promise<void> {
  const response = await fetch(`/api/teams/${teamId}/manifest`, {
    method: 'DELETE',
    headers: withCsrfToken(),
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Delete failed' }));
    throw new Error(error.message || error.error || `HTTP error ${response.status}`);
  }
}

// --- Sync ---

export async function triggerSync(teamId: string): Promise<ManifestSyncResult> {
  const response = await fetch(`/api/teams/${teamId}/manifest/sync`, {
    method: 'POST',
    headers: withCsrfToken(),
    credentials: 'include',
  });
  const data = await handleResponse<{ result: ManifestSyncResult }>(response);
  return data.result;
}

export async function getSyncHistory(
  teamId: string,
  options: SyncHistoryListOptions = {}
): Promise<SyncHistoryResponse> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));

  const query = params.toString();
  const url = `/api/teams/${teamId}/manifest/sync-history${query ? `?${query}` : ''}`;

  const response = await fetch(url, { credentials: 'include' });
  return handleResponse<SyncHistoryResponse>(response);
}

// --- Validation ---

export async function validateManifest(
  manifestJson: unknown
): Promise<ManifestValidationResult> {
  const response = await fetch('/api/manifest/validate', {
    method: 'POST',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(manifestJson),
    credentials: 'include',
  });
  const data = await handleResponse<{ result: ManifestValidationResult }>(response);
  return data.result;
}

// --- Drift flags ---

export async function getDriftFlags(
  teamId: string,
  options: DriftFlagListOptions = {}
): Promise<DriftFlagsResponse> {
  const params = new URLSearchParams();
  if (options.status) params.set('status', options.status);
  if (options.drift_type) params.set('drift_type', options.drift_type);
  if (options.service_id) params.set('service_id', options.service_id);
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));

  const query = params.toString();
  const url = `/api/teams/${teamId}/drifts${query ? `?${query}` : ''}`;

  const response = await fetch(url, { credentials: 'include' });
  return handleResponse<DriftFlagsResponse>(response);
}

export async function getDriftSummary(teamId: string): Promise<DriftSummary> {
  const response = await fetch(`/api/teams/${teamId}/drifts/summary`, {
    credentials: 'include',
  });
  const data = await handleResponse<{ summary: DriftSummary }>(response);
  return data.summary;
}

export async function acceptDrift(
  teamId: string,
  driftId: string
): Promise<DriftFlagWithContext> {
  const response = await fetch(`/api/teams/${teamId}/drifts/${driftId}/accept`, {
    method: 'PUT',
    headers: withCsrfToken(),
    credentials: 'include',
  });
  const data = await handleResponse<{ flag: DriftFlagWithContext }>(response);
  return data.flag;
}

export async function dismissDrift(
  teamId: string,
  driftId: string
): Promise<DriftFlagWithContext> {
  const response = await fetch(`/api/teams/${teamId}/drifts/${driftId}/dismiss`, {
    method: 'PUT',
    headers: withCsrfToken(),
    credentials: 'include',
  });
  const data = await handleResponse<{ flag: DriftFlagWithContext }>(response);
  return data.flag;
}

export async function reopenDrift(
  teamId: string,
  driftId: string
): Promise<DriftFlagWithContext> {
  const response = await fetch(`/api/teams/${teamId}/drifts/${driftId}/reopen`, {
    method: 'PUT',
    headers: withCsrfToken(),
    credentials: 'include',
  });
  const data = await handleResponse<{ flag: DriftFlagWithContext }>(response);
  return data.flag;
}

export async function bulkAcceptDrifts(
  teamId: string,
  flagIds: string[]
): Promise<BulkDriftActionResult> {
  const response = await fetch(`/api/teams/${teamId}/drifts/bulk-accept`, {
    method: 'POST',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ flag_ids: flagIds }),
    credentials: 'include',
  });
  const data = await handleResponse<{ result: BulkDriftActionResult }>(response);
  return data.result;
}

export async function bulkDismissDrifts(
  teamId: string,
  flagIds: string[]
): Promise<BulkDriftActionResult> {
  const response = await fetch(`/api/teams/${teamId}/drifts/bulk-dismiss`, {
    method: 'POST',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ flag_ids: flagIds }),
    credentials: 'include',
  });
  const data = await handleResponse<{ result: BulkDriftActionResult }>(response);
  return data.result;
}
