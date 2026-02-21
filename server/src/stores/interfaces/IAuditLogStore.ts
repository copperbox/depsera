import { AuditLogEntry, AuditLogEntryWithUser } from '../../db/types';

export interface AuditLogListOptions {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  userId?: string;
  action?: string;
  resourceType?: string;
}

export interface IAuditLogStore {
  create(entry: Omit<AuditLogEntry, 'id' | 'created_at'>): AuditLogEntry;
  findAll(options?: AuditLogListOptions): AuditLogEntryWithUser[];
  count(options?: AuditLogListOptions): number;
  deleteOlderThan(timestamp: string): number;
}
