import type {
  DriftFlag,
  DriftFlagWithContext,
  DriftFlagCreateInput,
  DriftFlagStatus,
  DriftSummary,
  DriftFlagUpsertResult,
} from '../../db/types';

export interface DriftFlagListOptions {
  status?: DriftFlagStatus;
  drift_type?: string;
  service_id?: string;
  limit?: number;
  offset?: number;
}

export interface IDriftFlagStore {
  // Read
  findById(id: string): DriftFlag | undefined;
  findByTeamId(teamId: string, options?: DriftFlagListOptions): { flags: DriftFlagWithContext[]; total: number };
  findActiveByServiceId(serviceId: string): DriftFlag[];
  findActiveByServiceAndField(serviceId: string, fieldName: string): DriftFlag | undefined;
  findActiveRemovalByServiceId(serviceId: string): DriftFlag | undefined;
  countByTeamId(teamId: string): DriftSummary;

  // Write
  create(input: DriftFlagCreateInput): DriftFlag;
  resolve(id: string, status: 'dismissed' | 'accepted' | 'resolved', userId: string | null): boolean;
  reopen(id: string): boolean;
  updateDetection(id: string, manifestValue: string | null, currentValue: string | null): boolean;
  updateLastDetectedAt(id: string): boolean;

  // Bulk
  bulkResolve(ids: string[], status: 'dismissed' | 'accepted' | 'resolved', userId: string | null): number;
  resolveAllForService(serviceId: string): number;
  resolveAllForTeam(teamId: string): number;

  // Upsert (sync engine)
  upsertFieldDrift(
    serviceId: string,
    fieldName: string,
    manifestValue: string,
    currentValue: string,
    syncHistoryId: string | null,
  ): DriftFlagUpsertResult;
  upsertRemovalDrift(
    serviceId: string,
    syncHistoryId: string | null,
  ): DriftFlagUpsertResult;

  // Cleanup
  deleteOlderThan(timestamp: string, statuses?: DriftFlagStatus[]): number;
}
