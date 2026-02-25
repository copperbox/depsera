import { StatusChangeEventRow } from '../../db/types';

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

  deleteOlderThan(timestamp: string): number;
}
