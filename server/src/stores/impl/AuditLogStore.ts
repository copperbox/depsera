import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import { AuditLogEntry, AuditLogEntryWithUser } from '../../db/types';
import { IAuditLogStore, AuditLogListOptions } from '../interfaces/IAuditLogStore';

export class AuditLogStore implements IAuditLogStore {
  constructor(private db: Database) {}

  create(entry: Omit<AuditLogEntry, 'id' | 'created_at'>): AuditLogEntry {
    const id = randomUUID();

    this.db
      .prepare(`
        INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, details, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        entry.user_id,
        entry.action,
        entry.resource_type,
        entry.resource_id ?? null,
        entry.details ?? null,
        entry.ip_address ?? null,
      );

    return this.db
      .prepare('SELECT * FROM audit_log WHERE id = ?')
      .get(id) as AuditLogEntry;
  }

  findAll(options: AuditLogListOptions = {}): AuditLogEntryWithUser[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.startDate) {
      conditions.push('a.created_at >= ?');
      params.push(options.startDate);
    }
    if (options.endDate) {
      conditions.push('a.created_at <= ?');
      params.push(options.endDate);
    }
    if (options.userId) {
      conditions.push('a.user_id = ?');
      params.push(options.userId);
    }
    if (options.action) {
      conditions.push('a.action = ?');
      params.push(options.action);
    }
    if (options.resourceType) {
      conditions.push('a.resource_type = ?');
      params.push(options.resourceType);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    return this.db
      .prepare(`
        SELECT a.*, u.email AS user_email, u.name AS user_name
        FROM audit_log a
        LEFT JOIN users u ON a.user_id = u.id
        ${whereClause}
        ORDER BY a.created_at DESC
        LIMIT ? OFFSET ?
      `)
      .all(...params, limit, offset) as AuditLogEntryWithUser[];
  }

  count(options: AuditLogListOptions = {}): number {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.startDate) {
      conditions.push('created_at >= ?');
      params.push(options.startDate);
    }
    if (options.endDate) {
      conditions.push('created_at <= ?');
      params.push(options.endDate);
    }
    if (options.userId) {
      conditions.push('user_id = ?');
      params.push(options.userId);
    }
    if (options.action) {
      conditions.push('action = ?');
      params.push(options.action);
    }
    if (options.resourceType) {
      conditions.push('resource_type = ?');
      params.push(options.resourceType);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM audit_log ${whereClause}`)
      .get(...params) as { count: number };

    return row.count;
  }

  deleteOlderThan(timestamp: string): number {
    const result = this.db
      .prepare('DELETE FROM audit_log WHERE created_at < ?')
      .run(timestamp);
    return result.changes;
  }
}
