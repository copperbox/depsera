import { EventEmitter } from 'events';
import db from '../../db';
import { Service } from '../../db/types';
import { ServicePoller } from './ServicePoller';
import { PollResult, PollingEventType, PollCompleteEvent, ServicePollState } from './types';
import { PollStateManager } from './PollStateManager';

const LOOP_INTERVAL_MS = 5000; // 5 seconds
const MAX_CONCURRENT_POLLS = 10;

export class HealthPollingService extends EventEmitter {
  private static instance: HealthPollingService | null = null;
  private loopTimer: NodeJS.Timeout | null = null;
  private stateManager: PollStateManager;
  private pollers: Map<string, ServicePoller> = new Map();
  private isShuttingDown = false;

  private constructor(stateManager?: PollStateManager) {
    super();
    this.stateManager = stateManager || new PollStateManager();
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
      this.addServiceToPolling(service);
    }

    // Start the loop if we have services
    if (this.stateManager.size > 0) {
      this.startLoop();
    }
  }

  startService(serviceId: string): void {
    if (this.isShuttingDown) return;

    // Don't start if already running
    if (this.stateManager.hasService(serviceId)) {
      return;
    }

    const service = db.prepare(`
      SELECT * FROM services WHERE id = ? AND is_active = 1
    `).get(serviceId) as Service | undefined;

    if (!service) {
      console.log(`[Polling] Service ${serviceId} not found or inactive`);
      return;
    }

    this.addServiceToPolling(service);

    console.log(`[Polling] Started polling ${service.name} every ${service.polling_interval}s`);
    this.emit(PollingEventType.SERVICE_STARTED, { serviceId, serviceName: service.name });

    // Start the loop if not already running
    if (!this.loopTimer) {
      this.startLoop();
    }
  }

  stopService(serviceId: string): void {
    const state = this.stateManager.getState(serviceId);
    if (!state) return;

    const serviceName = state.serviceName;

    // Remove from state manager
    this.stateManager.removeService(serviceId);

    // Remove cached poller
    this.pollers.delete(serviceId);

    console.log(`[Polling] Stopped polling ${serviceName}`);
    this.emit(PollingEventType.SERVICE_STOPPED, { serviceId, serviceName });

    // Stop loop if no more services
    if (this.stateManager.size === 0) {
      this.stopLoop();
    }
  }

  restartService(serviceId: string): void {
    this.stopService(serviceId);
    this.startService(serviceId);
  }

  async pollNow(serviceId: string): Promise<PollResult> {
    // Check if service is being actively polled by the loop
    const state = this.stateManager.getState(serviceId);

    if (state && state.isPolling) {
      return {
        success: false,
        dependenciesUpdated: 0,
        statusChanges: [],
        error: 'Service is currently being polled',
        latencyMs: 0,
      };
    }

    // Lock if state exists
    if (state) {
      this.stateManager.markPolling(serviceId, true);
    }

    try {
      let poller = this.pollers.get(serviceId);

      if (!poller) {
        // Service not actively polling, create temporary poller
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

      // Update state if exists
      if (state) {
        this.stateManager.updateAfterPoll(serviceId, result.success, state.pollingInterval);
      }

      return result;
    } finally {
      if (state) {
        this.stateManager.markPolling(serviceId, false);
      }
    }
  }

  async shutdown(): Promise<void> {
    console.log('[Polling] Shutting down health polling service...');
    this.isShuttingDown = true;

    // Stop the main loop
    this.stopLoop();

    // Wait for any in-progress polls to complete (with timeout)
    const maxWait = 5000; // 5 seconds
    const pollCheckInterval = 100; // 100ms
    let waited = 0;

    while (waited < maxWait) {
      const activePollCount = this.stateManager.getActivePollingCount();

      if (activePollCount === 0) break;

      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, pollCheckInterval);
        timer.unref(); // Don't keep process alive for this timer
      });
      waited += pollCheckInterval;
    }

    // Clear all state
    this.stateManager.clear();
    this.pollers.clear();

    // Remove all event listeners
    this.removeAllListeners();

    console.log('[Polling] Health polling service stopped');
  }

  getActivePollers(): string[] {
    return this.stateManager.getServiceIds();
  }

  isPolling(serviceId: string): boolean {
    return this.stateManager.hasService(serviceId);
  }

  // Get poll state for debugging/monitoring
  getPollState(serviceId: string): ServicePollState | undefined {
    return this.stateManager.getState(serviceId);
  }

  private addServiceToPolling(service: Service): void {
    // Add to state manager
    this.stateManager.addService(service);

    // Create and cache ServicePoller for this service
    this.pollers.set(service.id, new ServicePoller(service));
  }

  private startLoop(): void {
    if (this.loopTimer || this.isShuttingDown) return;

    console.log(`[Polling] Starting poll loop (interval: ${LOOP_INTERVAL_MS}ms, max concurrent: ${MAX_CONCURRENT_POLLS})`);

    // Run immediately on start
    this.runPollCycle();

    // Then schedule recurring
    this.loopTimer = setInterval(() => {
      this.runPollCycle();
    }, LOOP_INTERVAL_MS);
  }

  private stopLoop(): void {
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
      console.log('[Polling] Poll loop stopped');
    }
  }

  private async runPollCycle(): Promise<void> {
    if (this.isShuttingDown) return;

    const now = Date.now();

    // Find all services due for polling
    const dueServices = this.stateManager.getDueServices(now);

    if (dueServices.length === 0) return;

    // Limit concurrency
    const batch = dueServices.slice(0, MAX_CONCURRENT_POLLS);

    // Mark all as polling (lock)
    for (const state of batch) {
      this.stateManager.markPolling(state.serviceId, true);
    }

    // Execute polls concurrently
    const results = await Promise.all(
      batch.map(state => this.pollService(state))
    );

    // Process results and update state
    for (const { serviceId, result } of results) {
      const state = this.stateManager.getState(serviceId);
      if (!state) continue; // Service was removed during poll

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
          serviceName: state.serviceName,
          error: result.error,
        });
      }

      // Update state
      this.stateManager.updateAfterPoll(serviceId, result.success, state.pollingInterval);
    }
  }

  private async pollService(state: ServicePollState): Promise<{ serviceId: string; result: PollResult }> {
    const poller = this.pollers.get(state.serviceId);
    if (!poller) {
      return {
        serviceId: state.serviceId,
        result: {
          success: false,
          dependenciesUpdated: 0,
          statusChanges: [],
          error: 'No poller found',
          latencyMs: 0,
        },
      };
    }

    const result = await poller.poll();
    return { serviceId: state.serviceId, result };
  }
}
