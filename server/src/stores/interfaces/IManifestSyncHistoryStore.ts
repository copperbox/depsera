import { ManifestSyncHistoryEntry } from '../../services/manifest/types';

export interface ManifestSyncHistoryCreateInput {
  team_id: string;
  trigger_type: 'manual' | 'scheduled';
  triggered_by: string | null;
  manifest_url: string;
  status: string;
  summary: string | null;
  errors: string | null;
  warnings: string | null;
  duration_ms: number | null;
}

export interface IManifestSyncHistoryStore {
  create(entry: ManifestSyncHistoryCreateInput): ManifestSyncHistoryEntry;
  findByTeamId(
    teamId: string,
    options?: { limit?: number; offset?: number }
  ): { history: ManifestSyncHistoryEntry[]; total: number };
  deleteOlderThan(timestamp: string): number;
}
