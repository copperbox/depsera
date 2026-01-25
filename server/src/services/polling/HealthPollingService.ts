import { EventEmitter } from 'events';
import db from '../../db';
import { Service } from '../../db/types';
import { ServicePoller } from './ServicePoller';
import { PollResult, PollingEventType, PollCompleteEvent } from './types';

export class HealthPollingService extends EventEmitter {
  private static instance: HealthPollingService | null = null;
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private pollers: Map<string, ServicePoller> = new Map();
  private isShuttingDown = false;

  private constructor() {
    super();
  }

  static getInstance(): HealthPollingService {
    if (!HealthPollingService.instance) {
      HealthPollingService.instance = new HealthPollingService();
    }
    return HealthPollingService.instance;
  }

  // For testing - reset the singleton
  static resetInstance(): void {
    if (HealthPollingService.instance) {
      HealthPollingService.instance.shutdown();
      HealthPollingService.instance = null;
    }
  }

  startAll(): void {
    if (this.isShuttingDown) return;

    const services = db.prepare(`
      SELECT * FROM services WHERE is_active = 1
    `).all() as Service[];

    console.log(`[Polling] Starting health polling for ${services.length} active services`);

    for (const service of services) {
      this.startService(service.id);
    }
  }

  startService(serviceId: string): void {
    if (this.isShuttingDown) return;

    // Don't start if already running
    if (this.timers.has(serviceId)) {
      return;
    }

    const service = db.prepare(`
      SELECT * FROM services WHERE id = ? AND is_active = 1
    `).get(serviceId) as Service | undefined;

    if (!service) {
      console.log(`[Polling] Service ${serviceId} not found or inactive`);
      return;
    }

    const poller = new ServicePoller(service);
    this.pollers.set(serviceId, poller);

    console.log(`[Polling] Started polling ${service.name} every ${service.polling_interval}s`);
    this.emit(PollingEventType.SERVICE_STARTED, { serviceId, serviceName: service.name });

    // Start with an immediate poll, then schedule next
    this.pollAndSchedule(serviceId);
  }

  stopService(serviceId: string): void {
    const timer = this.timers.get(serviceId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(serviceId);
    }

    const poller = this.pollers.get(serviceId);
    if (poller) {
      console.log(`[Polling] Stopped polling ${poller.serviceName}`);
      this.emit(PollingEventType.SERVICE_STOPPED, { serviceId, serviceName: poller.serviceName });
      this.pollers.delete(serviceId);
    }
  }

  restartService(serviceId: string): void {
    this.stopService(serviceId);
    this.startService(serviceId);
  }

  async pollNow(serviceId: string): Promise<PollResult> {
    let poller = this.pollers.get(serviceId);

    if (!poller) {
      // Service might not be actively polling, create a temporary poller
      const service = db.prepare(`
        SELECT * FROM services WHERE id = ?
      `).get(serviceId) as Service | undefined;

      if (!service) {
        return {
          success: false,
          dependenciesUpdated: 0,
          statusChanges: [],
          error: 'Service not found',
          latencyMs: 0,
        };
      }

      poller = new ServicePoller(service);
    }

    const result = await poller.poll();

    // Emit events for status changes
    for (const change of result.statusChanges) {
      this.emit(PollingEventType.STATUS_CHANGE, change);
    }

    this.emit(PollingEventType.POLL_COMPLETE, {
      serviceId,
      ...result,
    } as PollCompleteEvent);

    return result;
  }

  async shutdown(): Promise<void> {
    console.log('[Polling] Shutting down health polling service...');
    this.isShuttingDown = true;

    // Clear all timers
    for (const [serviceId, timer] of this.timers) {
      clearTimeout(timer);
      this.timers.delete(serviceId);
    }

    // Clear all pollers
    this.pollers.clear();

    console.log('[Polling] Health polling service stopped');
  }

  getActivePollers(): string[] {
    return Array.from(this.pollers.keys());
  }

  isPolling(serviceId: string): boolean {
    return this.pollers.has(serviceId);
  }

  private async pollAndSchedule(serviceId: string): Promise<void> {
    if (this.isShuttingDown) return;

    const poller = this.pollers.get(serviceId);
    if (!poller) return;

    try {
      const result = await poller.poll();

      // Emit poll complete event
      this.emit(PollingEventType.POLL_COMPLETE, {
        serviceId,
        ...result,
      } as PollCompleteEvent);

      // Emit status change events
      for (const change of result.statusChanges) {
        this.emit(PollingEventType.STATUS_CHANGE, change);
      }

      if (!result.success) {
        this.emit(PollingEventType.POLL_ERROR, {
          serviceId,
          serviceName: poller.serviceName,
          error: result.error,
        });
      }
    } catch (error) {
      console.error(`[Polling] Unexpected error polling ${poller.serviceName}:`, error);
    }

    // Schedule next poll
    this.scheduleNext(serviceId);
  }

  private scheduleNext(serviceId: string): void {
    if (this.isShuttingDown) return;

    const poller = this.pollers.get(serviceId);
    if (!poller) return;

    const delay = poller.getNextPollDelay();

    const timer = setTimeout(() => {
      this.pollAndSchedule(serviceId);
    }, delay);

    this.timers.set(serviceId, timer);
  }
}
