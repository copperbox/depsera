import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import { DependencyLatencyHistory } from '../../db/types';
import {
  ILatencyHistoryStore,
  LatencyDataPoint,
  LatencyBucket,
  LatencyRange,
} from '../interfaces/ILatencyHistoryStore';
import { LatencyStats } from '../types';

/**
 * Range-to-bucket configuration for time-bucketed queries.
 * strftime expression determines bucket granularity;
 * offset is a SQLite datetime modifier for the time window.
 */
/**
 * SQL expressions for bucket timestamp grouping by range.
 * - 1h/6h: 1-minute buckets
 * - 24h: 15-minute buckets
 * - 7d: 1-hour buckets
 * - 30d: 6-hour buckets
 */
const RANGE_CONFIG: Record<LatencyRange, { bucketExpr: string; offset: string }> = {
  '1h': {
    bucketExpr: "strftime('%Y-%m-%dT%H:%M:00.000Z', recorded_at)",
    offset: '-1 hours',
  },
  '6h': {
    bucketExpr: "strftime('%Y-%m-%dT%H:%M:00.000Z', recorded_at)",
    offset: '-6 hours',
  },
  '24h': {
    bucketExpr: "strftime('%Y-%m-%dT%H:', recorded_at) || substr('0' || (CAST(strftime('%M', recorded_at) AS INTEGER) / 15 * 15), -2) || ':00.000Z'",
    offset: '-24 hours',
  },
  '7d': {
    bucketExpr: "strftime('%Y-%m-%dT%H:00:00.000Z', recorded_at)",
    offset: '-7 days',
  },
  '30d': {
    bucketExpr: "strftime('%Y-%m-%dT', recorded_at) || substr('0' || (CAST(strftime('%H', recorded_at) AS INTEGER) / 6 * 6), -2) || ':00:00.000Z'",
    offset: '-30 days',
  },
};

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

  getLatencyBuckets(dependencyId: string, range: LatencyRange): LatencyBucket[] {
    const config = RANGE_CONFIG[range];

    const rows = this.db
      .prepare(`
        SELECT
          ${config.bucketExpr} as timestamp,
          MIN(latency_ms) as min,
          ROUND(AVG(latency_ms)) as avg,
          MAX(latency_ms) as max,
          COUNT(*) as count
        FROM dependency_latency_history
        WHERE dependency_id = ?
          AND recorded_at >= datetime('now', '${config.offset}')
        GROUP BY timestamp
        ORDER BY timestamp ASC
      `)
      .all(dependencyId) as LatencyBucket[];

    return rows;
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
