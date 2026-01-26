import { PollStateManager } from './PollStateManager';
import { Service } from '../../db/types';

describe('PollStateManager', () => {
  let manager: PollStateManager;

  const createService = (id: string, name: string, pollingInterval = 30): Service => ({
    id,
    name,
    team_id: 'team-1',
    health_endpoint: `http://${name}.local/health`,
    metrics_endpoint: null,
    polling_interval: pollingInterval,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  beforeEach(() => {
    manager = new PollStateManager();
  });

  describe('addService', () => {
    it('should add a service and return poll state', () => {
      const service = createService('svc-1', 'user-service');
      const state = manager.addService(service);

      expect(state.serviceId).toBe('svc-1');
      expect(state.serviceName).toBe('user-service');
      expect(state.pollingInterval).toBe(30);
      expect(state.isPolling).toBe(false);
      expect(state.consecutiveFailures).toBe(0);
    });

    it('should set nextPollDue to now (immediate poll)', () => {
      const before = Date.now();
      const service = createService('svc-1', 'user-service');
      const state = manager.addService(service);
      const after = Date.now();

      expect(state.nextPollDue).toBeGreaterThanOrEqual(before);
      expect(state.nextPollDue).toBeLessThanOrEqual(after);
    });

    it('should increase size', () => {
      expect(manager.size).toBe(0);

      manager.addService(createService('svc-1', 'service-1'));
      expect(manager.size).toBe(1);

      manager.addService(createService('svc-2', 'service-2'));
      expect(manager.size).toBe(2);
    });
  });

  describe('removeService', () => {
    it('should remove an existing service', () => {
      manager.addService(createService('svc-1', 'user-service'));

      const removed = manager.removeService('svc-1');

      expect(removed).toBe(true);
      expect(manager.hasService('svc-1')).toBe(false);
    });

    it('should return false for non-existent service', () => {
      const removed = manager.removeService('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('getState', () => {
    it('should return state for existing service', () => {
      manager.addService(createService('svc-1', 'user-service'));

      const state = manager.getState('svc-1');

      expect(state).toBeDefined();
      expect(state?.serviceId).toBe('svc-1');
    });

    it('should return undefined for non-existent service', () => {
      const state = manager.getState('non-existent');
      expect(state).toBeUndefined();
    });
  });

  describe('hasService', () => {
    it('should return true for existing service', () => {
      manager.addService(createService('svc-1', 'user-service'));
      expect(manager.hasService('svc-1')).toBe(true);
    });

    it('should return false for non-existent service', () => {
      expect(manager.hasService('non-existent')).toBe(false);
    });
  });

  describe('getServiceIds', () => {
    it('should return all service IDs', () => {
      manager.addService(createService('svc-1', 'service-1'));
      manager.addService(createService('svc-2', 'service-2'));

      const ids = manager.getServiceIds();

      expect(ids).toContain('svc-1');
      expect(ids).toContain('svc-2');
      expect(ids).toHaveLength(2);
    });
  });

  describe('getDueServices', () => {
    it('should return services that are due for polling', () => {
      const now = Date.now();
      manager.addService(createService('svc-1', 'service-1'));
      manager.addService(createService('svc-2', 'service-2'));

      const due = manager.getDueServices(now);

      expect(due).toHaveLength(2);
    });

    it('should not return services currently polling', () => {
      const now = Date.now();
      manager.addService(createService('svc-1', 'service-1'));
      manager.addService(createService('svc-2', 'service-2'));
      manager.markPolling('svc-1', true);

      const due = manager.getDueServices(now);

      expect(due).toHaveLength(1);
      expect(due[0].serviceId).toBe('svc-2');
    });

    it('should not return services not yet due', () => {
      manager.addService(createService('svc-1', 'service-1'));
      const state = manager.getState('svc-1')!;
      state.nextPollDue = Date.now() + 60000; // 1 minute in the future

      const due = manager.getDueServices(Date.now());

      expect(due).toHaveLength(0);
    });
  });

  describe('markPolling', () => {
    it('should mark service as polling', () => {
      manager.addService(createService('svc-1', 'service-1'));

      const result = manager.markPolling('svc-1', true);

      expect(result).toBe(true);
      expect(manager.getState('svc-1')?.isPolling).toBe(true);
    });

    it('should mark service as not polling', () => {
      manager.addService(createService('svc-1', 'service-1'));
      manager.markPolling('svc-1', true);

      manager.markPolling('svc-1', false);

      expect(manager.getState('svc-1')?.isPolling).toBe(false);
    });

    it('should return false for non-existent service', () => {
      const result = manager.markPolling('non-existent', true);
      expect(result).toBe(false);
    });
  });

  describe('updateAfterPoll', () => {
    it('should update state on successful poll', () => {
      manager.addService(createService('svc-1', 'service-1', 30));
      const before = Date.now();

      manager.updateAfterPoll('svc-1', true);

      const state = manager.getState('svc-1')!;
      expect(state.consecutiveFailures).toBe(0);
      expect(state.isPolling).toBe(false);
      expect(state.lastPolled).toBeGreaterThanOrEqual(before);
      // Next poll should be ~30 seconds later
      expect(state.nextPollDue).toBeGreaterThan(before);
    });

    it('should update state on failed poll', () => {
      manager.addService(createService('svc-1', 'service-1'));
      const before = Date.now();

      manager.updateAfterPoll('svc-1', false);

      const state = manager.getState('svc-1')!;
      expect(state.consecutiveFailures).toBe(1);
      expect(state.isPolling).toBe(false);
      expect(state.lastPolled).toBeGreaterThanOrEqual(before);
    });

    it('should increment consecutive failures on repeated failures', () => {
      manager.addService(createService('svc-1', 'service-1'));

      manager.updateAfterPoll('svc-1', false);
      manager.updateAfterPoll('svc-1', false);
      manager.updateAfterPoll('svc-1', false);

      expect(manager.getState('svc-1')?.consecutiveFailures).toBe(3);
    });

    it('should reset consecutive failures on success', () => {
      manager.addService(createService('svc-1', 'service-1'));
      manager.updateAfterPoll('svc-1', false);
      manager.updateAfterPoll('svc-1', false);

      manager.updateAfterPoll('svc-1', true);

      expect(manager.getState('svc-1')?.consecutiveFailures).toBe(0);
    });

    it('should return false for non-existent service', () => {
      const result = manager.updateAfterPoll('non-existent', true);
      expect(result).toBe(false);
    });
  });

  describe('getActivePollingCount', () => {
    it('should return count of services currently polling', () => {
      manager.addService(createService('svc-1', 'service-1'));
      manager.addService(createService('svc-2', 'service-2'));
      manager.addService(createService('svc-3', 'service-3'));

      manager.markPolling('svc-1', true);
      manager.markPolling('svc-2', true);

      expect(manager.getActivePollingCount()).toBe(2);
    });

    it('should return 0 when no services are polling', () => {
      manager.addService(createService('svc-1', 'service-1'));
      expect(manager.getActivePollingCount()).toBe(0);
    });
  });

  describe('clear', () => {
    it('should remove all services', () => {
      manager.addService(createService('svc-1', 'service-1'));
      manager.addService(createService('svc-2', 'service-2'));

      manager.clear();

      expect(manager.size).toBe(0);
      expect(manager.getServiceIds()).toHaveLength(0);
    });
  });
});
