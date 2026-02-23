import Database from 'better-sqlite3';

const testDb = new Database(':memory:');

jest.mock('../db', () => ({
  db: testDb,
  default: testDb,
}));

import {
  getDependentReports,
  calculateAggregatedHealth,
  HEALTH_THRESHOLDS,
  AggregatedHealthStatus,
} from './serviceHealth';
import { Dependency } from '../db/types';
import { StoreRegistry } from '../stores';

describe('serviceHealth', () => {
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

      INSERT INTO teams (id, name) VALUES ('team-1', 'Test Team');

      INSERT INTO services (id, name, team_id, health_endpoint) VALUES
        ('svc-1', 'Service One', 'team-1', 'http://svc1/health'),
        ('svc-2', 'Service Two', 'team-1', 'http://svc2/health'),
        ('svc-3', 'Service Three', 'team-1', 'http://svc3/health');
    `);

    stores = StoreRegistry.create(testDb);
  });

  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM dependency_associations');
    testDb.exec('DELETE FROM dependencies');
  });

  describe('HEALTH_THRESHOLDS', () => {
    it('should export threshold constants', () => {
      expect(HEALTH_THRESHOLDS.HEALTHY_PERCENTAGE).toBe(80);
      expect(HEALTH_THRESHOLDS.WARNING_PERCENTAGE).toBe(50);
    });
  });

  describe('getDependentReports', () => {
    it('should return empty array when no dependents', () => {
      const reports = getDependentReports('svc-1', stores);
      expect(reports).toEqual([]);
    });

    it('should return dependent reports when associations exist', () => {
      // svc-2 has a dependency on svc-1 (reports on svc-1)
      testDb.exec(`
        INSERT INTO dependencies (id, service_id, name, healthy, health_state, last_checked)
        VALUES ('dep-1', 'svc-2', 'Service One', 1, 0, datetime('now'));

        INSERT INTO dependency_associations (id, dependency_id, linked_service_id)
        VALUES ('assoc-1', 'dep-1', 'svc-1');
      `);

      const reports = getDependentReports('svc-1', stores);
      expect(reports.length).toBe(1);
      expect(reports[0].reporting_service_id).toBe('svc-2');
    });

    it('should use global stores when not passed explicitly', () => {
      testDb.exec(`
        INSERT INTO dependencies (id, service_id, name, healthy, health_state)
        VALUES ('dep-2', 'svc-3', 'Service One', 1, 0);

        INSERT INTO dependency_associations (id, dependency_id, linked_service_id)
        VALUES ('assoc-2', 'dep-2', 'svc-1');
      `);

      const reports = getDependentReports('svc-1');
      expect(reports.length).toBeGreaterThan(0);
    });
  });

  describe('calculateAggregatedHealth', () => {
    it('should return unknown status when no dependents and no dependencies', () => {
      const health = calculateAggregatedHealth('svc-1');

      expect(health.status).toBe('unknown');
      expect(health.healthy_reports).toBe(0);
      expect(health.warning_reports).toBe(0);
      expect(health.critical_reports).toBe(0);
      expect(health.total_reports).toBe(0);
      expect(health.dependent_count).toBe(0);
      expect(health.last_report).toBeNull();
    });

    it('should calculate healthy status from own dependencies', () => {
      const dependencies: Dependency[] = [
        createDependency('d1', 1, 0, '2024-01-01T00:00:00Z'),
        createDependency('d2', 1, 0, '2024-01-02T00:00:00Z'),
        createDependency('d3', 1, 0, '2024-01-03T00:00:00Z'),
        createDependency('d4', 1, 0, '2024-01-04T00:00:00Z'),
        createDependency('d5', 1, 0, '2024-01-05T00:00:00Z'),
      ];

      const health = calculateAggregatedHealth('svc-1', dependencies);

      expect(health.status).toBe('healthy');
      expect(health.healthy_reports).toBe(5);
      expect(health.warning_reports).toBe(0);
      expect(health.critical_reports).toBe(0);
      expect(health.last_report).toBe('2024-01-05T00:00:00Z');
    });

    it('should calculate warning status from own dependencies', () => {
      const dependencies: Dependency[] = [
        createDependency('d1', 1, 0),
        createDependency('d2', 1, 0),
        createDependency('d3', 0, 2), // critical
        createDependency('d4', 0, 2), // critical
      ];

      const health = calculateAggregatedHealth('svc-1', dependencies);

      expect(health.status).toBe('warning');
      expect(health.healthy_reports).toBe(2);
      expect(health.critical_reports).toBe(2);
    });

    it('should calculate critical status from own dependencies', () => {
      const dependencies: Dependency[] = [
        createDependency('d1', 1, 0),
        createDependency('d2', 0, 2), // critical
        createDependency('d3', 0, 2), // critical
        createDependency('d4', 0, 2), // critical
      ];

      const health = calculateAggregatedHealth('svc-1', dependencies);

      expect(health.status).toBe('critical');
    });

    it('should count warning health_state from dependencies', () => {
      const dependencies: Dependency[] = [
        createDependency('d1', 1, 1), // warning
        createDependency('d2', 1, 1), // warning
        createDependency('d3', 1, 0), // healthy
      ];

      const health = calculateAggregatedHealth('svc-1', dependencies);

      expect(health.warning_reports).toBe(2);
      expect(health.healthy_reports).toBe(1);
    });

    it('should return unknown when dependencies have no health info', () => {
      const dependencies: Dependency[] = [
        createDependency('d1', null, null),
        createDependency('d2', null, null),
      ];

      const health = calculateAggregatedHealth('svc-1', dependencies);

      expect(health.status).toBe('unknown');
    });

    it('should calculate status from dependent reports', () => {
      // Set up dependencies with associations
      testDb.exec(`
        INSERT INTO dependencies (id, service_id, name, healthy, health_state, last_checked)
        VALUES
          ('dep-a', 'svc-2', 'Service One', 1, 0, datetime('now')),
          ('dep-b', 'svc-3', 'Service One', 1, 0, datetime('now'));

        INSERT INTO dependency_associations (id, dependency_id, linked_service_id)
        VALUES
          ('assoc-a', 'dep-a', 'svc-1'),
          ('assoc-b', 'dep-b', 'svc-1');
      `);

      const health = calculateAggregatedHealth('svc-1');

      expect(health.status).toBe('healthy');
      expect(health.total_reports).toBe(2);
      expect(health.dependent_count).toBe(2);
    });

    it('should count warning reports from dependents', () => {
      testDb.exec(`
        INSERT INTO dependencies (id, service_id, name, healthy, health_state, last_checked)
        VALUES
          ('dep-w1', 'svc-2', 'Service One', 1, 1, datetime('now')),
          ('dep-w2', 'svc-3', 'Service One', 1, 1, datetime('now'));

        INSERT INTO dependency_associations (id, dependency_id, linked_service_id)
        VALUES
          ('assoc-w1', 'dep-w1', 'svc-1'),
          ('assoc-w2', 'dep-w2', 'svc-1');
      `);

      const health = calculateAggregatedHealth('svc-1');

      expect(health.warning_reports).toBe(2);
    });

    it('should count critical reports from dependents', () => {
      testDb.exec(`
        INSERT INTO dependencies (id, service_id, name, healthy, health_state, last_checked)
        VALUES
          ('dep-c1', 'svc-2', 'Service One', 0, 2, datetime('now')),
          ('dep-c2', 'svc-3', 'Service One', 0, null, datetime('now'));

        INSERT INTO dependency_associations (id, dependency_id, linked_service_id)
        VALUES
          ('assoc-c1', 'dep-c1', 'svc-1'),
          ('assoc-c2', 'dep-c2', 'svc-1');
      `);

      const health = calculateAggregatedHealth('svc-1');

      expect(health.critical_reports).toBe(2);
    });

    it('should return unknown when all reports have null health', () => {
      testDb.exec(`
        INSERT INTO dependencies (id, service_id, name, healthy, health_state, last_checked)
        VALUES ('dep-null', 'svc-2', 'Service One', null, null, datetime('now'));

        INSERT INTO dependency_associations (id, dependency_id, linked_service_id)
        VALUES ('assoc-null', 'dep-null', 'svc-1');
      `);

      const health = calculateAggregatedHealth('svc-1');

      expect(health.status).toBe('unknown');
      expect(health.total_reports).toBe(1);
    });

    it('should handle dependencies without last_checked', () => {
      const dependencies: Dependency[] = [
        createDependency('d1', 1, 0, undefined),
        createDependency('d2', 1, 0, '2024-01-01T00:00:00Z'),
      ];

      const health = calculateAggregatedHealth('svc-1', dependencies);

      expect(health.last_report).toBe('2024-01-01T00:00:00Z');
    });
  });
});

function createDependency(
  id: string,
  healthy: number | null,
  healthState: number | null,
  lastChecked?: string
): Dependency {
  return {
    id,
    service_id: 'svc-1',
    name: `Dependency ${id}`,
    canonical_name: null,
    description: null,
    impact: null,
    type: 'rest',
    healthy,
    health_state: healthState as 0 | 1 | 2 | null,
    health_code: null,
    latency_ms: null,
    check_details: null,
    error: null,
    error_message: null,
    last_checked: lastChecked || null,
    last_status_change: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
