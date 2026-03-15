import { randomUUID, randomBytes, createHash } from 'crypto';
import { Database } from 'better-sqlite3';
import { TeamApiKey, CreateTeamApiKeyInput } from '../../db/types';
import { ITeamApiKeyStore } from '../interfaces/ITeamApiKeyStore';

export class TeamApiKeyStore implements ITeamApiKeyStore {
  constructor(private db: Database) {}

  findByTeamId(teamId: string): TeamApiKey[] {
    return this.db
      .prepare(
        `SELECT * FROM team_api_keys WHERE team_id = ? ORDER BY created_at DESC`,
      )
      .all(teamId) as TeamApiKey[];
  }

  findByKeyHash(hash: string): TeamApiKey | undefined {
    return this.db
      .prepare(`SELECT * FROM team_api_keys WHERE key_hash = ?`)
      .get(hash) as TeamApiKey | undefined;
  }

  create(input: CreateTeamApiKeyInput): TeamApiKey & { rawKey: string } {
    const id = randomUUID();
    const rawKey = `dps_${randomBytes(16).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 8);

    this.db
      .prepare(
        `INSERT INTO team_api_keys (id, team_id, name, key_hash, key_prefix, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.team_id, input.name, keyHash, keyPrefix, input.created_by ?? null);

    const record = this.db
      .prepare(`SELECT * FROM team_api_keys WHERE id = ?`)
      .get(id) as TeamApiKey;

    return { ...record, rawKey };
  }

  delete(id: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM team_api_keys WHERE id = ?`)
      .run(id);
    return result.changes > 0;
  }

  updateLastUsed(id: string): void {
    this.db
      .prepare(
        `UPDATE team_api_keys SET last_used_at = datetime('now') WHERE id = ?`,
      )
      .run(id);
  }
}
