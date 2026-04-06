import { Span, CreateSpanInput } from '../../db/types';

export interface ISpanStore {
  bulkInsert(spans: CreateSpanInput[]): number;
  findByTraceId(traceId: string): Span[];
  findByServiceName(serviceName: string, options?: { since?: string; limit?: number }): Span[];
  deleteOlderThan(timestamp: string): number;
}
