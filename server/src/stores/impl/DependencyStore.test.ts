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
        schema_config TEXT,
        poll_interval_ms INTEGER NOT NULL DEFAULT 30000,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_external INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        last_poll_success INTEGER,
        last_poll_error TEXT,
        poll_warnings TEXT,
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
        contact TEXT,
        contact_override TEXT,
        impact_override TEXT,
        check_details TEXT,
        error TEXT,
        error_message TEXT,
        skipped INTEGER NOT NULL DEFAULT 0,
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

    it('should store contact as JSON string', () => {
      const contact = { team: 'Platform', email: 'platform@co.com', slack: '#platform' };
      const result = store.upsert({
        service_id: testServiceId,
        name: 'ContactDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        contact,
        last_checked: new Date().toISOString(),
      });

      expect(result.dependency.contact).toBe(JSON.stringify(contact));
      const parsed = JSON.parse(result.dependency.contact!);
      expect(parsed.team).toBe('Platform');
      expect(parsed.email).toBe('platform@co.com');
      expect(parsed.slack).toBe('#platform');
    });

    it('should store null contact when not provided', () => {
      const result = store.upsert({
        service_id: testServiceId,
        name: 'NoContactDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      expect(result.dependency.contact).toBeNull();
    });

    it('should update contact on subsequent upsert', () => {
      const initialContact = { team: 'Alpha' };
      store.upsert({
        service_id: testServiceId,
        name: 'UpdateContactDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        contact: initialContact,
        last_checked: new Date().toISOString(),
      });

      const updatedContact = { team: 'Beta', email: 'beta@co.com' };
      const result = store.upsert({
        service_id: testServiceId,
        name: 'UpdateContactDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        contact: updatedContact,
        last_checked: new Date().toISOString(),
      });

      expect(result.isNew).toBe(false);
      const parsed = JSON.parse(result.dependency.contact!);
      expect(parsed.team).toBe('Beta');
      expect(parsed.email).toBe('beta@co.com');
    });

    it('should clear contact when upserted without contact', () => {
      store.upsert({
        service_id: testServiceId,
        name: 'ClearContactDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        contact: { team: 'Original' },
        last_checked: new Date().toISOString(),
      });

      const result = store.upsert({
        service_id: testServiceId,
        name: 'ClearContactDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      expect(result.dependency.contact).toBeNull();
    });

    it('should default override columns to null on new dependency', () => {
      const result = store.upsert({
        service_id: testServiceId,
        name: 'OverrideDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      expect(result.dependency.contact_override).toBeNull();
      expect(result.dependency.impact_override).toBeNull();
    });

    it('should not overwrite contact_override during upsert', () => {
      // Create dependency
      const result = store.upsert({
        service_id: testServiceId,
        name: 'OverridePreserveDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      // Manually set override (simulates user action via future override endpoint)
      const overrideJson = JSON.stringify({ team: 'Override Team', slack: '#override' });
      db.prepare('UPDATE dependencies SET contact_override = ? WHERE id = ?')
        .run(overrideJson, result.dependency.id);

      // Re-upsert via polling (should NOT touch contact_override)
      const updated = store.upsert({
        service_id: testServiceId,
        name: 'OverridePreserveDep',
        healthy: false,
        health_state: 2,
        health_code: 500,
        latency_ms: 100,
        last_checked: new Date().toISOString(),
      });

      expect(updated.isNew).toBe(false);
      expect(updated.dependency.healthy).toBe(0);
      expect(updated.dependency.contact_override).toBe(overrideJson);
    });

    it('should not overwrite impact_override during upsert', () => {
      const result = store.upsert({
        service_id: testServiceId,
        name: 'ImpactOverrideDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        impact: 'Low - fallback available',
        last_checked: new Date().toISOString(),
      });

      // Manually set impact override
      db.prepare('UPDATE dependencies SET impact_override = ? WHERE id = ?')
        .run('Critical - no fallback in production', result.dependency.id);

      // Re-upsert via polling with different polled impact
      const updated = store.upsert({
        service_id: testServiceId,
        name: 'ImpactOverrideDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        impact: 'Medium - degraded mode',
        last_checked: new Date().toISOString(),
      });

      expect(updated.isNew).toBe(false);
      // Polled impact should update
      expect(updated.dependency.impact).toBe('Medium - degraded mode');
      // Override should be preserved
      expect(updated.dependency.impact_override).toBe('Critical - no fallback in production');
    });

    it('should preserve both overrides across multiple upserts', () => {
      store.upsert({
        service_id: testServiceId,
        name: 'BothOverrideDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      const dep = store.findByServiceId(testServiceId).find(d => d.name === 'BothOverrideDep')!;

      // Set both overrides manually
      const contactOverride = JSON.stringify({ oncall: 'alice@co.com' });
      db.prepare('UPDATE dependencies SET contact_override = ?, impact_override = ? WHERE id = ?')
        .run(contactOverride, 'Service is critical for payments', dep.id);

      // Upsert multiple times
      for (let i = 0; i < 3; i++) {
        store.upsert({
          service_id: testServiceId,
          name: 'BothOverrideDep',
          healthy: i % 2 === 0,
          health_state: i % 2 === 0 ? 0 : 2,
          health_code: i % 2 === 0 ? 200 : 500,
          latency_ms: 50 + i * 10,
          last_checked: new Date().toISOString(),
        });
      }

      const final = store.findById(dep.id)!;
      expect(final.contact_override).toBe(contactOverride);
      expect(final.impact_override).toBe('Service is critical for payments');
    });
  });

  describe('updateOverrides', () => {
    it('should set contact_override on an existing dependency', () => {
      const created = store.upsert({
        service_id: testServiceId,
        name: 'OverrideDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      const contactOverride = JSON.stringify({ team: 'Ops', slack: '#ops-alerts' });
      const updated = store.updateOverrides(created.dependency.id, {
        contact_override: contactOverride,
      });

      expect(updated).toBeDefined();
      expect(updated!.contact_override).toBe(contactOverride);
      expect(updated!.impact_override).toBeNull();
    });

    it('should set impact_override on an existing dependency', () => {
      const created = store.upsert({
        service_id: testServiceId,
        name: 'ImpactDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        impact: 'Low',
        last_checked: new Date().toISOString(),
      });

      const updated = store.updateOverrides(created.dependency.id, {
        impact_override: 'Critical - no fallback',
      });

      expect(updated).toBeDefined();
      expect(updated!.impact_override).toBe('Critical - no fallback');
      // Polled impact should be untouched
      expect(updated!.impact).toBe('Low');
    });

    it('should set both overrides at once', () => {
      const created = store.upsert({
        service_id: testServiceId,
        name: 'BothDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      const contactOverride = JSON.stringify({ oncall: 'alice@co.com' });
      const updated = store.updateOverrides(created.dependency.id, {
        contact_override: contactOverride,
        impact_override: 'High - payments affected',
      });

      expect(updated).toBeDefined();
      expect(updated!.contact_override).toBe(contactOverride);
      expect(updated!.impact_override).toBe('High - payments affected');
    });

    it('should clear an override by setting it to null', () => {
      const created = store.upsert({
        service_id: testServiceId,
        name: 'ClearDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      // Set overrides
      store.updateOverrides(created.dependency.id, {
        contact_override: JSON.stringify({ team: 'Ops' }),
        impact_override: 'High',
      });

      // Clear contact_override only
      const updated = store.updateOverrides(created.dependency.id, {
        contact_override: null,
      });

      expect(updated).toBeDefined();
      expect(updated!.contact_override).toBeNull();
      expect(updated!.impact_override).toBe('High');
    });

    it('should return undefined for non-existent dependency', () => {
      const result = store.updateOverrides('non-existent', {
        impact_override: 'Critical',
      });

      expect(result).toBeUndefined();
    });

    it('should not modify polled data columns', () => {
      const contact = { team: 'Platform' };
      const created = store.upsert({
        service_id: testServiceId,
        name: 'PolledDataDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        impact: 'Medium',
        contact,
        description: 'A dependency',
        last_checked: new Date().toISOString(),
      });

      const updated = store.updateOverrides(created.dependency.id, {
        contact_override: JSON.stringify({ team: 'Override' }),
        impact_override: 'Critical override',
      });

      expect(updated).toBeDefined();
      // Polled data should be unchanged
      expect(updated!.healthy).toBe(1);
      expect(updated!.health_state).toBe(0);
      expect(updated!.latency_ms).toBe(50);
      expect(updated!.impact).toBe('Medium');
      expect(updated!.contact).toBe(JSON.stringify(contact));
      expect(updated!.description).toBe('A dependency');
    });

    it('should update updated_at timestamp', () => {
      // Insert with a backdated updated_at so the updateOverrides timestamp is guaranteed different
      const created = store.upsert({
        service_id: testServiceId,
        name: 'TimestampDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      const pastTimestamp = '2020-01-01T00:00:00.000Z';
      db.prepare('UPDATE dependencies SET updated_at = ? WHERE id = ?')
        .run(pastTimestamp, created.dependency.id);

      const updated = store.updateOverrides(created.dependency.id, {
        impact_override: 'New impact',
      });

      expect(updated).toBeDefined();
      expect(updated!.updated_at).not.toBe(pastTimestamp);
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

  describe('findAllForWallboard', () => {
    it('should return dependencies with team and linked service info', () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS teams (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT OR IGNORE INTO teams (id, name) VALUES ('team-1', 'Test Team');
      `);

      store.upsert({
        service_id: testServiceId,
        name: 'PostgreSQL',
        canonical_name: 'postgresql',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 25,
        last_checked: new Date().toISOString(),
      });

      const results = store.findAllForWallboard();

      expect(results).toHaveLength(1);
      expect(results[0].service_name).toBe('Test Service');
      expect(results[0].service_team_id).toBe('team-1');
      expect(results[0].service_team_name).toBe('Test Team');
      expect(results[0].linked_service_name).toBeNull();
    });

    it('should include linked service name when association exists', () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS teams (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT OR IGNORE INTO teams (id, name) VALUES ('team-1', 'Test Team');
      `);

      const result = store.upsert({
        service_id: testServiceId,
        name: 'OrderAPI',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 50,
        last_checked: new Date().toISOString(),
      });

      // Create an association to the second service
      db.exec(`
        INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type)
        VALUES ('assoc-1', '${result.dependency.id}', '${testServiceId2}', 'api_call')
      `);

      const results = store.findAllForWallboard();

      const dep = results.find((d) => d.name === 'OrderAPI');
      expect(dep).toBeDefined();
      expect(dep!.target_service_id).toBe(testServiceId2);
      expect(dep!.linked_service_name).toBe('Test Service 2');
    });

    it('should exclude inactive services', () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS teams (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT OR IGNORE INTO teams (id, name) VALUES ('team-1', 'Test Team');

        INSERT INTO services (id, name, team_id, health_endpoint, is_active)
        VALUES ('svc-inactive', 'Inactive Service', 'team-1', 'http://inactive/health', 0);
      `);

      store.upsert({
        service_id: 'svc-inactive',
        name: 'SomeDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 10,
        last_checked: new Date().toISOString(),
      });

      store.upsert({
        service_id: testServiceId,
        name: 'ActiveDep',
        healthy: true,
        health_state: 0,
        health_code: 200,
        latency_ms: 10,
        last_checked: new Date().toISOString(),
      });

      const results = store.findAllForWallboard();

      // Should only include deps from active services
      expect(results.every((d) => d.service_id !== 'svc-inactive')).toBe(true);
      expect(results.some((d) => d.name === 'ActiveDep')).toBe(true);
    });
  });
});
