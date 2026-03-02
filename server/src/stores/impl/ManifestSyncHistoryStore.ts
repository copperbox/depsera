import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import { ManifestSyncHistoryEntry } from '../../services/manifest/types';
import {
  IManifestSyncHistoryStore,
  ManifestSyncHistoryCreateInput,
} from '../interfaces/IManifestSyncHistoryStore';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export class ManifestSyncHistoryStore implements IManifestSyncHistoryStore {
  constructor(private db: Database) {}

  create(entry: ManifestSyncHistoryCreateInput): ManifestSyncHistoryEntry {
    const id = randomUUID();

    this.db
      .prepare(
        `INSERT INTO manifest_sync_history
           (id, team_id, trigger_type, triggered_by, manifest_url, status, summary, errors, warnings, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        entry.team_id,
        entry.trigger_type,
        entry.triggered_by,
        entry.manifest_url,
        entry.status,
        entry.summary,
        entry.errors,
        entry.warnings,
        entry.duration_ms
      );

    return this.db
      .prepare('SELECT * FROM manifest_sync_history WHERE id = ?')
      .get(id) as ManifestSyncHistoryEntry;
  }

  findByTeamId(
    teamId: string,
    options?: { limit?: number; offset?: number }
  ): { history: ManifestSyncHistoryEntry[]; total: number } {
    const limit = Math.min(options?.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = options?.offset ?? 0;

    const total = this.db
      .prepare(
        'SELECT COUNT(*) as count FROM manifest_sync_history WHERE team_id = ?'
      )
      .get(teamId) as { count: number };

    const history = this.db
      .prepare(
        `SELECT * FROM manifest_sync_history
         WHERE team_id = ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(teamId, limit, offset) as ManifestSyncHistoryEntry[];

    return { history, total: total.count };
  }

  deleteOlderThan(timestamp: string): number {
    const result = this.db
      .prepare('DELETE FROM manifest_sync_history WHERE created_at < ?')
      .run(timestamp);
    return result.changes;
  }
}
