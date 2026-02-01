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
});
