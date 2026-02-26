import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import { StatusChangeEventRow } from '../../db/types';
import { IStatusChangeEventStore, UnstableDependencyRow } from '../interfaces/IStatusChangeEventStore';

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

  getUnstable(hours: number, limit: number): UnstableDependencyRow[] {
    return this.db
      .prepare(`
        SELECT
          dependency_name,
          COUNT(*) as change_count,
          (SELECT e2.service_name FROM status_change_events e2
           WHERE e2.dependency_name = e.dependency_name
           ORDER BY e2.recorded_at DESC LIMIT 1) as service_name,
          (SELECT e2.service_id FROM status_change_events e2
           WHERE e2.dependency_name = e.dependency_name
           ORDER BY e2.recorded_at DESC LIMIT 1) as service_id,
          (SELECT e2.current_healthy FROM status_change_events e2
           WHERE e2.dependency_name = e.dependency_name
           ORDER BY e2.recorded_at DESC LIMIT 1) as current_healthy,
          MAX(recorded_at) as last_change_at
        FROM status_change_events e
        WHERE recorded_at >= datetime('now', ?)
        GROUP BY dependency_name
        ORDER BY change_count DESC, last_change_at DESC
        LIMIT ?
      `)
      .all(`-${hours} hours`, limit) as UnstableDependencyRow[];
  }

  deleteOlderThan(timestamp: string): number {
    const result = this.db
      .prepare('DELETE FROM status_change_events WHERE recorded_at < ?')
      .run(timestamp);
    return result.changes;
  }
}
