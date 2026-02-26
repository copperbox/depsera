import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import { IServicePollHistoryStore } from '../interfaces/IServicePollHistoryStore';
import { ServicePollHistoryEntry } from '../types';

/**
 * Store implementation for service-level poll history
 */
export class ServicePollHistoryStore implements IServicePollHistoryStore {
  constructor(private db: Database) {}

  record(serviceId: string, error: string | null, timestamp: string): ServicePollHistoryEntry {
    const id = randomUUID();

    this.db
      .prepare(`
        INSERT INTO service_poll_history (id, service_id, error, recorded_at)
        VALUES (?, ?, ?, ?)
      `)
      .run(id, serviceId, error, timestamp);

    return this.db
      .prepare('SELECT * FROM service_poll_history WHERE id = ?')
      .get(id) as ServicePollHistoryEntry;
  }

  getByServiceId(serviceId: string, limit: number): ServicePollHistoryEntry[] {
    return this.db
      .prepare(`
        SELECT * FROM service_poll_history
        WHERE service_id = ?
        ORDER BY recorded_at DESC
        LIMIT ?
      `)
      .all(serviceId, limit) as ServicePollHistoryEntry[];
  }

  getLastEntry(serviceId: string): ServicePollHistoryEntry | undefined {
    return this.db
      .prepare(`
        SELECT * FROM service_poll_history
        WHERE service_id = ?
        ORDER BY recorded_at DESC
        LIMIT 1
      `)
      .get(serviceId) as ServicePollHistoryEntry | undefined;
  }

  getErrorCount24h(serviceId: string): number {
    const row = this.db
      .prepare(`
        SELECT COUNT(*) as count FROM service_poll_history
        WHERE service_id = ?
          AND recorded_at >= datetime('now', '-24 hours')
          AND error IS NOT NULL
      `)
      .get(serviceId) as { count: number };

    return row.count;
  }

  deleteOlderThan(timestamp: string): number {
    return this.db
      .prepare('DELETE FROM service_poll_history WHERE recorded_at < ?')
      .run(timestamp).changes;
  }

  deleteByServiceId(serviceId: string): number {
    return this.db
      .prepare('DELETE FROM service_poll_history WHERE service_id = ?')
      .run(serviceId).changes;
  }
}
