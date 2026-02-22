import Database from 'better-sqlite3';
import { AssociationStore } from './AssociationStore';

describe('AssociationStore', () => {
  let db: Database.Database;
  let store: AssociationStore;
  const testDependencyId = 'dep-123';
  const testServiceId = 'svc-123';
  const testLinkedServiceId = 'svc-456';

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
        is_active INTEGER NOT NULL DEFAULT 1,
        is_external INTEGER NOT NULL DEFAULT 0,
        description TEXT
      );

      CREATE TABLE dependencies (
        id TEXT PRIMARY KEY,
        service_id TEXT NOT NULL,
        name TEXT NOT NULL
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
        UNIQUE (dependency_id, linked_service_id)
      );

      INSERT INTO services (id, name, team_id, health_endpoint) VALUES
        ('${testServiceId}', 'Test Service', 'team-1', 'http://test/health'),
        ('${testLinkedServiceId}', 'Linked Service', 'team-1', 'http://linked/health');

      INSERT INTO dependencies (id, service_id, name) VALUES
        ('${testDependencyId}', '${testServiceId}', 'Test Dependency');
    `);
    store = new AssociationStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should create association', () => {
      const assoc = store.create({
        dependency_id: testDependencyId,
        linked_service_id: testLinkedServiceId,
        association_type: 'api_call',
      });

      expect(assoc.id).toBeDefined();
      expect(assoc.dependency_id).toBe(testDependencyId);
      expect(assoc.linked_service_id).toBe(testLinkedServiceId);
      expect(assoc.association_type).toBe('api_call');
      expect(assoc.is_auto_suggested).toBe(0);
      expect(assoc.is_dismissed).toBe(0);
    });

    it('should create auto-suggested association', () => {
      const assoc = store.create({
        dependency_id: testDependencyId,
        linked_service_id: testLinkedServiceId,
        association_type: 'database',
        is_auto_suggested: true,
        confidence_score: 0.85,
      });

      expect(assoc.is_auto_suggested).toBe(1);
      expect(assoc.confidence_score).toBe(0.85);
    });
  });

  describe('findById', () => {
    it('should find existing association', () => {
      const created = store.create({
        dependency_id: testDependencyId,
        linked_service_id: testLinkedServiceId,
        association_type: 'api_call',
      });

      const found = store.findById(created.id);
      expect(found).toBeDefined();
      expect(found?.dependency_id).toBe(testDependencyId);
    });

    it('should return undefined for non-existent association', () => {
      const found = store.findById('non-existent');
      expect(found).toBeUndefined();
    });
  });

  describe('findByDependencyId', () => {
    it('should find associations for dependency', () => {
      store.create({
        dependency_id: testDependencyId,
        linked_service_id: testLinkedServiceId,
        association_type: 'api_call',
      });

      const assocs = store.findByDependencyId(testDependencyId);
      expect(assocs).toHaveLength(1);
    });
  });

  describe('findByDependencyIdWithService', () => {
    it('should return associations with service data', () => {
      store.create({
        dependency_id: testDependencyId,
        linked_service_id: testLinkedServiceId,
        association_type: 'api_call',
      });

      const assocs = store.findByDependencyIdWithService(testDependencyId);
      expect(assocs).toHaveLength(1);
      expect(assocs[0].linked_service_name).toBe('Linked Service');
      expect(assocs[0].linked_service_health_endpoint).toBe('http://linked/health');
    });
  });

  describe('findByLinkedServiceId', () => {
    it('should find associations by linked service', () => {
      store.create({
        dependency_id: testDependencyId,
        linked_service_id: testLinkedServiceId,
        association_type: 'api_call',
      });

      const assocs = store.findByLinkedServiceId(testLinkedServiceId);
      expect(assocs).toHaveLength(1);
    });
  });

  describe('findPendingSuggestions', () => {
    it('should find pending auto-suggested associations', () => {
      store.create({
        dependency_id: testDependencyId,
        linked_service_id: testLinkedServiceId,
        association_type: 'api_call',
        is_auto_suggested: true,
        confidence_score: 0.85,
      });

      const suggestions = store.findPendingSuggestions();
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].dependency_name).toBe('Test Dependency');
      expect(suggestions[0].service_name).toBe('Test Service');
      expect(suggestions[0].linked_service_name).toBe('Linked Service');
    });

    it('should not include dismissed suggestions', () => {
      const assoc = store.create({
        dependency_id: testDependencyId,
        linked_service_id: testLinkedServiceId,
        association_type: 'api_call',
        is_auto_suggested: true,
      });
      store.dismissSuggestion(assoc.id);

      const suggestions = store.findPendingSuggestions();
      expect(suggestions).toHaveLength(0);
    });
  });

  describe('existsForDependencyAndService', () => {
    it('should return true when association exists', () => {
      store.create({
        dependency_id: testDependencyId,
        linked_service_id: testLinkedServiceId,
        association_type: 'api_call',
      });

      expect(store.existsForDependencyAndService(testDependencyId, testLinkedServiceId)).toBe(true);
    });

    it('should return false when association does not exist', () => {
      expect(store.existsForDependencyAndService(testDependencyId, testLinkedServiceId)).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete association', () => {
      const assoc = store.create({
        dependency_id: testDependencyId,
        linked_service_id: testLinkedServiceId,
        association_type: 'api_call',
      });

      const deleted = store.delete(assoc.id);
      expect(deleted).toBe(true);
      expect(store.findById(assoc.id)).toBeUndefined();
    });

    it('should return false for non-existent association', () => {
      const deleted = store.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('deleteByDependencyId', () => {
    it('should delete all associations for dependency', () => {
      store.create({
        dependency_id: testDependencyId,
        linked_service_id: testLinkedServiceId,
        association_type: 'api_call',
      });

      const deleted = store.deleteByDependencyId(testDependencyId);
      expect(deleted).toBe(1);
    });
  });

  describe('acceptSuggestion', () => {
    it('should accept auto-suggested association', () => {
      const assoc = store.create({
        dependency_id: testDependencyId,
        linked_service_id: testLinkedServiceId,
        association_type: 'api_call',
        is_auto_suggested: true,
      });

      const accepted = store.acceptSuggestion(assoc.id);
      expect(accepted).toBe(true);

      const updated = store.findById(assoc.id);
      expect(updated?.is_auto_suggested).toBe(0);
    });

    it('should return false for non-suggested association', () => {
      const assoc = store.create({
        dependency_id: testDependencyId,
        linked_service_id: testLinkedServiceId,
        association_type: 'api_call',
        is_auto_suggested: false,
      });

      const accepted = store.acceptSuggestion(assoc.id);
      expect(accepted).toBe(false);
    });
  });

  describe('dismissSuggestion', () => {
    it('should dismiss auto-suggested association', () => {
      const assoc = store.create({
        dependency_id: testDependencyId,
        linked_service_id: testLinkedServiceId,
        association_type: 'api_call',
        is_auto_suggested: true,
      });

      const dismissed = store.dismissSuggestion(assoc.id);
      expect(dismissed).toBe(true);

      const updated = store.findById(assoc.id);
      expect(updated?.is_dismissed).toBe(1);
    });

    it('should return false for non-suggested association', () => {
      const assoc = store.create({
        dependency_id: testDependencyId,
        linked_service_id: testLinkedServiceId,
        association_type: 'api_call',
        is_auto_suggested: false,
      });

      const dismissed = store.dismissSuggestion(assoc.id);
      expect(dismissed).toBe(false);
    });
  });

  describe('reactivateDismissed', () => {
    it('should reactivate dismissed association with new type', () => {
      const assoc = store.create({
        dependency_id: testDependencyId,
        linked_service_id: testLinkedServiceId,
        association_type: 'api_call',
        is_auto_suggested: true,
      });
      store.dismissSuggestion(assoc.id);

      const reactivated = store.reactivateDismissed(assoc.id, 'database');
      expect(reactivated).toBe(true);

      const updated = store.findById(assoc.id);
      expect(updated?.is_dismissed).toBe(0);
      expect(updated?.is_auto_suggested).toBe(0);
      expect(updated?.association_type).toBe('database');
    });
  });

  describe('exists', () => {
    it('should return true for existing association', () => {
      const assoc = store.create({
        dependency_id: testDependencyId,
        linked_service_id: testLinkedServiceId,
        association_type: 'api_call',
      });

      expect(store.exists(assoc.id)).toBe(true);
    });

    it('should return false for non-existent association', () => {
      expect(store.exists('non-existent')).toBe(false);
    });
  });

  describe('count', () => {
    beforeEach(() => {
      store.create({
        dependency_id: testDependencyId,
        linked_service_id: testLinkedServiceId,
        association_type: 'api_call',
        is_auto_suggested: true,
      });
    });

    it('should count all associations', () => {
      expect(store.count()).toBe(1);
    });

    it('should count with dependencyId filter', () => {
      expect(store.count({ dependencyId: testDependencyId })).toBe(1);
      expect(store.count({ dependencyId: 'other' })).toBe(0);
    });

    it('should count with linkedServiceId filter', () => {
      expect(store.count({ linkedServiceId: testLinkedServiceId })).toBe(1);
    });

    it('should count with isAutoSuggested filter', () => {
      expect(store.count({ isAutoSuggested: true })).toBe(1);
      expect(store.count({ isAutoSuggested: false })).toBe(0);
    });

    it('should count with isDismissed filter', () => {
      expect(store.count({ isDismissed: false })).toBe(1);
      expect(store.count({ isDismissed: true })).toBe(0);
    });
  });
});
