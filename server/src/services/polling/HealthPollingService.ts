import { EventEmitter } from 'events';
import { getStores, StoreRegistry } from '../../stores';
import type { IServiceStore } from '../../stores/interfaces';
import { Service } from '../../db/types';
import { ServicePoller } from './ServicePoller';
import { PollResult, PollingEventType, PollCompleteEvent, ServicePollState } from './types';
import { PollStateManager } from './PollStateManager';
import { CircuitBreaker } from './CircuitBreaker';
import { ExponentialBackoff } from './backoff';
import { PollCache } from './PollCache';
import { HostRateLimiter } from './HostRateLimiter';
import { PollDeduplicator } from './PollDeduplicator';

const POLL_CYCLE_MS = 5000; // 5 second tick interval

export class HealthPollingService extends EventEmitter {
  private static instance: HealthPollingService | null = null;
  private loopTimer: NodeJS.Timeout | null = null;
  private stateManager: PollStateManager;
  private pollers: Map<string, ServicePoller> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private backoffs: Map<string, ExponentialBackoff> = new Map();
  private pollCache: PollCache;
  private hostRateLimiter: HostRateLimiter;
  private pollDeduplicator: PollDeduplicator;
  private isShuttingDown = false;
  private serviceStore: IServiceStore;

  private constructor(stateManager?: PollStateManager, stores?: StoreRegistry) {
    super();
    this.stateManager = stateManager || new PollStateManager();
    this.serviceStore = (stores || getStores()).services;
    this.pollCache = new PollCache();
    this.hostRateLimiter = new HostRateLimiter();
    this.pollDeduplicator = new PollDeduplicator();
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
    /* istanbul ignore if -- Shutdown guard; service not started during shutdown */
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

    // Remove from state manager and caches
    this.stateManager.removeService(serviceId);
    this.pollers.delete(serviceId);
    this.circuitBreakers.delete(serviceId);
    this.backoffs.delete(serviceId);
    this.pollCache.remove(serviceId);

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
      /* istanbul ignore next -- Status changes during manual poll are tested via integration */
      for (const change of result.statusChanges) {
        this.emit(PollingEventType.STATUS_CHANGE, change);
      }

      this.emit(PollingEventType.POLL_COMPLETE, {
        serviceId,
        ...result,
      } as PollCompleteEvent);

      // Store poll result in database
      this.serviceStore.updatePollResult(serviceId, result.success, result.error);

      // Update backoff/circuit on manual poll
      /* istanbul ignore if -- Manual poll success path tested via integration */
      if (result.success) {
        this.getBackoff(serviceId).reset();
        this.getCircuitBreaker(serviceId).recordSuccess();
      } else {
        this.getBackoff(serviceId).getNextDelay();
        this.getCircuitBreaker(serviceId).recordFailure();
      }

      // Invalidate cache so next tick respects the new timing
      this.pollCache.invalidate(serviceId);

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
    this.circuitBreakers.clear();
    this.backoffs.clear();
    this.pollCache.clear();
    this.hostRateLimiter.clear();
    this.pollDeduplicator.clear();

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
   * and updates pollers whose endpoint or interval changed.
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
          this.circuitBreakers.delete(id);
          this.backoffs.delete(id);
          this.pollCache.remove(id);
        }
      }
    }

    // Add new services and update changed ones
    for (const service of activeServices) {
      if (!trackedIds.has(service.id)) {
        this.addServiceToPolling(service);
      } else {
        // Update poller if endpoint or interval changed
        const state = this.stateManager.getState(service.id);
        if (state) {
          let changed = false;
          if (state.healthEndpoint !== service.health_endpoint) {
            state.healthEndpoint = service.health_endpoint;
            changed = true;
          }
          /* istanbul ignore next -- Default poll interval; services usually have interval set */
          const newInterval = service.poll_interval_ms ?? 30000;
          if (state.pollIntervalMs !== newInterval) {
            state.pollIntervalMs = newInterval;
            this.pollCache.invalidate(service.id);
            changed = true;
          }
          if (changed) {
            const poller = this.pollers.get(service.id);
            if (poller) {
              poller.updateService(service);
            }
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

  private getCircuitBreaker(serviceId: string): CircuitBreaker {
    let cb = this.circuitBreakers.get(serviceId);
    if (!cb) {
      cb = new CircuitBreaker();
      this.circuitBreakers.set(serviceId, cb);
    }
    return cb;
  }

  private getBackoff(serviceId: string): ExponentialBackoff {
    let bo = this.backoffs.get(serviceId);
    if (!bo) {
      bo = new ExponentialBackoff();
      this.backoffs.set(serviceId, bo);
    }
    return bo;
  }

  private startLoop(): void {
    /* istanbul ignore if -- Guard against duplicate loop or shutdown */
    if (this.loopTimer || this.isShuttingDown) return;

    console.log(`[Polling] Starting poll loop (tick: ${POLL_CYCLE_MS}ms)`);

    // Run immediately on start
    this.runPollCycle();

    // Then schedule recurring
    /* istanbul ignore next -- setInterval callback tested via integration tests */
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
    /* istanbul ignore if -- Shutdown guard; poll cycle stopped during shutdown */
    if (this.isShuttingDown) return;

    // Sync with database to pick up new/removed/changed services
    this.syncServices();

    // Determine which services are eligible for polling this tick
    const allStates = this.stateManager.getAllStates()
      .filter(state => !state.isPolling);

    const toPoll: ServicePollState[] = [];

    for (const state of allStates) {
      const cb = this.getCircuitBreaker(state.serviceId);

      if (!cb.canAttempt()) {
        // Circuit is open — schedule next check after cooldown
        this.pollCache.markPolled(state.serviceId, cb.getCooldownMs());
        state.circuitState = cb.getState();
        continue;
      }

      if (!this.pollCache.shouldPoll(state.serviceId)) {
        continue;
      }

      toPoll.push(state);
    }

    if (toPoll.length === 0) return;

    // Apply host rate limiting — skip services whose host is at capacity
    const eligible: ServicePollState[] = [];
    const acquiredHosts: Map<string, string[]> = new Map(); // hostname -> serviceIds

    for (const state of toPoll) {
      const hostname = HostRateLimiter.getHostname(state.healthEndpoint);
      if (this.hostRateLimiter.acquire(hostname)) {
        eligible.push(state);
        const ids = acquiredHosts.get(hostname) || [];
        ids.push(state.serviceId);
        acquiredHosts.set(hostname, ids);
      }
      // Skipped services remain eligible next tick (not marked as polling)
    }

    if (eligible.length === 0) return;

    // Mark eligible services as polling (lock)
    for (const state of eligible) {
      this.stateManager.markPolling(state.serviceId, true);
    }

    // Execute polls with deduplication — services sharing the same endpoint URL
    // share a single HTTP request via PollDeduplicator
    const results = await Promise.allSettled(
      eligible.map(state => this.pollServiceDeduped(state))
    );

    // Release host rate limiter slots
    for (const [hostname, serviceIds] of acquiredHosts) {
      for (let i = 0; i < serviceIds.length; i++) {
        this.hostRateLimiter.release(hostname);
      }
    }

    // Process results and update state
    for (const result of results) {
      if (result.status === 'rejected') continue;

      const { serviceId, result: pollResult } = result.value;
      const state = this.stateManager.getState(serviceId);
      if (!state) continue; // Service was removed during poll

      const cb = this.getCircuitBreaker(serviceId);
      const backoff = this.getBackoff(serviceId);
      const previousCircuitState = cb.getState();

      // Update in-memory state
      state.lastPolled = Date.now();
      state.isPolling = false;

      /* istanbul ignore if -- Poll cycle success path tested via integration */
      if (pollResult.success) {
        state.consecutiveFailures = 0;
        backoff.reset();
        cb.recordSuccess();
        this.pollCache.markPolled(serviceId, state.pollIntervalMs);

        // Emit circuit close if transitioning from half-open
        if (previousCircuitState === 'half-open') {
          this.emit(PollingEventType.CIRCUIT_CLOSE, {
            serviceId,
            serviceName: state.serviceName,
          });
        }
      } else {
        state.consecutiveFailures++;
        const delay = backoff.getNextDelay();
        cb.recordFailure();
        // Use the larger of poll interval and backoff delay
        this.pollCache.markPolled(serviceId, Math.max(state.pollIntervalMs, delay));

        // Emit circuit open if just opened
        /* istanbul ignore if -- Circuit open event; requires 10+ consecutive failures */
        if (cb.getState() === 'open' && previousCircuitState !== 'open') {
          this.emit(PollingEventType.CIRCUIT_OPEN, {
            serviceId,
            serviceName: state.serviceName,
          });
        }
      }

      state.circuitState = cb.getState();

      // Persist poll result to database
      this.serviceStore.updatePollResult(serviceId, pollResult.success, pollResult.error);

      // Emit poll complete event
      this.emit(PollingEventType.POLL_COMPLETE, {
        serviceId,
        ...pollResult,
      } as PollCompleteEvent);

      // Emit status change events
      /* istanbul ignore next -- Status change events tested via integration */
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
    for (const state of eligible) {
      if (state.isPolling) {
        state.isPolling = false;
      }
    }
  }

  private async pollServiceDeduped(state: ServicePollState): Promise<{ serviceId: string; result: PollResult }> {
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

    const result = await this.pollDeduplicator.deduplicate(
      state.healthEndpoint,
      () => poller.poll()
    );
    return { serviceId: state.serviceId, result };
  }
}
