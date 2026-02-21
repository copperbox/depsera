import Database from 'better-sqlite3';
import { DependencyStore } from './DependencyStore';
import { InvalidOrderByError } from '../orderByValidator';

describe('DependencyStore', () => {
  let db: Database.Database;
  let store: DependencyStore;
  const testServiceId = 'svc-123';
  const testServiceId2 = 'svc-456';

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE services (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        team_id TEXT NOT NULL,
        health_endpoint TEXT NOT NULL,
        metrics_endpoint TEXT,
        poll_interval_ms INTEGER NOT NULL DEFAULT 30000,
        is_active INTEGER NOT NULL DEFAULT 1,
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
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (dependency_id) REFERENCES dependencies(id) ON DELETE CASCADE
      );

      CREATE TABLE dependency_latency_history (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        recorded_at TEXT NOT NULL
      );

      INSERT INTO services (id, name, team_id, health_endpoint) VALUES
        ('${testServiceId}', 'Test Service', 'team-1', 'http://test/health'),
        ('${testServiceId2}', 'Test Service 2', 'team-1', 'http://test2/health');
    `);
    store = new DependencyStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('upsert', () => {
    it('should create new dependency', () => {
      const result = store.upsert({
        service_id: testServiceId,
        name: 'TestDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      expect(result.isNew).toBe(true);
      expect(result.healthChanged).toBe(false);
      expect(result.dependency.name).toBe('TestDep');
      expect(result.dependency.healthy).toBe(1);
    });

    it('should update existing dependency', () => {
      const now = new Date().toISOString();
      store.upsert({
        service_id: testServiceId,
        name: 'TestDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: now,
      });

      const result = store.upsert({
        service_id: testServiceId,
        name: 'TestDep',
        healthy: false,
        health_state: 2,
        health_code: 500,
        latency_ms: 100,
        last_checked: now,
      });

      expect(result.isNew).toBe(false);
      expect(result.healthChanged).toBe(true);
      expect(result.previousHealthy).toBe(1);
      expect(result.dependency.healthy).toBe(0);
    });

    it('should handle optional fields', () => {
      const result = store.upsert({
        service_id: testServiceId,
        name: 'TestDep',
        canonical_name: 'canonical-name',
        description: 'A test dependency',
        impact: 'high',
        type: 'database',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        check_details: { query: 'SELECT 1' },
        error: { code: 0 },
        error_message: null,
        last_checked: new Date().toISOString(),
      });

      expect(result.dependency.canonical_name).toBe('canonical-name');
      expect(result.dependency.description).toBe('A test dependency');
      expect(result.dependency.type).toBe('database');
    });
  });

  describe('findById', () => {
    it('should find existing dependency', () => {
      const created = store.upsert({
        service_id: testServiceId,
        name: 'TestDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      const found = store.findById(created.dependency.id);
      expect(found).toBeDefined();
      expect(found?.name).toBe('TestDep');
    });

    it('should return undefined for non-existent dependency', () => {
      const found = store.findById('non-existent');
      expect(found).toBeUndefined();
    });
  });

  describe('findByServiceId', () => {
    it('should find dependencies for service', () => {
      store.upsert({
        service_id: testServiceId,
        name: 'Dep1',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });
      store.upsert({
        service_id: testServiceId,
        name: 'Dep2',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 60,
        last_checked: new Date().toISOString(),
      });

      const deps = store.findByServiceId(testServiceId);
      expect(deps).toHaveLength(2);
    });
  });

  describe('findByServiceIdWithTargets', () => {
    it('should return dependencies with association data', () => {
      const result = store.upsert({
        service_id: testServiceId,
        name: 'TestDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      // Add association
      db.prepare(`
        INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type, is_auto_suggested)
        VALUES (?, ?, ?, ?, ?)
      `).run('assoc-1', result.dependency.id, testServiceId2, 'api_call', 0);

      const deps = store.findByServiceIdWithTargets(testServiceId);
      expect(deps).toHaveLength(1);
      expect(deps[0].target_service_id).toBe(testServiceId2);
      expect(deps[0].service_name).toBe('Test Service');
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      store.upsert({
        service_id: testServiceId,
        name: 'DepA',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        type: 'database',
        last_checked: new Date().toISOString(),
      });
      store.upsert({
        service_id: testServiceId,
        name: 'DepB',
        healthy: false,
        health_state: 2,
        health_code: 500,
        latency_ms: 100,
        type: 'rest',
        last_checked: new Date().toISOString(),
      });
    });

    it('should return all dependencies', () => {
      const deps = store.findAll();
      expect(deps).toHaveLength(2);
    });

    it('should filter by serviceId', () => {
      const deps = store.findAll({ serviceId: testServiceId });
      expect(deps).toHaveLength(2);
    });

    it('should filter by healthy status', () => {
      const deps = store.findAll({ healthy: true });
      expect(deps).toHaveLength(1);
      expect(deps[0].name).toBe('DepA');
    });

    it('should filter by type', () => {
      const deps = store.findAll({ type: 'database' });
      expect(deps).toHaveLength(1);
      expect(deps[0].name).toBe('DepA');
    });

    it('should respect limit and offset', () => {
      const deps = store.findAll({ limit: 1, offset: 1 });
      expect(deps).toHaveLength(1);
    });

    it('should respect orderBy and orderDirection', () => {
      const deps = store.findAll({ orderBy: 'name', orderDirection: 'DESC' });
      expect(deps[0].name).toBe('DepB');
    });

    it('should accept other valid orderBy columns', () => {
      const deps = store.findAll({ orderBy: 'latency_ms', orderDirection: 'ASC' });
      expect(deps).toHaveLength(2);
      expect(deps[0].name).toBe('DepA'); // 50ms < 100ms
    });

    it('should throw InvalidOrderByError for non-whitelisted column', () => {
      expect(() => store.findAll({ orderBy: 'invalid_column' }))
        .toThrow(InvalidOrderByError);
    });

    it('should throw InvalidOrderByError for SQL injection via orderBy', () => {
      expect(() => store.findAll({ orderBy: 'name; DROP TABLE dependencies; --' }))
        .toThrow(InvalidOrderByError);
    });

    it('should throw InvalidOrderByError for invalid orderDirection', () => {
      expect(() => store.findAll({ orderBy: 'name', orderDirection: 'INVALID' as 'ASC' }))
        .toThrow(InvalidOrderByError);
    });
  });

  describe('findAllWithAssociationsAndLatency', () => {
    it('should return dependencies with association data', () => {
      store.upsert({
        service_id: testServiceId,
        name: 'TestDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      const deps = store.findAllWithAssociationsAndLatency();
      expect(deps).toHaveLength(1);
      expect(deps[0].service_name).toBe('Test Service');
    });

    it('should respect activeServicesOnly filter', () => {
      db.prepare('UPDATE services SET is_active = 0 WHERE id = ?').run(testServiceId);
      store.upsert({
        service_id: testServiceId,
        name: 'TestDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      const activeDeps = store.findAllWithAssociationsAndLatency({ activeServicesOnly: true });
      expect(activeDeps).toHaveLength(0);

      const allDeps = store.findAllWithAssociationsAndLatency({ activeServicesOnly: false });
      expect(allDeps).toHaveLength(1);
    });
  });

  describe('findByServiceIdsWithAssociationsAndLatency', () => {
    it('should return dependencies for specified services', () => {
      store.upsert({
        service_id: testServiceId,
        name: 'Dep1',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      const deps = store.findByServiceIdsWithAssociationsAndLatency([testServiceId]);
      expect(deps).toHaveLength(1);
    });

    it('should return empty array for empty service IDs', () => {
      const deps = store.findByServiceIdsWithAssociationsAndLatency([]);
      expect(deps).toHaveLength(0);
    });
  });

  describe('findExistingByServiceId', () => {
    it('should return minimal dependency data', () => {
      store.upsert({
        service_id: testServiceId,
        name: 'TestDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      const deps = store.findExistingByServiceId(testServiceId);
      expect(deps).toHaveLength(1);
      expect(deps[0].id).toBeDefined();
      expect(deps[0].name).toBe('TestDep');
      expect(deps[0].healthy).toBe(1);
    });
  });

  describe('findDependentReports', () => {
    it('should find reports for linked service', () => {
      const result = store.upsert({
        service_id: testServiceId,
        name: 'TestDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      db.prepare(`
        INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type, is_auto_suggested)
        VALUES (?, ?, ?, ?, ?)
      `).run('assoc-1', result.dependency.id, testServiceId2, 'api_call', 0);

      const reports = store.findDependentReports(testServiceId2);
      expect(reports).toHaveLength(1);
      expect(reports[0].reporting_service_name).toBe('Test Service');
    });
  });

  describe('delete', () => {
    it('should delete dependency', () => {
      const result = store.upsert({
        service_id: testServiceId,
        name: 'TestDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      const deleted = store.delete(result.dependency.id);
      expect(deleted).toBe(true);
      expect(store.findById(result.dependency.id)).toBeUndefined();
    });

    it('should return false for non-existent dependency', () => {
      const deleted = store.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('deleteByServiceId', () => {
    it('should delete all dependencies for service', () => {
      store.upsert({
        service_id: testServiceId,
        name: 'Dep1',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });
      store.upsert({
        service_id: testServiceId,
        name: 'Dep2',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      const deleted = store.deleteByServiceId(testServiceId);
      expect(deleted).toBe(2);
    });
  });

  describe('exists', () => {
    it('should return true for existing dependency', () => {
      const result = store.upsert({
        service_id: testServiceId,
        name: 'TestDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      expect(store.exists(result.dependency.id)).toBe(true);
    });

    it('should return false for non-existent dependency', () => {
      expect(store.exists('non-existent')).toBe(false);
    });
  });

  describe('count', () => {
    it('should count all dependencies', () => {
      store.upsert({
        service_id: testServiceId,
        name: 'Dep1',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });
      store.upsert({
        service_id: testServiceId,
        name: 'Dep2',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      expect(store.count()).toBe(2);
    });

    it('should count with filters', () => {
      store.upsert({
        service_id: testServiceId,
        name: 'Dep1',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });
      store.upsert({
        service_id: testServiceId,
        name: 'Dep2',
        healthy: false,
        health_state: 2,
        health_code: 500,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      expect(store.count({ healthy: true })).toBe(1);
    });
  });
});
