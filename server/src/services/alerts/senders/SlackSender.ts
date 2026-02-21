import { AlertEvent, IAlertSender, SendResult } from '../types';
import logger from '../../../utils/logger';

const SLACK_TIMEOUT_MS = 10_000;

interface SlackConfig {
  webhook_url: string;
}

/**
 * Sends alert notifications to Slack via incoming webhook.
 * Uses Block Kit for rich, scannable message formatting.
 */
export class SlackSender implements IAlertSender {
  private appBaseUrl: string;

  constructor(appBaseUrl?: string) {
    this.appBaseUrl = (appBaseUrl || process.env.APP_BASE_URL || '').replace(/\/+$/, '');
  }

  async send(event: AlertEvent, configJson: string): Promise<SendResult> {
    let config: SlackConfig;
    try {
      config = JSON.parse(configJson);
    } catch {
      return { success: false, error: 'Invalid channel config JSON' };
    }

    if (!config.webhook_url) {
      return { success: false, error: 'Missing webhook_url in config' };
    }

    const payload = this.buildPayload(event);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);

      const response = await fetch(config.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { success: true };
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        logger.warn({ retryAfter }, 'slack webhook rate limited');
        return { success: false, error: `Rate limited by Slack (retry after ${retryAfter || 'unknown'}s)` };
      }

      const body = await response.text().catch(() => '');
      return { success: false, error: `Slack webhook returned ${response.status}: ${body}` };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { success: false, error: 'Slack webhook request timed out (10s)' };
      }
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Slack webhook request failed: ${message}` };
    }
  }

  /**
   * Build a Slack Block Kit payload for the given alert event.
   */
  private buildPayload(event: AlertEvent): object {
    if (event.eventType === 'poll_error') {
      return this.buildPollErrorPayload(event);
    }
    return this.buildStatusChangePayload(event);
  }

  private buildStatusChangePayload(event: AlertEvent): object {
    const emoji = event.currentHealthy ? ':large_green_circle:' : ':red_circle:';
    const statusText = event.currentHealthy ? 'Recovered' : 'Degraded';
    const oldStatus = this.healthLabel(event.previousHealthy);
    const newStatus = this.healthLabel(event.currentHealthy);
    const severityLabel = event.severity === 'critical' ? 'Critical' : 'Warning';
    const timestamp = this.formatTimestamp(event.timestamp);

    const blocks: object[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} ${event.serviceName} - ${statusText}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Dependency:*\n${event.dependencyName || 'N/A'}` },
          { type: 'mrkdwn', text: `*Status:*\n${oldStatus} \u2192 ${newStatus}` },
        ],
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `*Severity:* ${severityLabel}  |  *Time:* ${timestamp}` },
        ],
      },
    ];

    // Add deep link if APP_BASE_URL is configured
    if (this.appBaseUrl) {
      const serviceUrl = `${this.appBaseUrl}/services/${event.serviceId}`;
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View in Depsera', emoji: true },
            url: serviceUrl,
            action_id: 'view_service',
          },
        ],
      });
    }

    return { blocks };
  }

  private buildPollErrorPayload(event: AlertEvent): object {
    const timestamp = this.formatTimestamp(event.timestamp);

    const blocks: object[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `:warning: ${event.serviceName} - Poll Failed`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Error:* ${event.error || 'Unknown error'}`,
        },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `*Severity:* Critical  |  *Time:* ${timestamp}` },
        ],
      },
    ];

    if (this.appBaseUrl) {
      const serviceUrl = `${this.appBaseUrl}/services/${event.serviceId}`;
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View in Depsera', emoji: true },
            url: serviceUrl,
            action_id: 'view_service',
          },
        ],
      });
    }

    return { blocks };
  }

  private healthLabel(healthy: boolean | null | undefined): string {
    if (healthy === true) return 'Healthy';
    if (healthy === false) return 'Unhealthy';
    return 'Unknown';
  }

  private formatTimestamp(iso: string): string {
    try {
      const date = new Date(iso);
      return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
    } catch {
      return iso;
    }
  }
}
