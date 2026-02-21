import { EventEmitter } from 'events';
import { getStores, StoreRegistry } from '../../stores';
import { SettingsService } from '../settings/SettingsService';
import { PollingEventType, StatusChangeEvent } from '../polling/types';
import { AlertSeverityFilter, AlertChannelType } from '../../db/types';
import { FlapProtector } from './FlapProtector';
import { AlertRateLimiter } from './AlertRateLimiter';
import { AlertEvent, AlertSeverity, IAlertSender, PendingRetry, SendResult } from './types';
import logger from '../../utils/logger';

const RETRY_DELAY_MS = 30_000; // 30 seconds

/**
 * AlertService is the core alert dispatch engine.
 *
 * It listens to HealthPollingService events (STATUS_CHANGE and POLL_ERROR),
 * evaluates alert rules, applies flap protection and rate limiting, and
 * dispatches alerts to configured channels.
 *
 * Singleton pattern, started alongside HealthPollingService.
 */
export class AlertService {
  private static instance: AlertService | null = null;

  private stores: StoreRegistry;
  private settingsService: SettingsService;
  private flapProtector: FlapProtector;
  private rateLimiter: AlertRateLimiter;
  private senders: Map<AlertChannelType, IAlertSender> = new Map();
  private pendingRetries: PendingRetry[] = [];
  private pollingService: EventEmitter | null = null;

  constructor(stores?: StoreRegistry, settingsService?: SettingsService) {
    this.stores = stores || getStores();
    this.settingsService = settingsService || SettingsService.getInstance(this.stores.settings);
    this.flapProtector = new FlapProtector();
    this.rateLimiter = new AlertRateLimiter();
  }

  static getInstance(): AlertService {
    if (!AlertService.instance) {
      AlertService.instance = new AlertService();
    }
    return AlertService.instance;
  }

  static resetInstance(): void {
    if (AlertService.instance) {
      AlertService.instance.shutdown();
      AlertService.instance = null;
    }
  }

  /**
   * Register a sender for a channel type.
   * Called before start() to plug in Slack, webhook, etc.
   */
  registerSender(channelType: AlertChannelType, sender: IAlertSender): void {
    this.senders.set(channelType, sender);
  }

  /**
   * Subscribe to polling service events.
   */
  start(pollingService: EventEmitter): void {
    this.pollingService = pollingService;

    pollingService.on(PollingEventType.STATUS_CHANGE, this.handleStatusChange);
    pollingService.on(PollingEventType.POLL_ERROR, this.handlePollError);

    logger.info('alert service started');
  }

  /**
   * Graceful shutdown: remove event listeners and flush pending retries.
   */
  shutdown(): void {
    // Remove event listeners
    if (this.pollingService) {
      this.pollingService.removeListener(PollingEventType.STATUS_CHANGE, this.handleStatusChange);
      this.pollingService.removeListener(PollingEventType.POLL_ERROR, this.handlePollError);
      this.pollingService = null;
    }

    // Clear pending retry timers
    for (const retry of this.pendingRetries) {
      clearTimeout(retry.timer);
    }
    this.pendingRetries = [];

    // Clear in-memory state
    this.flapProtector.clear();
    this.rateLimiter.clear();

    logger.info('alert service stopped');
  }

  /**
   * Handle a status change event from the polling service.
   * Bound as arrow function to preserve `this` context.
   */
  private handleStatusChange = (event: StatusChangeEvent): void => {
    const severity = this.determineSeverity(event);
    const alertEvent: AlertEvent = {
      eventType: 'status_change',
      serviceId: event.serviceId,
      serviceName: event.serviceName,
      dependencyName: event.dependencyName,
      severity,
      previousHealthy: event.previousHealthy,
      currentHealthy: event.currentHealthy,
      timestamp: event.timestamp,
    };

    // Resolve dependency ID for history tracking
    this.resolveDependencyId(event.serviceId, event.dependencyName)
      .then(depId => {
        alertEvent.dependencyId = depId;
        return this.processEvent(alertEvent);
      })
      .catch(err => {
        logger.error({ err, event: alertEvent }, 'failed to process status change alert');
      });
  };

  /**
   * Handle a poll error event from the polling service.
   */
  private handlePollError = (event: { serviceId: string; serviceName: string; error: string }): void => {
    const alertEvent: AlertEvent = {
      eventType: 'poll_error',
      serviceId: event.serviceId,
      serviceName: event.serviceName,
      severity: 'critical',
      error: event.error,
      timestamp: new Date().toISOString(),
    };

    this.processEvent(alertEvent).catch(err => {
      logger.error({ err, event: alertEvent }, 'failed to process poll error alert');
    });
  };

  /**
   * Core dispatch logic: look up team, evaluate rules, apply protections, dispatch.
   */
  async processEvent(event: AlertEvent): Promise<void> {
    // 1. Look up the owning team for the service
    const service = this.stores.services.findById(event.serviceId);
    if (!service) {
      logger.warn({ serviceId: event.serviceId }, 'alert: service not found');
      return;
    }
    const teamId = service.team_id;

    // 2. Find active alert rules for the team
    const rules = this.stores.alertRules.findActiveByTeamId(teamId);
    if (rules.length === 0) {
      logger.info({ teamId, serviceId: event.serviceId }, 'alert: no active rules for team');
      return;
    }

    // 3. Check severity filter: does any rule match this event's severity?
    const matchingRules = rules.filter(rule => this.matchesSeverity(rule.severity_filter, event.severity));
    if (matchingRules.length === 0) {
      logger.info({ teamId, severity: event.severity }, 'alert: no rules match severity');
      return;
    }

    // 4. Find active alert channels for the team
    const channels = this.stores.alertChannels.findActiveByTeamId(teamId);
    if (channels.length === 0) {
      logger.info({ teamId }, 'alert: no active channels for team');
      return;
    }

    // 5. Check flap protection
    const flapKey = event.dependencyId || event.serviceId;
    const cooldownMs = this.settingsService.get('alert_cooldown_minutes') * 60_000;

    if (this.flapProtector.isSuppressed(flapKey, cooldownMs)) {
      // Record suppressed alert for all channels
      for (const channel of channels) {
        this.recordHistory(channel.id, event, 'suppressed');
      }
      logger.info({ flapKey, event: event.eventType }, 'alert suppressed by flap protection');
      return;
    }

    // 6. Check rate limit
    const maxPerHour = this.settingsService.get('alert_rate_limit_per_hour');

    if (this.rateLimiter.isLimited(teamId, maxPerHour)) {
      // Record suppressed alert for all channels
      for (const channel of channels) {
        this.recordHistory(channel.id, event, 'suppressed');
      }
      logger.info({ teamId, event: event.eventType }, 'alert suppressed by rate limit');
      return;
    }

    // 7. Dispatch to all active channels
    logger.info({ teamId, eventType: event.eventType, serviceName: event.serviceName, channels: channels.length }, 'alert: dispatching to channels');
    this.flapProtector.recordAlert(flapKey);
    this.rateLimiter.recordAlert(teamId);

    for (const channel of channels) {
      const sender = this.senders.get(channel.channel_type);

      if (!sender) {
        logger.warn({ channelType: channel.channel_type }, 'no sender registered for channel type');
        this.recordHistory(channel.id, event, 'failed');
        continue;
      }

      try {
        const result = await sender.send(event, channel.config);

        if (result.success) {
          this.recordHistory(channel.id, event, 'sent');
        } else {
          this.recordHistory(channel.id, event, 'failed');
          this.scheduleRetry(channel.id, channel.channel_type, channel.config, event);
        }
      } catch (err) {
        logger.error({ err, channelId: channel.id }, 'alert dispatch failed');
        this.recordHistory(channel.id, event, 'failed');
        this.scheduleRetry(channel.id, channel.channel_type, channel.config, event);
      }
    }
  }

  /**
   * Send a test alert to a specific channel (used by API routes).
   */
  async sendTestAlert(channelType: AlertChannelType, config: string): Promise<SendResult> {
    const sender = this.senders.get(channelType);
    if (!sender) {
      return { success: false, error: `No sender registered for channel type: ${channelType}` };
    }

    const testEvent: AlertEvent = {
      eventType: 'status_change',
      serviceId: 'test',
      serviceName: 'Test Service',
      dependencyName: 'test-dependency',
      severity: 'critical',
      previousHealthy: true,
      currentHealthy: false,
      timestamp: new Date().toISOString(),
    };

    return sender.send(testEvent, config);
  }

  /**
   * Determine severity from a status change event.
   * Transition to unhealthy = critical, transition to healthy = warning (recovery).
   */
  private determineSeverity(event: StatusChangeEvent): AlertSeverity {
    return event.currentHealthy ? 'warning' : 'critical';
  }

  /**
   * Check if a severity filter matches the event severity.
   */
  private matchesSeverity(filter: AlertSeverityFilter, severity: AlertSeverity): boolean {
    switch (filter) {
      case 'all':
        return true;
      case 'critical':
        return severity === 'critical';
      case 'warning':
        return severity === 'critical' || severity === 'warning';
      default:
        return false;
    }
  }

  /**
   * Resolve dependency ID from service ID and dependency name.
   */
  private async resolveDependencyId(serviceId: string, dependencyName: string): Promise<string | undefined> {
    try {
      const deps = this.stores.dependencies.findByServiceId(serviceId);
      const dep = deps.find(d => d.name === dependencyName);
      return dep?.id;
    } catch {
      return undefined;
    }
  }

  /**
   * Record an alert attempt in alert_history.
   * Fire-and-forget: errors are logged but never block dispatch.
   */
  private recordHistory(channelId: string, event: AlertEvent, status: 'sent' | 'failed' | 'suppressed'): void {
    try {
      this.stores.alertHistory.create({
        alert_channel_id: channelId,
        service_id: event.serviceId,
        dependency_id: event.dependencyId || null,
        event_type: event.eventType,
        payload: JSON.stringify(event),
        sent_at: new Date().toISOString(),
        status,
      });
    } catch (err) {
      logger.error({ err, channelId, status }, 'failed to record alert history');
    }
  }

  /**
   * Schedule a single retry after RETRY_DELAY_MS.
   * Only retries once per failed dispatch.
   */
  private scheduleRetry(
    channelId: string,
    channelType: AlertChannelType,
    config: string,
    event: AlertEvent,
  ): void {
    const sender = this.senders.get(channelType);
    if (!sender) return;

    const timer = setTimeout(async () => {
      // Remove from pending list
      this.pendingRetries = this.pendingRetries.filter(r => r.timer !== timer);

      try {
        const result = await sender.send(event, config);
        if (result.success) {
          this.recordHistory(channelId, event, 'sent');
          logger.info({ channelId }, 'alert retry succeeded');
        } else {
          logger.warn({ channelId, error: result.error }, 'alert retry failed');
        }
      } catch (err) {
        logger.error({ err, channelId }, 'alert retry threw');
      }
    }, RETRY_DELAY_MS);

    timer.unref(); // Don't keep the process alive for retries

    this.pendingRetries.push({ timer, channelId, event });
  }

  /** Visible for testing */
  get pendingRetryCount(): number {
    return this.pendingRetries.length;
  }

  /** Visible for testing */
  getFlapProtector(): FlapProtector {
    return this.flapProtector;
  }

  /** Visible for testing */
  getRateLimiter(): AlertRateLimiter {
    return this.rateLimiter;
  }
}
