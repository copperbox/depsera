import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import { DependencyErrorHistory } from '../../db/types';
import { IErrorHistoryStore, HealthTransition, TimelineRange } from '../interfaces/IErrorHistoryStore';
import { ErrorHistoryEntry } from '../types';

const TIMELINE_OFFSETS: Record<TimelineRange, string> = {
  '24h': '-24 hours',
  '7d': '-7 days',
  '30d': '-30 days',
};

/**
 * Store implementation for DependencyErrorHistory entity operations
 */
export class ErrorHistoryStore implements IErrorHistoryStore {
  constructor(private db: Database) {}

  record(
    dependencyId: string,
    error: string | null,
    errorMessage: string | null,
    timestamp: string
  ): DependencyErrorHistory {
    const id = randomUUID();

    this.db
      .prepare(`
        INSERT INTO dependency_error_history (id, dependency_id, error, error_message, recorded_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(id, dependencyId, error, errorMessage, timestamp);

    return this.db
      .prepare('SELECT * FROM dependency_error_history WHERE id = ?')
      .get(id) as DependencyErrorHistory;
  }

  getErrors24h(dependencyId: string): ErrorHistoryEntry[] {
    return this.db
      .prepare(`
        SELECT *
        FROM dependency_error_history
        WHERE dependency_id = ?
          AND recorded_at >= datetime('now', '-24 hours')
        ORDER BY recorded_at DESC
      `)
      .all(dependencyId) as ErrorHistoryEntry[];
  }

  getLastEntry(dependencyId: string): ErrorHistoryEntry | undefined {
    return this.db
      .prepare(`
        SELECT *
        FROM dependency_error_history
        WHERE dependency_id = ?
        ORDER BY recorded_at DESC
        LIMIT 1
      `)
      .get(dependencyId) as ErrorHistoryEntry | undefined;
  }

  isDuplicate(
    dependencyId: string,
    error: string | null,
    errorMessage: string | null
  ): boolean {
    const lastEntry = this.getLastEntry(dependencyId);

    if (!lastEntry) {
      return false;
    }

    // Compare error and errorMessage for deduplication
    return lastEntry.error === error && lastEntry.error_message === errorMessage;
  }

  getErrorCount24h(dependencyId: string): number {
    const row = this.db
      .prepare(`
        SELECT COUNT(*) as count
        FROM dependency_error_history
        WHERE dependency_id = ?
          AND recorded_at >= datetime('now', '-24 hours')
          AND (error IS NOT NULL OR error_message IS NOT NULL)
      `)
      .get(dependencyId) as { count: number };

    return row.count;
  }

  getHealthTransitions(dependencyId: string, range: TimelineRange): HealthTransition[] {
    const offset = TIMELINE_OFFSETS[range];

    // Fetch error history entries within the range, ordered chronologically.
    // A null error/error_message = recovery (healthy), non-null = unhealthy.
    const rows = this.db
      .prepare(`
        SELECT recorded_at, error, error_message
        FROM dependency_error_history
        WHERE dependency_id = ?
          AND recorded_at >= datetime('now', '${offset}')
        ORDER BY recorded_at ASC
      `)
      .all(dependencyId) as Array<{
        recorded_at: string;
        error: string | null;
        error_message: string | null;
      }>;

    return rows.map(row => ({
      timestamp: row.recorded_at,
      state: (row.error === null && row.error_message === null) ? 'healthy' as const : 'unhealthy' as const,
    }));
  }

  deleteOlderThan(timestamp: string): number {
    const result = this.db
      .prepare('DELETE FROM dependency_error_history WHERE recorded_at < ?')
      .run(timestamp);
    return result.changes;
  }

  deleteByDependencyId(dependencyId: string): number {
    const result = this.db
      .prepare('DELETE FROM dependency_error_history WHERE dependency_id = ?')
      .run(dependencyId);
    return result.changes;
  }
}
