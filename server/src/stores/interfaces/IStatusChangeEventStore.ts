import { StatusChangeEventRow } from '../../db/types';

export interface UnstableDependencyRow {
  dependency_name: string;
  service_name: string;
  service_id: string;
  change_count: number;
  current_healthy: number; // SQLite boolean (0 or 1)
  last_change_at: string;
}

export interface IStatusChangeEventStore {
  record(
    serviceId: string,
    serviceName: string,
    dependencyName: string,
    previousHealthy: boolean | null,
    currentHealthy: boolean,
    timestamp: string
  ): StatusChangeEventRow;

  getRecent(limit: number): StatusChangeEventRow[];

  getUnstable(hours: number, limit: number): UnstableDependencyRow[];

  deleteOlderThan(timestamp: string): number;
}
