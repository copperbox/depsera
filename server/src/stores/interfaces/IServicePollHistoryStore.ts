import { ServicePollHistoryEntry } from '../types';

/**
 * Store interface for service-level poll history (success/failure transitions)
 */
export interface IServicePollHistoryStore {
  /**
   * Record a new poll event (error or recovery)
   */
  record(serviceId: string, error: string | null, timestamp: string): ServicePollHistoryEntry;

  /**
   * Get poll history entries for a service, newest first
   */
  getByServiceId(serviceId: string, limit: number): ServicePollHistoryEntry[];

  /**
   * Get the most recent poll history entry for a service
   */
  getLastEntry(serviceId: string): ServicePollHistoryEntry | undefined;

  /**
   * Get count of error entries (non-recovery) in the last 24 hours
   */
  getErrorCount24h(serviceId: string): number;

  /**
   * Delete entries older than the given timestamp
   */
  deleteOlderThan(timestamp: string): number;

  /**
   * Delete all entries for a service
   */
  deleteByServiceId(serviceId: string): number;
}
