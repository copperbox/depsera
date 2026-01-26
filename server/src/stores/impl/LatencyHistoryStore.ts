import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import { DependencyLatencyHistory } from '../../db/types';
import {
  ILatencyHistoryStore,
  LatencyDataPoint,
} from '../interfaces/ILatencyHistoryStore';
import { LatencyStats } from '../types';

/**
 * Store implementation for DependencyLatencyHistory entity operations
 */
export class LatencyHistoryStore implements ILatencyHistoryStore {
  constructor(private db: Database) {}

  record(
    dependencyId: string,
    latencyMs: number,
    timestamp: string
  ): DependencyLatencyHistory {
    const id = randomUUID();

    this.db
      .prepare(`
        INSERT INTO dependency_latency_history (id, dependency_id, latency_ms, recorded_at)
        VALUES (?, ?, ?, ?)
      `)
      .run(id, dependencyId, latencyMs, timestamp);

    return this.db
      .prepare('SELECT * FROM dependency_latency_history WHERE id = ?')
      .get(id) as DependencyLatencyHistory;
  }

  getStats24h(dependencyId: string): LatencyStats {
    const row = this.db
      .prepare(`
        SELECT
          AVG(latency_ms) as avg,
          MIN(latency_ms) as min,
          MAX(latency_ms) as max,
          COUNT(*) as count
        FROM dependency_latency_history
        WHERE dependency_id = ?
          AND recorded_at >= datetime('now', '-24 hours')
      `)
      .get(dependencyId) as {
        avg: number | null;
        min: number | null;
        max: number | null;
        count: number;
      };

    return {
      avgLatencyMs24h: row.avg !== null ? Math.round(row.avg) : null,
      minLatencyMs24h: row.min,
      maxLatencyMs24h: row.max,
      dataPointCount: row.count,
    };
  }

  getAvgLatency24h(dependencyId: string): number | null {
    const row = this.db
      .prepare(`
        SELECT ROUND(AVG(latency_ms)) as avg
        FROM dependency_latency_history
        WHERE dependency_id = ?
          AND recorded_at >= datetime('now', '-24 hours')
      `)
      .get(dependencyId) as { avg: number | null };

    return row.avg;
  }

  getHistory(
    dependencyId: string,
    options?: {
      startTime?: string;
      endTime?: string;
      limit?: number;
    }
  ): LatencyDataPoint[] {
    const conditions: string[] = ['dependency_id = ?'];
    const params: unknown[] = [dependencyId];

    if (options?.startTime) {
      conditions.push('recorded_at >= ?');
      params.push(options.startTime);
    }

    if (options?.endTime) {
      conditions.push('recorded_at <= ?');
      params.push(options.endTime);
    }

    let query = `
      SELECT latency_ms, recorded_at
      FROM dependency_latency_history
      WHERE ${conditions.join(' AND ')}
      ORDER BY recorded_at DESC
    `;

    if (options?.limit) {
      query += ` LIMIT ${options.limit}`;
    }

    return this.db.prepare(query).all(...params) as LatencyDataPoint[];
  }

  deleteOlderThan(timestamp: string): number {
    const result = this.db
      .prepare('DELETE FROM dependency_latency_history WHERE recorded_at < ?')
      .run(timestamp);
    return result.changes;
  }

  deleteByDependencyId(dependencyId: string): number {
    const result = this.db
      .prepare('DELETE FROM dependency_latency_history WHERE dependency_id = ?')
      .run(dependencyId);
    return result.changes;
  }
}
