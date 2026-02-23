/**
 * Severity levels for alert events.
 * Maps to AlertSeverityFilter for rule matching.
 */
export type AlertSeverity = 'critical' | 'warning';

/**
 * An alert event produced from polling events.
 */
export interface AlertEvent {
  eventType: 'status_change' | 'poll_error';
  serviceId: string;
  serviceName: string;
  dependencyId?: string;
  dependencyName?: string;
  severity: AlertSeverity;
  previousHealthy?: boolean | null;
  currentHealthy?: boolean;
  error?: string;
  timestamp: string;
}

/**
 * Result of sending an alert to a channel.
 */
export interface SendResult {
  success: boolean;
  error?: string;
}

/**
 * Interface for alert channel senders (Slack, webhook, etc.).
 * Each channel type implements this to handle dispatching.
 */
export interface IAlertSender {
  send(event: AlertEvent, config: string): Promise<SendResult>;
}

/**
 * Registry entry for tracking retry timers during shutdown.
 */
export interface PendingRetry {
  timer: NodeJS.Timeout;
  channelId: string;
  event: AlertEvent;
}
