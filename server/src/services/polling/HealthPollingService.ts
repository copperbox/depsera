import { EventEmitter } from 'events';
import { getStores, StoreRegistry } from '../../stores';
import type { IServiceStore } from '../../stores/interfaces';
import { Service } from '../../db/types';
import { ServicePoller } from './ServicePoller';
import { PollResult, PollingEventType, PollCompleteEvent, ServicePollState } from './types';
import { PollStateManager } from './PollStateManager';

const POLL_CYCLE_MS = 30000; // 30 seconds

export class HealthPollingService extends EventEmitter {
  private static instance: HealthPollingService | null = null;
  private loopTimer: NodeJS.Timeout | null = null;
  private stateManager: PollStateManager;
  private pollers: Map<string, ServicePoller> = new Map();
  private isShuttingDown = false;
  private serviceStore: IServiceStore;

  private constructor(stateManager?: PollStateManager, stores?: StoreRegistry) {
    super();
    this.stateManager = stateManager || new PollStateManager();
    this.serviceStore = (stores || getStores()).services;
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

    const services = this.serviceStore.findActive();

    console.log(`[Polling] Starting health polling for ${services.length} active services`);

    for (const service of services) {
      this.addServiceToPolling(service);
    }

    // Always start the loop — syncServices will pick up new services
    this.startLoop();
  }

  startService(serviceId: string): void {
    if (this.isShuttingDown) return;

    // Don't start if already running
    if (this.stateManager.hasService(serviceId)) {
      return;
    }

    const service = this.serviceStore.findById(serviceId);

    if (!service || !service.is_active) {
      console.log(`[Polling] Service ${serviceId} not found or inactive`);
      return;
    }

    this.addServiceToPolling(service);

    console.log(`[Polling] Started polling ${service.name}`);
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
        const service = this.serviceStore.findById(serviceId);

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

      // Store poll result in database
      this.serviceStore.updatePollResult(serviceId, result.success, result.error);

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

  /**
   * Sync the poller's service list with the database.
   * Adds new active services, removes deleted/deactivated ones,
   * and updates pollers whose endpoint changed.
   */
  private syncServices(): void {
    const activeServices = this.serviceStore.findActive();
    const activeIds = new Set(activeServices.map(s => s.id));
    const trackedIds = new Set(this.stateManager.getServiceIds());

    // Remove services that are no longer active or were deleted
    for (const id of trackedIds) {
      if (!activeIds.has(id)) {
        const state = this.stateManager.getState(id);
        if (state && !state.isPolling) {
          this.stateManager.removeService(id);
          this.pollers.delete(id);
        }
      }
    }

    // Add new services and update changed ones
    for (const service of activeServices) {
      if (!trackedIds.has(service.id)) {
        this.addServiceToPolling(service);
      } else {
        // Update poller if endpoint changed
        const state = this.stateManager.getState(service.id);
        if (state && state.healthEndpoint !== service.health_endpoint) {
          state.healthEndpoint = service.health_endpoint;
          const poller = this.pollers.get(service.id);
          if (poller) {
            poller.updateService(service);
          }
        }
      }
    }
  }

  private addServiceToPolling(service: Service): void {
    // Add to state manager
    this.stateManager.addService(service);

    // Create and cache ServicePoller for this service
    this.pollers.set(service.id, new ServicePoller(service));
  }

  private startLoop(): void {
    if (this.loopTimer || this.isShuttingDown) return;

    console.log(`[Polling] Starting poll loop (cycle: ${POLL_CYCLE_MS}ms)`);

    // Run immediately on start
    this.runPollCycle();

    // Then schedule recurring
    this.loopTimer = setInterval(() => {
      this.runPollCycle();
    }, POLL_CYCLE_MS);
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

    // Sync with database to pick up new/removed/changed services
    this.syncServices();

    // Get ALL services (no scheduling logic)
    const allStates = this.stateManager.getAllStates()
      .filter(state => !state.isPolling);

    if (allStates.length === 0) return;

    // Mark all as polling (lock)
    for (const state of allStates) {
      this.stateManager.markPolling(state.serviceId, true);
    }

    // Execute all polls concurrently
    const results = await Promise.allSettled(
      allStates.map(state => this.pollService(state))
    );

    // Process results and update state
    for (const result of results) {
      if (result.status === 'rejected') continue;

      const { serviceId, result: pollResult } = result.value;
      const state = this.stateManager.getState(serviceId);
      if (!state) continue; // Service was removed during poll

      // Update in-memory state
      state.lastPolled = Date.now();
      state.isPolling = false;
      if (pollResult.success) {
        state.consecutiveFailures = 0;
      } else {
        state.consecutiveFailures++;
      }

      // Persist poll result to database
      this.serviceStore.updatePollResult(serviceId, pollResult.success, pollResult.error);

      // Emit poll complete event
      this.emit(PollingEventType.POLL_COMPLETE, {
        serviceId,
        ...pollResult,
      } as PollCompleteEvent);

      // Emit status change events
      for (const change of pollResult.statusChanges) {
        this.emit(PollingEventType.STATUS_CHANGE, change);
      }

      if (!pollResult.success) {
        this.emit(PollingEventType.POLL_ERROR, {
          serviceId,
          serviceName: state.serviceName,
          error: pollResult.error,
        });
      }
    }

    // Ensure any remaining locks are released (e.g., if Promise.allSettled had rejections)
    for (const state of allStates) {
      if (state.isPolling) {
        state.isPolling = false;
      }
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
