import {
  TeamManifestConfig,
  ManifestConfigCreateInput,
  ManifestConfigUpdateInput,
} from '../../services/manifest/types';

export interface ManifestSyncResultInput {
  last_sync_at: string;
  last_sync_status: string;
  last_sync_error: string | null;
  last_sync_summary: string | null;
}

export interface IManifestConfigStore {
  create(input: ManifestConfigCreateInput): TeamManifestConfig;
  findByTeamId(teamId: string): TeamManifestConfig | undefined;
  update(teamId: string, input: ManifestConfigUpdateInput): TeamManifestConfig | undefined;
  delete(teamId: string): boolean;
  findAll(): TeamManifestConfig[];
  findAllEnabled(): TeamManifestConfig[];
  updateSyncResult(teamId: string, result: ManifestSyncResultInput): boolean;
}
