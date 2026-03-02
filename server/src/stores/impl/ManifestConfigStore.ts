import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import {
  TeamManifestConfig,
  ManifestConfigCreateInput,
  ManifestConfigUpdateInput,
  DEFAULT_SYNC_POLICY,
  ManifestSyncPolicy,
} from '../../services/manifest/types';
import {
  IManifestConfigStore,
  ManifestSyncResultInput,
} from '../interfaces/IManifestConfigStore';

export class ManifestConfigStore implements IManifestConfigStore {
  constructor(private db: Database) {}

  create(input: ManifestConfigCreateInput): TeamManifestConfig {
    const id = randomUUID();
    const syncPolicyJson = input.sync_policy
      ? JSON.stringify(input.sync_policy)
      : null;
    const isEnabled = input.is_enabled === false ? 0 : 1;

    this.db
      .prepare(
        `INSERT INTO team_manifest_config (id, team_id, manifest_url, is_enabled, sync_policy)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(team_id) DO UPDATE SET
           manifest_url = excluded.manifest_url,
           is_enabled = excluded.is_enabled,
           sync_policy = excluded.sync_policy,
           updated_at = datetime('now')`
      )
      .run(id, input.team_id, input.manifest_url, isEnabled, syncPolicyJson);

    return this.db
      .prepare('SELECT * FROM team_manifest_config WHERE team_id = ?')
      .get(input.team_id) as TeamManifestConfig;
  }

  findByTeamId(teamId: string): TeamManifestConfig | undefined {
    return this.db
      .prepare('SELECT * FROM team_manifest_config WHERE team_id = ?')
      .get(teamId) as TeamManifestConfig | undefined;
  }

  update(
    teamId: string,
    input: ManifestConfigUpdateInput
  ): TeamManifestConfig | undefined {
    const existing = this.findByTeamId(teamId);
    if (!existing) return undefined;

    const fields: string[] = [];
    const params: unknown[] = [];

    if (input.manifest_url !== undefined) {
      fields.push('manifest_url = ?');
      params.push(input.manifest_url);
    }

    if (input.is_enabled !== undefined) {
      fields.push('is_enabled = ?');
      params.push(input.is_enabled ? 1 : 0);
    }

    if (input.sync_policy !== undefined) {
      const currentPolicy: ManifestSyncPolicy = existing.sync_policy
        ? JSON.parse(existing.sync_policy)
        : { ...DEFAULT_SYNC_POLICY };
      const merged = { ...currentPolicy, ...input.sync_policy };
      fields.push('sync_policy = ?');
      params.push(JSON.stringify(merged));
    }

    if (fields.length === 0) return existing;

    fields.push("updated_at = datetime('now')");
    params.push(teamId);

    this.db
      .prepare(
        `UPDATE team_manifest_config SET ${fields.join(', ')} WHERE team_id = ?`
      )
      .run(...params);

    return this.db
      .prepare('SELECT * FROM team_manifest_config WHERE team_id = ?')
      .get(teamId) as TeamManifestConfig;
  }

  delete(teamId: string): boolean {
    const result = this.db
      .prepare('DELETE FROM team_manifest_config WHERE team_id = ?')
      .run(teamId);
    return result.changes > 0;
  }

  findAll(): TeamManifestConfig[] {
    return this.db
      .prepare('SELECT * FROM team_manifest_config ORDER BY created_at ASC')
      .all() as TeamManifestConfig[];
  }

  findAllEnabled(): TeamManifestConfig[] {
    return this.db
      .prepare(
        'SELECT * FROM team_manifest_config WHERE is_enabled = 1 ORDER BY created_at ASC'
      )
      .all() as TeamManifestConfig[];
  }

  updateSyncResult(teamId: string, result: ManifestSyncResultInput): boolean {
    const res = this.db
      .prepare(
        `UPDATE team_manifest_config
         SET last_sync_at = ?, last_sync_status = ?, last_sync_error = ?, last_sync_summary = ?, updated_at = datetime('now')
         WHERE team_id = ?`
      )
      .run(
        result.last_sync_at,
        result.last_sync_status,
        result.last_sync_error,
        result.last_sync_summary,
        teamId
      );
    return res.changes > 0;
  }
}
