import { Service } from '../../db/types';
import { PollStateManager } from './PollStateManager';
import { HealthPollingService } from './HealthPollingService';

const createService = (
  id: string,
  name: string,
  overrides: Partial<Service> = {}
): Service => ({
  id,
  name,
  team_id: 'team-1',
  health_endpoint: `http://localhost:4000/${name}/dependencies`,
  metrics_endpoint: null,
  poll_interval_ms: 30000,
  is_active: 1,
  last_poll_success: null,
  last_poll_error: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

function createPollingService(activeServices: Service[]) {
  const stateManager = new PollStateManager();
  const mockServiceStore = {
    findActive: jest.fn(() => activeServices),
    findById: jest.fn(),
    findAll: jest.fn(),
    findByIdWithTeam: jest.fn(),
    findAllWithTeam: jest.fn(),
    findActiveWithTeam: jest.fn(),
    findByTeamId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    updatePollResult: jest.fn(),
    exists: jest.fn(),
    count: jest.fn(),
  };

  const stores = {
    services: mockServiceStore,
    dependencies: {},
    associations: {},
    teams: {},
    users: {},
    latencyHistory: {},
    errorHistory: {},
  };

  // Reset singleton so we can create fresh instances
  HealthPollingService.resetInstance();

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const instance = new (HealthPollingService as any)(stateManager, stores);

  return {
    instance: instance as HealthPollingService,
    stateManager,
    pollers: (instance as any).pollers as Map<string, unknown>,
    syncServices: () => (instance as any).syncServices(),
    pollCache: (instance as any).pollCache,
    circuitBreakers: (instance as any).circuitBreakers as Map<string, unknown>,
    backoffs: (instance as any).backoffs as Map<string, unknown>,
    hostRateLimiter: (instance as any).hostRateLimiter,
    pollDeduplicator: (instance as any).pollDeduplicator,
    /* eslint-enable @typescript-eslint/no-explicit-any */
    mockServiceStore,
  };
}

describe('HealthPollingService - syncServices', () => {
  afterEach(() => {
    HealthPollingService.resetInstance();
  });

  it('should add new services from the database', () => {
    const svc1 = createService('svc-1', 'service-a');
    const svc2 = createService('svc-2', 'service-b');
    const { stateManager, pollers, syncServices } = createPollingService([svc1, svc2]);

    expect(stateManager.size).toBe(0);

    syncServices();

    expect(stateManager.size).toBe(2);
    expect(stateManager.hasService('svc-1')).toBe(true);
    expect(stateManager.hasService('svc-2')).toBe(true);
    expect(pollers.has('svc-1')).toBe(true);
    expect(pollers.has('svc-2')).toBe(true);
  });

  it('should remove services no longer in the database', () => {
    const svc1 = createService('svc-1', 'service-a');
    const { stateManager, pollers, syncServices } = createPollingService([svc1]);

    syncServices();

    // Manually add svc-2 which is not in the DB
    stateManager.addService(createService('svc-2', 'service-b'));
    pollers.set('svc-2', {});
    expect(stateManager.size).toBe(2);

    syncServices();

    expect(stateManager.size).toBe(1);
    expect(stateManager.hasService('svc-1')).toBe(true);
    expect(stateManager.hasService('svc-2')).toBe(false);
    expect(pollers.has('svc-2')).toBe(false);
  });

  it('should not remove a service that is currently polling', () => {
    const { stateManager, pollers, syncServices } = createPollingService([]);

    stateManager.addService(createService('svc-1', 'service-a'));
    pollers.set('svc-1', {});
    stateManager.markPolling('svc-1', true);

    syncServices();

    expect(stateManager.hasService('svc-1')).toBe(true);
  });

  it('should update poller when endpoint changes', () => {
    const svc1 = createService('svc-1', 'service-a');
    const { stateManager, syncServices, mockServiceStore } = createPollingService([svc1]);

    syncServices();

    expect(stateManager.getState('svc-1')!.healthEndpoint).toBe(
      'http://localhost:4000/service-a/dependencies'
    );

    const updatedSvc1 = createService('svc-1', 'service-a', {
      health_endpoint: 'http://localhost:5000/service-a/health',
    });
    mockServiceStore.findActive.mockReturnValue([updatedSvc1]);

    syncServices();

    expect(stateManager.getState('svc-1')!.healthEndpoint).toBe(
      'http://localhost:5000/service-a/health'
    );
  });

  it('should preserve failure state for unchanged services', () => {
    const svc1 = createService('svc-1', 'service-a');
    const { stateManager, syncServices } = createPollingService([svc1]);

    syncServices();

    const state = stateManager.getState('svc-1')!;
    state.consecutiveFailures = 2;

    syncServices();

    expect(stateManager.getState('svc-1')!.consecutiveFailures).toBe(2);
  });

  it('should track poll_interval_ms from service', () => {
    const svc1 = createService('svc-1', 'service-a', { poll_interval_ms: 60000 });
    const { stateManager, syncServices } = createPollingService([svc1]);

    syncServices();

    expect(stateManager.getState('svc-1')!.pollIntervalMs).toBe(60000);
  });

  it('should update poll interval when it changes and invalidate cache', () => {
    const svc1 = createService('svc-1', 'service-a', { poll_interval_ms: 30000 });
    const { stateManager, syncServices, mockServiceStore, pollCache } = createPollingService([svc1]);

    syncServices();
    pollCache.markPolled('svc-1', 30000);

    const updatedSvc1 = createService('svc-1', 'service-a', { poll_interval_ms: 60000 });
    mockServiceStore.findActive.mockReturnValue([updatedSvc1]);

    syncServices();

    expect(stateManager.getState('svc-1')!.pollIntervalMs).toBe(60000);
    // Cache should be invalidated so service is eligible for polling
    expect(pollCache.shouldPoll('svc-1')).toBe(true);
  });

  it('should initialize circuit state as closed', () => {
    const svc1 = createService('svc-1', 'service-a');
    const { stateManager, syncServices } = createPollingService([svc1]);

    syncServices();

    expect(stateManager.getState('svc-1')!.circuitState).toBe('closed');
  });

  it('should clean up circuit breakers and backoffs on service removal', () => {
    const svc1 = createService('svc-1', 'service-a');
    const { stateManager, pollers, syncServices, circuitBreakers, backoffs, mockServiceStore } =
      createPollingService([svc1]);

    syncServices();
    // Simulate that circuit breaker and backoff were created
    circuitBreakers.set('svc-1', {});
    backoffs.set('svc-1', {});

    mockServiceStore.findActive.mockReturnValue([]);
    syncServices();

    expect(stateManager.hasService('svc-1')).toBe(false);
    expect(circuitBreakers.has('svc-1')).toBe(false);
    expect(backoffs.has('svc-1')).toBe(false);
  });
});

describe('HealthPollingService - lifecycle methods', () => {
  afterEach(async () => {
    await HealthPollingService.resetInstance();
  });

  it('should start all active services', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const svc2 = createService('svc-2', 'service-b');
    const { instance, stateManager } = createPollingService([svc1, svc2]);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    instance.startAll();

    expect(stateManager.size).toBe(2);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Starting health polling for 2 active services')
    );

    await instance.shutdown();
    logSpy.mockRestore();
  });

  it('should not start if shutting down', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance, stateManager } = createPollingService([svc1]);

    await instance.shutdown();
    instance.startAll();

    expect(stateManager.size).toBe(0);
  });

  it('should not start service if already running', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance, stateManager } = createPollingService([svc1]);

    instance.startAll();
    expect(stateManager.size).toBe(1);

    // Try to start again
    instance.startService('svc-1');
    expect(stateManager.size).toBe(1); // Still only 1

    await instance.shutdown();
  });

  it('should not start inactive service', () => {
    const svc1 = createService('svc-1', 'service-a', { is_active: 0 });
    const { instance, stateManager, mockServiceStore } = createPollingService([]);

    mockServiceStore.findById.mockReturnValue(svc1);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    instance.startService('svc-1');

    expect(stateManager.hasService('svc-1')).toBe(false);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('not found or inactive')
    );

    logSpy.mockRestore();
  });

  it('should not start non-existent service', () => {
    const { instance, stateManager, mockServiceStore } = createPollingService([]);

    mockServiceStore.findById.mockReturnValue(null);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    instance.startService('non-existent');

    expect(stateManager.hasService('non-existent')).toBe(false);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('not found or inactive')
    );

    logSpy.mockRestore();
  });

  it('should stop a specific service', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance, stateManager, pollers, circuitBreakers, backoffs } =
      createPollingService([svc1]);

    instance.startAll();
    expect(stateManager.hasService('svc-1')).toBe(true);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    instance.stopService('svc-1');

    expect(stateManager.hasService('svc-1')).toBe(false);
    expect(pollers.has('svc-1')).toBe(false);
    expect(circuitBreakers.has('svc-1')).toBe(false);
    expect(backoffs.has('svc-1')).toBe(false);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Stopped polling service-a')
    );

    await instance.shutdown();
    logSpy.mockRestore();
  });

  it('should not fail when stopping non-existent service', () => {
    const { instance } = createPollingService([]);

    // Should not throw
    instance.stopService('non-existent');
  });

  it('should stop loop when last service removed', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance, stateManager } = createPollingService([svc1]);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    instance.startAll();
    expect(stateManager.size).toBe(1);

    instance.stopService('svc-1');
    expect(stateManager.size).toBe(0);

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Poll loop stopped')
    );

    await instance.shutdown();
    logSpy.mockRestore();
  });

  it('should shutdown cleanly', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance, stateManager } = createPollingService([svc1]);

    instance.startAll();
    expect(stateManager.size).toBe(1);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    await instance.shutdown();

    expect(stateManager.size).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Shutting down health polling service')
    );

    logSpy.mockRestore();
  });
});

describe('HealthPollingService - singleton', () => {
  afterEach(async () => {
    await HealthPollingService.resetInstance();
  });

  it('should return singleton instance from getInstance', () => {
    const instance1 = HealthPollingService.getInstance();
    const instance2 = HealthPollingService.getInstance();

    expect(instance1).toBe(instance2);
  });

  it('should reset instance on resetInstance when instance exists', async () => {
    const instance1 = HealthPollingService.getInstance();
    await HealthPollingService.resetInstance();
    const instance2 = HealthPollingService.getInstance();

    expect(instance1).not.toBe(instance2);
  });
});

describe('HealthPollingService - state methods', () => {
  afterEach(async () => {
    await HealthPollingService.resetInstance();
  });

  it('should return list of active pollers', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const svc2 = createService('svc-2', 'service-b');
    const { instance } = createPollingService([svc1, svc2]);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    instance.startAll();

    const activePollers = instance.getActivePollers();
    expect(activePollers).toContain('svc-1');
    expect(activePollers).toContain('svc-2');
    expect(activePollers).toHaveLength(2);

    await instance.shutdown();
    logSpy.mockRestore();
  });

  it('should check if service is polling', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance } = createPollingService([svc1]);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    expect(instance.isPolling('svc-1')).toBe(false);

    instance.startAll();

    expect(instance.isPolling('svc-1')).toBe(true);
    expect(instance.isPolling('non-existent')).toBe(false);

    await instance.shutdown();
    logSpy.mockRestore();
  });

  it('should return poll state for service', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance } = createPollingService([svc1]);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    instance.startAll();

    const state = instance.getPollState('svc-1');
    expect(state).toBeDefined();
    expect(state!.serviceName).toBe('service-a');
    expect(state!.circuitState).toBe('closed');

    const noState = instance.getPollState('non-existent');
    expect(noState).toBeUndefined();

    await instance.shutdown();
    logSpy.mockRestore();
  });

  it('should restart a service', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance, stateManager, mockServiceStore } = createPollingService([svc1]);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    instance.startAll();
    expect(stateManager.hasService('svc-1')).toBe(true);

    mockServiceStore.findById.mockReturnValue(svc1);

    instance.restartService('svc-1');

    expect(stateManager.hasService('svc-1')).toBe(true);

    await instance.shutdown();
    logSpy.mockRestore();
  });
});

describe('HealthPollingService - pollNow', () => {
  afterEach(async () => {
    await HealthPollingService.resetInstance();
  });

  it('should return error when service is already being polled', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance, stateManager, syncServices } = createPollingService([svc1]);

    // Add service without starting the loop
    syncServices();

    // Mark as currently polling
    stateManager.markPolling('svc-1', true);

    const result = await instance.pollNow('svc-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Service is currently being polled');

    // Unmark to avoid shutdown timeout
    stateManager.markPolling('svc-1', false);

    await instance.shutdown();
  });

  it('should return error when service not found', async () => {
    const { instance, mockServiceStore } = createPollingService([]);

    mockServiceStore.findById.mockReturnValue(null);

    const result = await instance.pollNow('non-existent');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Service not found');
  });

  it('should create temporary poller for non-tracked service', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance, mockServiceStore } = createPollingService([]);

    mockServiceStore.findById.mockReturnValue(svc1);

    // Will fail due to network but should create temp poller
    const result = await instance.pollNow('svc-1');

    // The poll will fail since there's no real endpoint, but it should have tried
    expect(result).toBeDefined();
    expect(mockServiceStore.findById).toHaveBeenCalledWith('svc-1');
  });

  it('should poll tracked service and update poll result', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance, syncServices, mockServiceStore } = createPollingService([svc1]);

    // Add service without starting the loop
    syncServices();

    // pollNow will use the real poller which will fail due to no real endpoint
    // This tests that the poll flow works and updatePollResult is called
    const result = await instance.pollNow('svc-1');

    // Poll should have run (will fail due to network, but that's expected)
    expect(result).toBeDefined();
    expect(mockServiceStore.updatePollResult).toHaveBeenCalled();

    await instance.shutdown();
  });

  it('should handle poll for tracked service with state', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance, stateManager, syncServices, circuitBreakers, backoffs } = createPollingService([svc1]);

    // Add service without starting the loop
    syncServices();

    // Verify state exists before poll
    expect(stateManager.hasService('svc-1')).toBe(true);
    expect(stateManager.getState('svc-1')!.isPolling).toBe(false);

    // Poll will fail due to no real endpoint but should update state
    await instance.pollNow('svc-1');

    // Verify state was updated - circuit breaker and backoff should exist after a poll
    expect(circuitBreakers.has('svc-1')).toBe(true);
    expect(backoffs.has('svc-1')).toBe(true);

    // Lock should be released after poll
    expect(stateManager.getState('svc-1')!.isPolling).toBe(false);

    await instance.shutdown();
  });
});

describe('HealthPollingService - runPollCycle', () => {
  afterEach(async () => {
    await HealthPollingService.resetInstance();
  });

  it('should skip services with open circuit breaker', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance, circuitBreakers, pollers, syncServices, pollCache } = createPollingService([svc1]);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    // Add service without starting loop
    syncServices();

    // Open the circuit breaker by recording many failures
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const getCircuitBreaker = (instance as any).getCircuitBreaker.bind(instance);
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const cb = getCircuitBreaker('svc-1');
    for (let i = 0; i < 10; i++) {
      cb.recordFailure();
    }

    expect(cb.getState()).toBe('open');
    expect(circuitBreakers.has('svc-1')).toBe(true);

    // Invalidate cache so service would be eligible for poll
    pollCache.invalidate('svc-1');

    // Replace the poller with a mock to verify it's not called
    const mockPoller = {
      poll: jest.fn().mockResolvedValue({
        success: true,
        dependenciesUpdated: 0,
        statusChanges: [],
        latencyMs: 50,
      }),
    };
    pollers.set('svc-1', mockPoller as unknown as ReturnType<typeof pollers.get>);

    // Trigger runPollCycle manually
    /* eslint-disable @typescript-eslint/no-explicit-any */
    await (instance as any).runPollCycle();
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Poll should not have been called due to circuit breaker being open
    expect(mockPoller.poll).not.toHaveBeenCalled();

    await instance.shutdown();
    logSpy.mockRestore();
  });

  it('should track circuit breaker state during failures', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance, syncServices } = createPollingService([svc1]);

    // Add service without starting loop
    syncServices();

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const getCircuitBreaker = (instance as any).getCircuitBreaker.bind(instance);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Verify circuit is initially closed
    const cb = getCircuitBreaker('svc-1');
    expect(cb.getState()).toBe('closed');

    // Record failures to open circuit
    for (let i = 0; i < 10; i++) {
      cb.recordFailure();
    }

    expect(cb.getState()).toBe('open');
    expect(cb.canAttempt()).toBe(false);

    await instance.shutdown();
  });

  it('should transition circuit from open to half-open after cooldown', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance, syncServices } = createPollingService([svc1]);

    // Add service without starting loop
    syncServices();

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const getCircuitBreaker = (instance as any).getCircuitBreaker.bind(instance);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Open the circuit
    const cb = getCircuitBreaker('svc-1');
    for (let i = 0; i < 10; i++) {
      cb.recordFailure();
    }

    expect(cb.getState()).toBe('open');

    // Simulate cooldown passed
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (cb as any).lastFailureTime = Date.now() - 400000;
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // canAttempt should transition to half-open
    expect(cb.canAttempt()).toBe(true);
    expect(cb.getState()).toBe('half-open');

    // Success should close the circuit
    cb.recordSuccess();
    expect(cb.getState()).toBe('closed');

    await instance.shutdown();
  });

  it('should get and use backoff for service', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance, syncServices, backoffs } = createPollingService([svc1]);

    // Add service without starting loop
    syncServices();

    // Poll will create backoff
    await instance.pollNow('svc-1');

    expect(backoffs.has('svc-1')).toBe(true);

    await instance.shutdown();
  });

  it('should get and use circuit breaker for service', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance, syncServices, circuitBreakers } = createPollingService([svc1]);

    // Add service without starting loop
    syncServices();

    // Poll will create circuit breaker
    await instance.pollNow('svc-1');

    expect(circuitBreakers.has('svc-1')).toBe(true);

    await instance.shutdown();
  });

  it('should handle pollService returning no poller found', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance, stateManager, pollers, syncServices } = createPollingService([svc1]);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    // Add service without starting loop
    syncServices();

    // Remove the poller manually to simulate edge case
    pollers.delete('svc-1');

    const state = stateManager.getState('svc-1')!;

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const pollServiceDeduped = (instance as any).pollServiceDeduped.bind(instance);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const result = await pollServiceDeduped(state);

    expect(result.result.success).toBe(false);
    expect(result.result.error).toBe('No poller found');

    await instance.shutdown();
    logSpy.mockRestore();
  });

  it('should skip polling when cache says not to poll', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance, pollCache, pollers, syncServices } = createPollingService([svc1]);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    // Add service without starting loop
    syncServices();

    // Mark as recently polled with long TTL
    pollCache.markPolled('svc-1', 60000);

    // Replace the poller with a mock
    const mockPoller = {
      poll: jest.fn().mockResolvedValue({
        success: true,
        dependenciesUpdated: 0,
        statusChanges: [],
        latencyMs: 50,
      }),
    };
    pollers.set('svc-1', mockPoller as unknown as ReturnType<typeof pollers.get>);

    // Trigger runPollCycle manually
    /* eslint-disable @typescript-eslint/no-explicit-any */
    await (instance as any).runPollCycle();
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Should not have called poll since cache says don't poll
    expect(mockPoller.poll).not.toHaveBeenCalled();

    await instance.shutdown();
    logSpy.mockRestore();
  });

  it('should handle rejected promises in poll cycle', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance, pollCache, pollers, syncServices } = createPollingService([svc1]);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    // Add service without starting loop
    syncServices();

    // Invalidate cache so it polls
    pollCache.invalidate('svc-1');

    // Replace the poller with a mock that throws
    const mockPoller = {
      poll: jest.fn().mockRejectedValue(new Error('Network error')),
    };
    pollers.set('svc-1', mockPoller as unknown as ReturnType<typeof pollers.get>);

    // Trigger runPollCycle - should handle rejection gracefully
    /* eslint-disable @typescript-eslint/no-explicit-any */
    await (instance as any).runPollCycle();
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Should not throw - handled gracefully

    await instance.shutdown();
    logSpy.mockRestore();
  });

  it('should run poll cycle and update state', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance, syncServices, pollCache, stateManager } = createPollingService([svc1]);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    // Add service without starting loop
    syncServices();

    // Invalidate cache so service is eligible for poll
    pollCache.invalidate('svc-1');

    // Verify service is tracked
    expect(stateManager.hasService('svc-1')).toBe(true);

    // Run poll cycle - this will poll the service (will fail due to no real endpoint)
    /* eslint-disable @typescript-eslint/no-explicit-any */
    await (instance as any).runPollCycle();
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Verify state was updated
    const state = stateManager.getState('svc-1');
    expect(state).toBeDefined();

    await instance.shutdown();
    logSpy.mockRestore();
  });

  it('should handle service removed during poll', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance, stateManager, pollers, syncServices, pollCache } = createPollingService([svc1]);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    // Add service without starting loop
    syncServices();

    // Invalidate cache so it polls
    pollCache.invalidate('svc-1');

    // Replace the poller with a mock that removes the service mid-poll
    const mockPoller = {
      poll: jest.fn().mockImplementation(async () => {
        // Remove service during poll
        stateManager.removeService('svc-1');
        return {
          success: true,
          dependenciesUpdated: 1,
          statusChanges: [],
          latencyMs: 50,
        };
      }),
    };
    pollers.set('svc-1', mockPoller as unknown as ReturnType<typeof pollers.get>);

    // Trigger runPollCycle - should handle gracefully
    /* eslint-disable @typescript-eslint/no-explicit-any */
    await (instance as any).runPollCycle();
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Should not throw

    await instance.shutdown();
    logSpy.mockRestore();
  });
});

describe('HealthPollingService - deduplication', () => {
  afterEach(async () => {
    await HealthPollingService.resetInstance();
  });

  it('should call poll() only once for two services with the same endpoint', async () => {
    const endpoint = 'http://localhost:4000/shared/dependencies';
    const svc1 = createService('svc-1', 'service-a', { health_endpoint: endpoint });
    const svc2 = createService('svc-2', 'service-b', { health_endpoint: endpoint });
    const { instance, pollers, syncServices, pollCache } = createPollingService([svc1, svc2]);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    syncServices();
    pollCache.invalidate('svc-1');
    pollCache.invalidate('svc-2');

    const pollResult = {
      success: true,
      dependenciesUpdated: 2,
      statusChanges: [],
      latencyMs: 50,
    };

    // Both pollers share the same endpoint; only one poll() should fire
    const mockPoll = jest.fn().mockResolvedValue(pollResult);
    const mockPoller1 = { poll: mockPoll, updateService: jest.fn() };
    const mockPoller2 = { poll: mockPoll, updateService: jest.fn() };
    pollers.set('svc-1', mockPoller1 as unknown as ReturnType<typeof pollers.get>);
    pollers.set('svc-2', mockPoller2 as unknown as ReturnType<typeof pollers.get>);

    /* eslint-disable @typescript-eslint/no-explicit-any */
    await (instance as any).runPollCycle();
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Deduplicator ensures poll() is called only once for the shared URL
    expect(mockPoll).toHaveBeenCalledTimes(1);

    await instance.shutdown();
    logSpy.mockRestore();
  });

  it('should apply poll result to both services when deduped', async () => {
    const endpoint = 'http://localhost:4000/shared/dependencies';
    const svc1 = createService('svc-1', 'service-a', { health_endpoint: endpoint });
    const svc2 = createService('svc-2', 'service-b', { health_endpoint: endpoint });
    const { instance, pollers, syncServices, pollCache, mockServiceStore } =
      createPollingService([svc1, svc2]);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    syncServices();
    pollCache.invalidate('svc-1');
    pollCache.invalidate('svc-2');

    const pollResult = {
      success: true,
      dependenciesUpdated: 2,
      statusChanges: [],
      latencyMs: 50,
    };

    const mockPoll = jest.fn().mockResolvedValue(pollResult);
    pollers.set('svc-1', { poll: mockPoll } as unknown as ReturnType<typeof pollers.get>);
    pollers.set('svc-2', { poll: mockPoll } as unknown as ReturnType<typeof pollers.get>);

    /* eslint-disable @typescript-eslint/no-explicit-any */
    await (instance as any).runPollCycle();
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Both services should have their poll results persisted
    expect(mockServiceStore.updatePollResult).toHaveBeenCalledWith('svc-1', true, undefined);
    expect(mockServiceStore.updatePollResult).toHaveBeenCalledWith('svc-2', true, undefined);

    await instance.shutdown();
    logSpy.mockRestore();
  });
});

describe('HealthPollingService - host rate limiting', () => {
  afterEach(async () => {
    await HealthPollingService.resetInstance();
  });

  it('should skip services when host is at capacity', async () => {
    // Create 3 services on same host, but limit is 2
    const svc1 = createService('svc-1', 'service-a', {
      health_endpoint: 'http://example.com/a/dependencies',
    });
    const svc2 = createService('svc-2', 'service-b', {
      health_endpoint: 'http://example.com/b/dependencies',
    });
    const svc3 = createService('svc-3', 'service-c', {
      health_endpoint: 'http://example.com/c/dependencies',
    });
    const { instance, pollers, syncServices, pollCache, hostRateLimiter } =
      createPollingService([svc1, svc2, svc3]);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    // Set host rate limit to 2
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (instance as any).hostRateLimiter = new (require('./HostRateLimiter').HostRateLimiter)(2);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    syncServices();
    pollCache.invalidate('svc-1');
    pollCache.invalidate('svc-2');
    pollCache.invalidate('svc-3');

    const pollResult = {
      success: true,
      dependenciesUpdated: 1,
      statusChanges: [],
      latencyMs: 50,
    };

    const mockPoll1 = jest.fn().mockResolvedValue(pollResult);
    const mockPoll2 = jest.fn().mockResolvedValue(pollResult);
    const mockPoll3 = jest.fn().mockResolvedValue(pollResult);
    pollers.set('svc-1', { poll: mockPoll1 } as unknown as ReturnType<typeof pollers.get>);
    pollers.set('svc-2', { poll: mockPoll2 } as unknown as ReturnType<typeof pollers.get>);
    pollers.set('svc-3', { poll: mockPoll3 } as unknown as ReturnType<typeof pollers.get>);

    /* eslint-disable @typescript-eslint/no-explicit-any */
    await (instance as any).runPollCycle();
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Only 2 of the 3 should have been polled (host limit = 2)
    const totalPolled = [mockPoll1, mockPoll2, mockPoll3]
      .filter(m => m.mock.calls.length > 0).length;

    // Due to dedup on same host but different URLs, each gets its own poll
    // but host rate limiter limits to 2
    expect(totalPolled).toBeLessThanOrEqual(2);

    await instance.shutdown();
    logSpy.mockRestore();
  });

  it('should release host slots after poll cycle', async () => {
    const svc1 = createService('svc-1', 'service-a', {
      health_endpoint: 'http://example.com/a/dependencies',
    });
    const { instance, pollers, syncServices, pollCache } = createPollingService([svc1]);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    syncServices();
    pollCache.invalidate('svc-1');

    const pollResult = {
      success: true,
      dependenciesUpdated: 1,
      statusChanges: [],
      latencyMs: 50,
    };

    pollers.set('svc-1', {
      poll: jest.fn().mockResolvedValue(pollResult),
    } as unknown as ReturnType<typeof pollers.get>);

    /* eslint-disable @typescript-eslint/no-explicit-any */
    await (instance as any).runPollCycle();
    const limiter = (instance as any).hostRateLimiter;
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // After poll cycle, host slots should be released
    expect(limiter.getActiveCount('example.com')).toBe(0);

    await instance.shutdown();
    logSpy.mockRestore();
  });

  it('should clean up host rate limiter and deduplicator on shutdown', async () => {
    const svc1 = createService('svc-1', 'service-a');
    const { instance, hostRateLimiter, pollDeduplicator } = createPollingService([svc1]);

    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    instance.startAll();

    await instance.shutdown();

    // Both should be cleared
    expect(hostRateLimiter.getActiveCount('localhost')).toBe(0);
    expect(pollDeduplicator.size).toBe(0);

    logSpy.mockRestore();
  });
});
