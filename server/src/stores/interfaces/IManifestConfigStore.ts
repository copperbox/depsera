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
  findById(configId: string): TeamManifestConfig | undefined;
  findByTeamId(teamId: string): TeamManifestConfig[];
  update(configId: string, input: ManifestConfigUpdateInput): TeamManifestConfig | undefined;
  delete(configId: string): boolean;
  findAll(): TeamManifestConfig[];
  findAllEnabled(): TeamManifestConfig[];
  updateSyncResult(configId: string, result: ManifestSyncResultInput): boolean;
}
