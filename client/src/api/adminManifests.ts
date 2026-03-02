import { handleResponse } from './common';
import { withCsrfToken } from './csrf';

export interface AdminManifestEntry {
  team_id: string;
  team_name: string;
  team_key: string | null;
  contact: string | null;
  has_config: boolean;
  manifest_url: string | null;
  is_enabled: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  last_sync_summary: string | null;
  pending_drift_count: number;
}

export interface SyncAllResultEntry {
  team_id: string;
  team_name: string;
  status: string;
  error?: string;
}

export interface SyncAllResult {
  results: SyncAllResultEntry[];
}

export async function fetchAdminManifests(): Promise<AdminManifestEntry[]> {
  const response = await fetch('/api/admin/manifests', {
    credentials: 'include',
  });
  return handleResponse<AdminManifestEntry[]>(response);
}

export async function syncAllManifests(): Promise<SyncAllResult> {
  const response = await fetch('/api/admin/manifests/sync-all', {
    method: 'POST',
    credentials: 'include',
    headers: withCsrfToken({ 'Content-Type': 'application/json' }),
  });
  return handleResponse<SyncAllResult>(response);
}
