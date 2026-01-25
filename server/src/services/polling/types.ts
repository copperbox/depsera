export interface StatusChangeEvent {
  serviceId: string;
  serviceName: string;
  dependencyName: string;
  previousHealthy: boolean | null;
  currentHealthy: boolean;
  timestamp: string;
}

export interface PollResult {
  success: boolean;
  dependenciesUpdated: number;
  statusChanges: StatusChangeEvent[];
  error?: string;
  latencyMs: number;
}

export interface PollCompleteEvent extends PollResult {
  serviceId: string;
}

export enum PollingEventType {
  STATUS_CHANGE = 'status:change',
  POLL_COMPLETE = 'poll:complete',
  POLL_ERROR = 'poll:error',
  SERVICE_STARTED = 'service:started',
  SERVICE_STOPPED = 'service:stopped',
}
