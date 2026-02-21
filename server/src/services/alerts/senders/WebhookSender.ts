import { AlertEvent, IAlertSender, SendResult } from '../types';
import logger from '../../../utils/logger';

const WEBHOOK_TIMEOUT_MS = 10_000;

const VALID_METHODS = ['POST', 'PUT', 'PATCH'];

interface WebhookConfig {
  url: string;
  headers?: Record<string, string>;
  method?: string;
}

interface StatusChangePayload {
  event: 'dependency_status_change';
  service: { id: string; name: string };
  dependency: { id: string; name: string };
  oldStatus: string;
  newStatus: string;
  severity: string;
  timestamp: string;
  url?: string;
}

interface PollErrorPayload {
  event: 'poll_error';
  service: { id: string; name: string };
  error: string;
  severity: string;
  timestamp: string;
  url?: string;
}

type WebhookPayload = StatusChangePayload | PollErrorPayload;

/**
 * Sends alert notifications to a generic HTTP webhook endpoint.
 * Delivers a simple JSON payload for integration with arbitrary systems.
 */
export class WebhookSender implements IAlertSender {
  private appBaseUrl: string;

  constructor(appBaseUrl?: string) {
    this.appBaseUrl = (appBaseUrl || process.env.APP_BASE_URL || '').replace(/\/+$/, '');
  }

  async send(event: AlertEvent, configJson: string): Promise<SendResult> {
    let config: WebhookConfig;
    try {
      config = JSON.parse(configJson);
    } catch {
      return { success: false, error: 'Invalid channel config JSON' };
    }

    if (!config.url) {
      return { success: false, error: 'Missing url in config' };
    }

    const method = (config.method || 'POST').toUpperCase();
    if (!VALID_METHODS.includes(method)) {
      return { success: false, error: `Invalid HTTP method: ${method}` };
    }

    const payload = this.buildPayload(event);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...config.headers,
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

      const response = await fetch(config.url, {
        method,
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { success: true };
      }

      const body = await response.text().catch(() => '');
      return { success: false, error: `Webhook returned ${response.status}: ${body}` };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { success: false, error: 'Webhook request timed out (10s)' };
      }
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Webhook request failed: ${message}` };
    }
  }

  private buildPayload(event: AlertEvent): WebhookPayload {
    if (event.eventType === 'poll_error') {
      return this.buildPollErrorPayload(event);
    }
    return this.buildStatusChangePayload(event);
  }

  private buildStatusChangePayload(event: AlertEvent): StatusChangePayload {
    const payload: StatusChangePayload = {
      event: 'dependency_status_change',
      service: { id: event.serviceId, name: event.serviceName },
      dependency: {
        id: event.dependencyId || '',
        name: event.dependencyName || '',
      },
      oldStatus: this.healthLabel(event.previousHealthy),
      newStatus: this.healthLabel(event.currentHealthy),
      severity: event.severity,
      timestamp: event.timestamp,
    };

    if (this.appBaseUrl) {
      payload.url = `${this.appBaseUrl}/services/${event.serviceId}`;
    }

    return payload;
  }

  private buildPollErrorPayload(event: AlertEvent): PollErrorPayload {
    const payload: PollErrorPayload = {
      event: 'poll_error',
      service: { id: event.serviceId, name: event.serviceName },
      error: event.error || 'Unknown error',
      severity: event.severity,
      timestamp: event.timestamp,
    };

    if (this.appBaseUrl) {
      payload.url = `${this.appBaseUrl}/services/${event.serviceId}`;
    }

    return payload;
  }

  private healthLabel(healthy: boolean | null | undefined): string {
    if (healthy === true) return 'healthy';
    if (healthy === false) return 'critical';
    return 'unknown';
  }
}
