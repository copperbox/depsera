import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import { StatusChangeEventRow } from '../../db/types';
import { IStatusChangeEventStore } from '../interfaces/IStatusChangeEventStore';

export class StatusChangeEventStore implements IStatusChangeEventStore {
  constructor(private db: Database) {}

  record(
    serviceId: string,
    serviceName: string,
    dependencyName: string,
    previousHealthy: boolean | null,
    currentHealthy: boolean,
    timestamp: string
  ): StatusChangeEventRow {
    const id = randomUUID();
    const prevValue = previousHealthy === null ? null : previousHealthy ? 1 : 0;
    const currValue = currentHealthy ? 1 : 0;

    this.db
      .prepare(`
        INSERT INTO status_change_events (id, service_id, service_name, dependency_name, previous_healthy, current_healthy, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(id, serviceId, serviceName, dependencyName, prevValue, currValue, timestamp);

    return this.db
      .prepare('SELECT * FROM status_change_events WHERE id = ?')
      .get(id) as StatusChangeEventRow;
  }

  getRecent(limit: number): StatusChangeEventRow[] {
    return this.db
      .prepare(`
        SELECT *
        FROM status_change_events
        ORDER BY recorded_at DESC
        LIMIT ?
      `)
      .all(limit) as StatusChangeEventRow[];
  }

  deleteOlderThan(timestamp: string): number {
    const result = this.db
      .prepare('DELETE FROM status_change_events WHERE recorded_at < ?')
      .run(timestamp);
    return result.changes;
  }
}
