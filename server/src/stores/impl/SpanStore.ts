import { randomUUID } from 'crypto';
import { Database } from 'better-sqlite3';
import { Span, CreateSpanInput } from '../../db/types';
import { ISpanStore } from '../interfaces/ISpanStore';

export class SpanStore implements ISpanStore {
  constructor(private db: Database) {}

  bulkInsert(spans: CreateSpanInput[]): number {
    if (spans.length === 0) return 0;

    const stmt = this.db.prepare(`
      INSERT INTO spans (
        id, trace_id, span_id, parent_span_id, service_name, team_id,
        name, kind, start_time, end_time, duration_ms,
        status_code, status_message, attributes, resource_attributes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAll = this.db.transaction((items: CreateSpanInput[]) => {
      let count = 0;
      for (const span of items) {
        stmt.run(
          randomUUID(),
          span.trace_id,
          span.span_id,
          span.parent_span_id ?? null,
          span.service_name,
          span.team_id,
          span.name,
          span.kind ?? 0,
          span.start_time,
          span.end_time,
          span.duration_ms,
          span.status_code ?? 0,
          span.status_message ?? null,
          span.attributes ?? null,
          span.resource_attributes ?? null
        );
        count++;
      }
      return count;
    });

    return insertAll(spans);
  }

  findByTraceId(traceId: string): Span[] {
    return this.db
      .prepare('SELECT * FROM spans WHERE trace_id = ? ORDER BY start_time ASC')
      .all(traceId) as Span[];
  }

  findByServiceName(
    serviceName: string,
    options?: { since?: string; limit?: number }
  ): Span[] {
    const conditions = ['service_name = ?'];
    const params: unknown[] = [serviceName];

    if (options?.since) {
      conditions.push('start_time >= ?');
      params.push(options.since);
    }

    const limit = options?.limit ?? 1000;
    return this.db
      .prepare(
        `SELECT * FROM spans WHERE ${conditions.join(' AND ')} ORDER BY start_time DESC LIMIT ?`
      )
      .all(...params, limit) as Span[];
  }

  deleteOlderThan(timestamp: string): number {
    const result = this.db
      .prepare('DELETE FROM spans WHERE created_at < ?')
      .run(timestamp);
    return result.changes;
  }
}
