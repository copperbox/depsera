import Database from 'better-sqlite3';
import { Service, ProactiveDepsStatus } from '../../db/types';
import { StoreRegistry } from '../../stores';
import { ErrorHistoryRecorder } from './ErrorHistoryRecorder';

// Create DB instance that will be used in tests
const testDb = new Database(':memory:');

// We'll pass stores directly to avoid the global db mock issue
jest.mock('../matching', () => ({
  AssociationMatcher: {
    getInstance: jest.fn().mockReturnValue({
      generateSuggestions: jest.fn(),
    }),
  },
}));

// Import after mocks are set up
import { DependencyUpsertService } from './DependencyUpsertService';

// Mock ErrorHistoryRecorder to avoid foreign key issues
const mockErrorRecorder: ErrorHistoryRecorder = {
  record: jest.fn(),
} as unknown as ErrorHistoryRecorder;

describe('DependencyUpsertService', () => {
  let stores: StoreRegistry;

  beforeAll(() => {
    testDb.exec(`
      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE services (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        team_id TEXT NOT NULL,
        health_endpoint TEXT NOT NULL,
        metrics_endpoint TEXT,
        schema_config TEXT,
        poll_interval_ms INTEGER NOT NULL DEFAULT 30000,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_external INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        last_poll_success INTEGER,
        last_poll_error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE dependencies (
        id TEXT PRIMARY KEY,
        service_id TEXT NOT NULL,
        name TEXT NOT NULL,
        canonical_name TEXT,
        description TEXT,
        impact TEXT,
        type TEXT DEFAULT 'other',
        healthy INTEGER,
        health_state INTEGER,
        health_code INTEGER,
        latency_ms INTEGER,
        check_details TEXT,
        error TEXT,
        error_message TEXT,
        last_checked TEXT,
        last_status_change TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (service_id, name)
      );

      CREATE TABLE dependency_associations (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        linked_service_id TEXT NOT NULL,
        association_type TEXT DEFAULT 'api_call',
        is_auto_suggested INTEGER NOT NULL DEFAULT 0,
        confidence_score REAL,
        is_dismissed INTEGER NOT NULL DEFAULT 0,
        match_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (dependency_id, linked_service_id)
      );

      CREATE TABLE dependency_aliases (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        canonical_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE dependency_latency_history (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        recorded_at TEXT NOT NULL
      );

      CREATE TABLE dependency_error_history (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        error TEXT,
        error_message TEXT,
        recorded_at TEXT NOT NULL
      );

      INSERT INTO teams (id, name) VALUES ('team-1', 'Test Team');
      INSERT INTO services (id, name, team_id, health_endpoint) VALUES
        ('svc-1', 'Test Service', 'team-1', 'http://test/health');
    `);

    stores = StoreRegistry.create(testDb);
  });

  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM dependency_latency_history');
    testDb.exec('DELETE FROM dependency_error_history');
    testDb.exec('DELETE FROM dependencies');
    testDb.exec('DELETE FROM dependency_aliases');
  });

  const createService = (): Service => ({
    id: 'svc-1',
    name: 'Test Service',
    team_id: 'team-1',
    health_endpoint: 'http://test/health',
    metrics_endpoint: null,
    schema_config: null,
    poll_interval_ms: 30000,
    is_active: 1,
    is_external: 0,
    description: null,
    last_poll_success: null,
    last_poll_error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const createDepStatus = (overrides?: Partial<ProactiveDepsStatus>): ProactiveDepsStatus => ({
    name: 'TestDep',
    description: 'Test dependency',
    type: 'rest',
    healthy: true,
    health: {
      state: 0,
      code: 200,
      latency: 50,
    },
    impact: 'high',
    lastChecked: new Date().toISOString(),
    checkDetails: { ok: true },
    error: undefined,
    errorMessage: undefined,
    ...overrides,
  });

  describe('upsert', () => {
    it('should insert new dependency', () => {
      const service = createService();
      const upsertService = new DependencyUpsertService(mockErrorRecorder, stores);
      const deps = [createDepStatus()];

      const changes = upsertService.upsert(service, deps);

      expect(changes).toHaveLength(0); // No change for new dependency

      const stored = stores.dependencies.findByServiceId('svc-1');
      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe('TestDep');
    });

    it('should detect health status change', () => {
      const service = createService();
      const upsertService = new DependencyUpsertService(mockErrorRecorder, stores);

      // First insert as healthy
      upsertService.upsert(service, [createDepStatus({ healthy: true })]);

      // Then update to unhealthy
      const changes = upsertService.upsert(service, [createDepStatus({ healthy: false })]);

      expect(changes).toHaveLength(1);
      expect(changes[0].previousHealthy).toBe(true);
      expect(changes[0].currentHealthy).toBe(false);
    });

    it('should record latency history when latency > 0', () => {
      const service = createService();
      const upsertService = new DependencyUpsertService(mockErrorRecorder, stores);

      upsertService.upsert(service, [createDepStatus({ health: { state: 0, code: 200, latency: 100 } })]);

      const depId = stores.dependencies.findByServiceId('svc-1')[0].id;
      const history = stores.latencyHistory.getHistory(depId);
      expect(history).toHaveLength(1);
      expect(history[0].latency_ms).toBe(100);
    });

    it('should not record latency history when latency is 0', () => {
      const service = createService();
      const upsertService = new DependencyUpsertService(mockErrorRecorder, stores);

      upsertService.upsert(service, [createDepStatus({ health: { state: 0, code: 200, latency: 0 } })]);

      const dep = stores.dependencies.findByServiceId('svc-1')[0];
      const history = stores.latencyHistory.getHistory(dep.id);
      expect(history).toHaveLength(0);
    });

    it('should resolve aliases to canonical names', () => {
      // Set up an alias
      testDb.exec(`
        INSERT INTO dependency_aliases (id, alias, canonical_name)
        VALUES ('alias-1', 'test-dep', 'TestDep');
      `);

      const service = createService();
      const upsertService = new DependencyUpsertService(mockErrorRecorder, stores);

      upsertService.upsert(service, [createDepStatus({ name: 'test-dep' })]);

      const stored = stores.dependencies.findByServiceId('svc-1');
      expect(stored[0].canonical_name).toBe('TestDep');
    });

    it('should handle dependency with error', () => {
      const service = createService();
      const upsertService = new DependencyUpsertService(mockErrorRecorder, stores);

      upsertService.upsert(service, [
        createDepStatus({
          healthy: false,
          error: { code: 500, message: 'Internal error' },
          errorMessage: 'Server error occurred',
        }),
      ]);

      const stored = stores.dependencies.findByServiceId('svc-1');
      expect(stored[0].healthy).toBe(0);
      expect(stored[0].error).toContain('500');
    });

    it('should handle multiple dependencies', () => {
      const service = createService();
      const upsertService = new DependencyUpsertService(mockErrorRecorder, stores);

      upsertService.upsert(service, [
        createDepStatus({ name: 'Dep1' }),
        createDepStatus({ name: 'Dep2' }),
        createDepStatus({ name: 'Dep3' }),
      ]);

      const stored = stores.dependencies.findByServiceId('svc-1');
      expect(stored).toHaveLength(3);
    });

    it('should use default type when not provided', () => {
      const service = createService();
      const upsertService = new DependencyUpsertService(mockErrorRecorder, stores);

      upsertService.upsert(service, [createDepStatus({ type: undefined })]);

      const stored = stores.dependencies.findByServiceId('svc-1');
      expect(stored[0].type).toBe('other');
    });

    it('should handle null description and impact', () => {
      const service = createService();
      const upsertService = new DependencyUpsertService(mockErrorRecorder, stores);

      upsertService.upsert(service, [
        createDepStatus({ description: undefined, impact: undefined }),
      ]);

      const stored = stores.dependencies.findByServiceId('svc-1');
      expect(stored[0].description).toBeNull();
      expect(stored[0].impact).toBeNull();
    });
  });
});
