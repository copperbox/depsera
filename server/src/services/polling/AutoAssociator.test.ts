import { AutoAssociator } from './AutoAssociator';
import { Service, ProactiveDepsStatus } from '../../db/types';
import { StoreRegistry } from '../../stores';

/** Minimal Service factory */
function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'svc-source',
    name: 'source-service',
    team_id: 'team-1',
    health_endpoint: '',
    health_endpoint_format: 'otlp',
    poll_interval_ms: 0,
    is_active: 1,
    is_external: 0,
    description: null,
    metrics_endpoint: null,
    schema_config: null,
    last_poll_success: null,
    last_poll_error: null,
    poll_warnings: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as Service;
}

/** Minimal ProactiveDepsStatus factory */
function makeDepsStatus(overrides: Partial<ProactiveDepsStatus> = {}): ProactiveDepsStatus {
  return {
    name: 'target-service',
    healthy: true,
    health: { state: 0, code: 200, latency: 50 },
    lastChecked: new Date().toISOString(),
    type: 'rest',
    discovery_source: 'otlp_trace',
    ...overrides,
  } as ProactiveDepsStatus;
}

/** Build mock StoreRegistry with spies */
function createMockStores(overrides: Record<string, unknown> = {}) {
  return {
    services: {
      findByTeamId: jest.fn().mockReturnValue([]),
    },
    dependencies: {
      findByServiceId: jest.fn().mockReturnValue([]),
    },
    associations: {
      existsForDependencyAndService: jest.fn().mockReturnValue(false),
      create: jest.fn().mockReturnValue({ id: 'assoc-new' }),
    },
    aliases: {
      resolveAlias: jest.fn().mockReturnValue(null),
    },
    ...overrides,
  } as unknown as StoreRegistry;
}

describe('AutoAssociator', () => {
  describe('processDiscoveredDependencies', () => {
    it('creates auto-suggested association on exact name match (case-insensitive)', () => {
      const targetSvc = makeService({ id: 'svc-target', name: 'Target-Service' });
      const stores = createMockStores({
        services: { findByTeamId: jest.fn().mockReturnValue([targetSvc]) },
        dependencies: {
          findByServiceId: jest.fn().mockReturnValue([
            { id: 'dep-1', name: 'target-service', canonical_name: null },
          ]),
        },
      });

      const associator = new AutoAssociator(stores);
      const sourceService = makeService();
      const deps = [makeDepsStatus({ name: 'target-service', type: 'rest' })];

      associator.processDiscoveredDependencies(sourceService, deps, 'team-1');

      expect(stores.associations.create).toHaveBeenCalledWith({
        dependency_id: 'dep-1',
        linked_service_id: 'svc-target',
        association_type: 'api_call',
        is_auto_suggested: true,
      });
    });

    it('creates association via canonical name match through alias resolution', () => {
      const targetSvc = makeService({ id: 'svc-pg', name: 'PostgreSQL' });
      const stores = createMockStores({
        services: { findByTeamId: jest.fn().mockReturnValue([targetSvc]) },
        dependencies: {
          findByServiceId: jest.fn().mockReturnValue([
            { id: 'dep-1', name: 'postgres', canonical_name: null },
          ]),
        },
        aliases: {
          resolveAlias: jest.fn().mockReturnValue('PostgreSQL'),
        },
      });

      const associator = new AutoAssociator(stores);
      associator.processDiscoveredDependencies(makeService(), [makeDepsStatus({ name: 'postgres', type: 'database' })], 'team-1');

      expect(stores.aliases.resolveAlias).toHaveBeenCalledWith('postgres');
      expect(stores.associations.create).toHaveBeenCalledWith(
        expect.objectContaining({
          dependency_id: 'dep-1',
          linked_service_id: 'svc-pg',
          association_type: 'database',
          is_auto_suggested: true,
        }),
      );
    });

    it('uses canonical_name from dependency record when available', () => {
      const targetSvc = makeService({ id: 'svc-pg', name: 'PostgreSQL' });
      const stores = createMockStores({
        services: { findByTeamId: jest.fn().mockReturnValue([targetSvc]) },
        dependencies: {
          findByServiceId: jest.fn().mockReturnValue([
            { id: 'dep-1', name: 'postgres', canonical_name: 'PostgreSQL' },
          ]),
        },
      });

      const associator = new AutoAssociator(stores);
      associator.processDiscoveredDependencies(makeService(), [makeDepsStatus({ name: 'postgres', type: 'database' })], 'team-1');

      // Should NOT call resolveAlias since canonical_name is already set
      expect(stores.aliases.resolveAlias).not.toHaveBeenCalled();
      expect(stores.associations.create).toHaveBeenCalledWith(
        expect.objectContaining({
          linked_service_id: 'svc-pg',
        }),
      );
    });

    it('skips self-links (source service === target service)', () => {
      const sourceService = makeService({ id: 'svc-1', name: 'my-service' });
      const stores = createMockStores({
        services: { findByTeamId: jest.fn().mockReturnValue([sourceService]) },
        dependencies: {
          findByServiceId: jest.fn().mockReturnValue([
            { id: 'dep-1', name: 'my-service', canonical_name: null },
          ]),
        },
      });

      const associator = new AutoAssociator(stores);
      associator.processDiscoveredDependencies(sourceService, [makeDepsStatus({ name: 'my-service' })], 'team-1');

      expect(stores.associations.create).not.toHaveBeenCalled();
    });

    it('skips when association already exists (not duplicated)', () => {
      const targetSvc = makeService({ id: 'svc-target', name: 'target-service' });
      const stores = createMockStores({
        services: { findByTeamId: jest.fn().mockReturnValue([targetSvc]) },
        dependencies: {
          findByServiceId: jest.fn().mockReturnValue([
            { id: 'dep-1', name: 'target-service', canonical_name: null },
          ]),
        },
        associations: {
          existsForDependencyAndService: jest.fn().mockReturnValue(true),
          create: jest.fn(),
        },
      });

      const associator = new AutoAssociator(stores);
      associator.processDiscoveredDependencies(makeService(), [makeDepsStatus({ name: 'target-service' })], 'team-1');

      expect(stores.associations.create).not.toHaveBeenCalled();
    });

    it('skips dismissed associations (does not re-suggest)', () => {
      // existsForDependencyAndService returns true for dismissed associations too
      const targetSvc = makeService({ id: 'svc-target', name: 'target-service' });
      const stores = createMockStores({
        services: { findByTeamId: jest.fn().mockReturnValue([targetSvc]) },
        dependencies: {
          findByServiceId: jest.fn().mockReturnValue([
            { id: 'dep-1', name: 'target-service', canonical_name: null },
          ]),
        },
        associations: {
          existsForDependencyAndService: jest.fn().mockReturnValue(true), // dismissed still returns true
          create: jest.fn(),
        },
      });

      const associator = new AutoAssociator(stores);
      associator.processDiscoveredDependencies(makeService(), [makeDepsStatus({ name: 'target-service' })], 'team-1');

      expect(stores.associations.create).not.toHaveBeenCalled();
    });

    it('maps dependency type to correct association_type', () => {
      const teamServices = [
        makeService({ id: 'svc-db', name: 'postgres' }),
        makeService({ id: 'svc-cache', name: 'redis' }),
        makeService({ id: 'svc-mq', name: 'kafka' }),
        makeService({ id: 'svc-grpc', name: 'grpc-service' }),
        makeService({ id: 'svc-rest', name: 'rest-api' }),
        makeService({ id: 'svc-unknown', name: 'unknown-svc' }),
      ];

      const stores = createMockStores({
        services: { findByTeamId: jest.fn().mockReturnValue(teamServices) },
        dependencies: {
          findByServiceId: jest.fn().mockReturnValue([
            { id: 'dep-db', name: 'postgres', canonical_name: null },
            { id: 'dep-cache', name: 'redis', canonical_name: null },
            { id: 'dep-mq', name: 'kafka', canonical_name: null },
            { id: 'dep-grpc', name: 'grpc-service', canonical_name: null },
            { id: 'dep-rest', name: 'rest-api', canonical_name: null },
            { id: 'dep-unknown', name: 'unknown-svc', canonical_name: null },
          ]),
        },
      });

      const associator = new AutoAssociator(stores);
      associator.processDiscoveredDependencies(makeService(), [
        makeDepsStatus({ name: 'postgres', type: 'database' }),
        makeDepsStatus({ name: 'redis', type: 'cache' }),
        makeDepsStatus({ name: 'kafka', type: 'message_queue' }),
        makeDepsStatus({ name: 'grpc-service', type: 'grpc' }),
        makeDepsStatus({ name: 'rest-api', type: 'rest' }),
        makeDepsStatus({ name: 'unknown-svc', type: 'custom' }),
      ], 'team-1');

      const calls = (stores.associations.create as jest.Mock).mock.calls;
      expect(calls).toHaveLength(6);

      const byDep = Object.fromEntries(
        calls.map((c: Array<{ dependency_id: string; association_type: string }>) => [c[0].dependency_id, c[0].association_type]),
      );
      expect(byDep['dep-db']).toBe('database');
      expect(byDep['dep-cache']).toBe('cache');
      expect(byDep['dep-mq']).toBe('message_queue');
      expect(byDep['dep-grpc']).toBe('api_call');
      expect(byDep['dep-rest']).toBe('api_call');
      expect(byDep['dep-unknown']).toBe('other');
    });

    it('catches UNIQUE constraint violation as no-op', () => {
      const targetSvc = makeService({ id: 'svc-target', name: 'target-service' });
      const stores = createMockStores({
        services: { findByTeamId: jest.fn().mockReturnValue([targetSvc]) },
        dependencies: {
          findByServiceId: jest.fn().mockReturnValue([
            { id: 'dep-1', name: 'target-service', canonical_name: null },
          ]),
        },
        associations: {
          existsForDependencyAndService: jest.fn().mockReturnValue(false),
          create: jest.fn().mockImplementation(() => {
            throw new Error('UNIQUE constraint failed: dependency_associations.dependency_id, dependency_associations.linked_service_id');
          }),
        },
      });

      const associator = new AutoAssociator(stores);

      // Should not throw
      expect(() => {
        associator.processDiscoveredDependencies(makeService(), [makeDepsStatus({ name: 'target-service' })], 'team-1');
      }).not.toThrow();
    });

    it('does nothing when no dependencies provided', () => {
      const stores = createMockStores();
      const associator = new AutoAssociator(stores);

      associator.processDiscoveredDependencies(makeService(), [], 'team-1');

      expect(stores.services.findByTeamId).not.toHaveBeenCalled();
    });

    it('skips dependencies with no matching registered service', () => {
      const stores = createMockStores({
        services: { findByTeamId: jest.fn().mockReturnValue([]) }, // no team services
        dependencies: {
          findByServiceId: jest.fn().mockReturnValue([
            { id: 'dep-1', name: 'unregistered-target', canonical_name: null },
          ]),
        },
      });

      const associator = new AutoAssociator(stores);
      associator.processDiscoveredDependencies(
        makeService(),
        [makeDepsStatus({ name: 'unregistered-target' })],
        'team-1',
      );

      expect(stores.associations.create).not.toHaveBeenCalled();
    });

    it('skips when dependency record not found in DB', () => {
      const targetSvc = makeService({ id: 'svc-target', name: 'target-service' });
      const stores = createMockStores({
        services: { findByTeamId: jest.fn().mockReturnValue([targetSvc]) },
        dependencies: {
          findByServiceId: jest.fn().mockReturnValue([]), // no deps in DB yet
        },
      });

      const associator = new AutoAssociator(stores);
      associator.processDiscoveredDependencies(
        makeService(),
        [makeDepsStatus({ name: 'target-service' })],
        'team-1',
      );

      expect(stores.associations.create).not.toHaveBeenCalled();
    });
  });
});
