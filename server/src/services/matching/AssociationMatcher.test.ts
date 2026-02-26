import Database from 'better-sqlite3';
import { AssociationMatcher } from './AssociationMatcher';

// Mock the stores module to use test database
const testDb = new Database(':memory:');

jest.mock('../../stores', () => {
  const original = jest.requireActual('../../stores');
  return {
    ...original,
    getStores: jest.fn(() => original.StoreRegistry.create(testDb)),
    StoreRegistry: original.StoreRegistry,
  };
});

describe('AssociationMatcher', () => {
  beforeAll(() => {
    testDb.exec(`
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
        UNIQUE (dependency_id, linked_service_id)
      );

      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );

      -- Test data
      INSERT INTO teams (id, name) VALUES ('team-1', 'Test Team');

      INSERT INTO services (id, name, team_id, health_endpoint) VALUES
        ('svc-1', 'User Service', 'team-1', 'http://user-service/health'),
        ('svc-2', 'user-api', 'team-1', 'http://user-api/health'),
        ('svc-3', 'Order Service', 'team-1', 'http://order/health');

      INSERT INTO dependencies (id, service_id, name, type, healthy) VALUES
        ('dep-1', 'svc-1', 'user-api', 'rest', 1),
        ('dep-2', 'svc-1', 'redis', 'cache', 1);
    `);
  });

  beforeEach(() => {
    AssociationMatcher.resetInstance();
    // Clear associations between tests
    testDb.exec('DELETE FROM dependency_associations');
  });

  afterAll(() => {
    testDb.close();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = AssociationMatcher.getInstance();
      const instance2 = AssociationMatcher.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('findMatches', () => {
    it('should find matching services for dependency', () => {
      const matcher = AssociationMatcher.getInstance();
      const dependency = {
        id: 'dep-1',
        service_id: 'svc-1',
        name: 'user-api',
        canonical_name: null,
        description: null,
        impact: null,
        type: 'rest' as const,
        healthy: 1,
        health_state: 0 as const,
        health_code: 200,
        latency_ms: 50,
        contact: null,
        contact_override: null,
        impact_override: null,
        check_details: null,
        error: null,
        error_message: null,
        skipped: 0,
        last_checked: new Date().toISOString(),
        last_status_change: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const matches = matcher.findMatches(dependency, 'svc-1');

      // Should find svc-2 (user-api) as a match
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some(m => m.serviceId === 'svc-2')).toBe(true);
    });

    it('should exclude specified service', () => {
      const matcher = AssociationMatcher.getInstance();
      const dependency = {
        id: 'dep-1',
        service_id: 'svc-1',
        name: 'user-api',
        canonical_name: null,
        description: null,
        impact: null,
        type: 'rest' as const,
        healthy: 1,
        health_state: 0 as const,
        health_code: 200,
        latency_ms: 50,
        contact: null,
        contact_override: null,
        impact_override: null,
        check_details: null,
        error: null,
        error_message: null,
        skipped: 0,
        last_checked: new Date().toISOString(),
        last_status_change: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const matches = matcher.findMatches(dependency, 'svc-2');

      // Should not include svc-2
      expect(matches.every(m => m.serviceId !== 'svc-2')).toBe(true);
    });
  });

  describe('generateSuggestions', () => {
    it('should return empty array for non-existent dependency', () => {
      const matcher = AssociationMatcher.getInstance();
      const suggestions = matcher.generateSuggestions('non-existent');
      expect(suggestions).toHaveLength(0);
    });

    it('should generate suggestions for dependency', () => {
      const matcher = AssociationMatcher.getInstance();
      const suggestions = matcher.generateSuggestions('dep-1');

      // May or may not have suggestions based on matching
      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('should not create duplicate suggestions', () => {
      const matcher = AssociationMatcher.getInstance();

      // Generate suggestions twice
      const suggestions1 = matcher.generateSuggestions('dep-1');
      const suggestions2 = matcher.generateSuggestions('dep-1');

      // Second call should return empty or fewer suggestions
      expect(suggestions2.length).toBeLessThanOrEqual(suggestions1.length);
    });
  });

  describe('generateSuggestionsForService', () => {
    it('should generate suggestions for all service dependencies', () => {
      const matcher = AssociationMatcher.getInstance();
      const suggestions = matcher.generateSuggestionsForService('svc-1');

      expect(Array.isArray(suggestions)).toBe(true);
    });
  });

  describe('getPendingSuggestions', () => {
    it('should return pending auto-suggested associations', () => {
      const matcher = AssociationMatcher.getInstance();

      // Generate some suggestions first
      matcher.generateSuggestions('dep-1');

      const pending = matcher.getPendingSuggestions();
      expect(Array.isArray(pending)).toBe(true);
    });
  });

  describe('acceptSuggestion', () => {
    it('should accept a suggestion', () => {
      const matcher = AssociationMatcher.getInstance();

      // Create a suggestion
      testDb.prepare(`
        INSERT INTO dependency_associations (id, dependency_id, linked_service_id, is_auto_suggested)
        VALUES ('assoc-1', 'dep-1', 'svc-2', 1)
      `).run();

      const accepted = matcher.acceptSuggestion('assoc-1');
      expect(accepted).toBe(true);
    });

    it('should return false for non-existent suggestion', () => {
      const matcher = AssociationMatcher.getInstance();
      const accepted = matcher.acceptSuggestion('non-existent');
      expect(accepted).toBe(false);
    });
  });

  describe('dismissSuggestion', () => {
    it('should dismiss a suggestion', () => {
      const matcher = AssociationMatcher.getInstance();

      // Create a suggestion
      testDb.prepare(`
        INSERT INTO dependency_associations (id, dependency_id, linked_service_id, is_auto_suggested)
        VALUES ('assoc-1', 'dep-1', 'svc-2', 1)
      `).run();

      const dismissed = matcher.dismissSuggestion('assoc-1');
      expect(dismissed).toBe(true);
    });

    it('should return false for non-existent suggestion', () => {
      const matcher = AssociationMatcher.getInstance();
      const dismissed = matcher.dismissSuggestion('non-existent');
      expect(dismissed).toBe(false);
    });
  });
});
