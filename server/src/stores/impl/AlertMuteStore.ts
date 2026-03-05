import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import { AlertMute } from '../../db/types';
import { IAlertMuteStore } from '../interfaces/IAlertMuteStore';

export class AlertMuteStore implements IAlertMuteStore {
  constructor(private db: Database) {}

  findById(id: string): AlertMute | undefined {
    return this.db
      .prepare('SELECT * FROM alert_mutes WHERE id = ?')
      .get(id) as AlertMute | undefined;
  }

  findByTeamId(teamId: string, options: { limit?: number; offset?: number } = {}): AlertMute[] {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    return this.db
      .prepare(`
        SELECT * FROM alert_mutes
        WHERE team_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `)
      .all(teamId, limit, offset) as AlertMute[];
  }

  countByTeamId(teamId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM alert_mutes WHERE team_id = ?')
      .get(teamId) as { count: number };
    return row.count;
  }

  findAll(options: { limit?: number; offset?: number; teamId?: string } = {}): AlertMute[] {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.teamId) {
      conditions.push('team_id = ?');
      params.push(options.teamId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return this.db
      .prepare(`
        SELECT * FROM alert_mutes
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset) as AlertMute[];
  }

  countAll(teamId?: string): number {
    if (teamId) {
      return this.countByTeamId(teamId);
    }
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM alert_mutes')
      .get() as { count: number };
    return row.count;
  }

  /**
   * Check if a dependency is effectively muted.
   * Checks per-instance mute first, then team-canonical mute.
   * Expired mutes are ignored.
   */
  isEffectivelyMuted(dependencyId: string, teamId: string, canonicalName?: string | null): boolean {
    // Check per-instance mute
    const instanceMute = this.db
      .prepare(`
        SELECT 1 FROM alert_mutes
        WHERE dependency_id = ?
          AND (expires_at IS NULL OR expires_at > datetime('now'))
        LIMIT 1
      `)
      .get(dependencyId);

    if (instanceMute) return true;

    // Check canonical name mute
    if (canonicalName) {
      const canonicalMute = this.db
        .prepare(`
          SELECT 1 FROM alert_mutes
          WHERE team_id = ?
            AND canonical_name = ?
            AND (expires_at IS NULL OR expires_at > datetime('now'))
          LIMIT 1
        `)
        .get(teamId, canonicalName);

      if (canonicalMute) return true;
    }

    return false;
  }

  isServiceMuted(serviceId: string, teamId: string): boolean {
    const mute = this.db
      .prepare(`
        SELECT 1 FROM alert_mutes
        WHERE service_id = ?
          AND team_id = ?
          AND (expires_at IS NULL OR expires_at > datetime('now'))
        LIMIT 1
      `)
      .get(serviceId, teamId);

    return !!mute;
  }

  create(input: Omit<AlertMute, 'id' | 'created_at'>): AlertMute {
    const id = randomUUID();

    this.db
      .prepare(`
        INSERT INTO alert_mutes (id, team_id, dependency_id, canonical_name, service_id, reason, created_by, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.team_id,
        input.dependency_id ?? null,
        input.canonical_name ?? null,
        input.service_id ?? null,
        input.reason ?? null,
        input.created_by,
        input.expires_at ?? null,
      );

    return this.db
      .prepare('SELECT * FROM alert_mutes WHERE id = ?')
      .get(id) as AlertMute;
  }

  delete(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM alert_mutes WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  deleteExpired(): number {
    const result = this.db
      .prepare("DELETE FROM alert_mutes WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')")
      .run();
    return result.changes;
  }
}
