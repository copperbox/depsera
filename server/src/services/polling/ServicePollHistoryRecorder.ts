import { getStores, StoreRegistry } from '../../stores';
import type { IServicePollHistoryStore } from '../../stores/interfaces';

/**
 * Records service-level poll history with deduplication.
 * - When poll fails: only records if this is the first error after success, or if error changed
 * - When poll succeeds: records a recovery entry if the last state was an error
 */
export class ServicePollHistoryRecorder {
  private store: IServicePollHistoryStore;

  constructor(stores?: StoreRegistry) {
    this.store = (stores || getStores()).servicePollHistory;
  }

  record(serviceId: string, success: boolean, error: string | undefined, timestamp: string): void {
    const lastEntry = this.store.getLastEntry(serviceId);

    if (success) {
      // Only record recovery if the last state was an error
      if (lastEntry && lastEntry.error !== null) {
        this.store.record(serviceId, null, timestamp);
      }
    } else {
      const effectiveError = error ?? 'Unknown poll error';

      // Record if: no previous entry, last was a recovery, or error message changed
      const shouldRecord = !lastEntry ||
        lastEntry.error === null ||
        lastEntry.error !== effectiveError;

      if (shouldRecord) {
        this.store.record(serviceId, effectiveError, timestamp);
      }
    }
  }
}

let recorderInstance: ServicePollHistoryRecorder | null = null;

export function getServicePollHistoryRecorder(): ServicePollHistoryRecorder {
  if (!recorderInstance) {
    recorderInstance = new ServicePollHistoryRecorder();
  }
  return recorderInstance;
}

export function resetServicePollHistoryRecorder(): void {
  recorderInstance = null;
}
