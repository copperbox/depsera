import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import { AlertHistoryEntry } from '../../db/types';
import { IAlertHistoryStore, AlertHistoryListOptions } from '../interfaces/IAlertHistoryStore';

export class AlertHistoryStore implements IAlertHistoryStore {
  constructor(private db: Database) {}

  create(entry: Omit<AlertHistoryEntry, 'id'>): AlertHistoryEntry {
    const id = randomUUID();

    this.db
      .prepare(`
        INSERT INTO alert_history (id, alert_channel_id, service_id, dependency_id, event_type, payload, sent_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        entry.alert_channel_id,
        entry.service_id,
        entry.dependency_id ?? null,
        entry.event_type,
        entry.payload ?? null,
        entry.sent_at,
        entry.status,
      );

    return this.db
      .prepare('SELECT * FROM alert_history WHERE id = ?')
      .get(id) as AlertHistoryEntry;
  }

  findByChannelId(channelId: string, options: AlertHistoryListOptions = {}): AlertHistoryEntry[] {
    const conditions: string[] = ['alert_channel_id = ?'];
    const params: unknown[] = [channelId];

    this.applyFilters(conditions, params, options);

    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    return this.db
      .prepare(`
        SELECT * FROM alert_history
        WHERE ${conditions.join(' AND ')}
        ORDER BY sent_at DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset) as AlertHistoryEntry[];
  }

  findByTeamId(teamId: string, options: AlertHistoryListOptions = {}): AlertHistoryEntry[] {
    const conditions: string[] = ['ac.team_id = ?'];
    const params: unknown[] = [teamId];

    if (options.channelId) {
      conditions.push('ah.alert_channel_id = ?');
      params.push(options.channelId);
    }
    if (options.serviceId) {
      conditions.push('ah.service_id = ?');
      params.push(options.serviceId);
    }
    if (options.status) {
      conditions.push('ah.status = ?');
      params.push(options.status);
    }
    if (options.startDate) {
      conditions.push('ah.sent_at >= ?');
      params.push(options.startDate);
    }
    if (options.endDate) {
      conditions.push('ah.sent_at <= ?');
      params.push(options.endDate);
    }

    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    return this.db
      .prepare(`
        SELECT ah.* FROM alert_history ah
        JOIN alert_channels ac ON ah.alert_channel_id = ac.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY ah.sent_at DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset) as AlertHistoryEntry[];
  }

  count(options: AlertHistoryListOptions = {}): number {
    const conditions: string[] = [];
    const params: unknown[] = [];

    this.applyFilters(conditions, params, options);

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM alert_history ${whereClause}`)
      .get(...params) as { count: number };

    return row.count;
  }

  deleteOlderThan(timestamp: string): number {
    const result = this.db
      .prepare('DELETE FROM alert_history WHERE sent_at < ?')
      .run(timestamp);
    return result.changes;
  }

  private applyFilters(conditions: string[], params: unknown[], options: AlertHistoryListOptions): void {
    if (options.channelId) {
      conditions.push('alert_channel_id = ?');
      params.push(options.channelId);
    }
    if (options.serviceId) {
      conditions.push('service_id = ?');
      params.push(options.serviceId);
    }
    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }
    if (options.startDate) {
      conditions.push('sent_at >= ?');
      params.push(options.startDate);
    }
    if (options.endDate) {
      conditions.push('sent_at <= ?');
      params.push(options.endDate);
    }
  }
}
