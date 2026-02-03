import Database from 'better-sqlite3';
import { ErrorHistoryStore } from './ErrorHistoryStore';

describe('ErrorHistoryStore', () => {
  let db: Database.Database;
  let store: ErrorHistoryStore;
  const testDependencyId = 'dep-123';

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE dependency_error_history (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        error TEXT,
        error_message TEXT,
        recorded_at TEXT NOT NULL
      )
    `);
    store = new ErrorHistoryStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('record', () => {
    it('should record error', () => {
      const timestamp = new Date().toISOString();
      const result = store.record(
        testDependencyId,
        '{"code": 500}',
        'Internal error',
        timestamp
      );

      expect(result.id).toBeDefined();
      expect(result.dependency_id).toBe(testDependencyId);
      expect(result.error).toBe('{"code": 500}');
      expect(result.error_message).toBe('Internal error');
    });

    it('should record recovery (null error)', () => {
      const timestamp = new Date().toISOString();
      const result = store.record(testDependencyId, null, null, timestamp);

      expect(result.error).toBeNull();
      expect(result.error_message).toBeNull();
    });
  });

  describe('getErrors24h', () => {
    it('should return errors from last 24 hours', () => {
      const now = new Date();
      store.record(testDependencyId, '{"code": 500}', 'Error', now.toISOString());

      const errors = store.getErrors24h(testDependencyId);

      expect(errors).toHaveLength(1);
      expect(errors[0].error).toBe('{"code": 500}');
    });

    it('should return empty array when no errors', () => {
      const errors = store.getErrors24h(testDependencyId);
      expect(errors).toHaveLength(0);
    });
  });

  describe('getLastEntry', () => {
    it('should return most recent entry', () => {
      const earlier = new Date('2024-01-01T00:00:00Z');
      const later = new Date('2024-01-02T00:00:00Z');
      store.record(testDependencyId, 'error1', 'msg1', earlier.toISOString());
      store.record(testDependencyId, 'error2', 'msg2', later.toISOString());

      const last = store.getLastEntry(testDependencyId);

      expect(last).toBeDefined();
      expect(last?.error).toBe('error2');
    });

    it('should return undefined when no entries', () => {
      const last = store.getLastEntry(testDependencyId);
      expect(last).toBeUndefined();
    });
  });

  describe('isDuplicate', () => {
    it('should return true for duplicate error', () => {
      const now = new Date().toISOString();
      store.record(testDependencyId, 'error1', 'msg1', now);

      const isDup = store.isDuplicate(testDependencyId, 'error1', 'msg1');

      expect(isDup).toBe(true);
    });

    it('should return false for different error', () => {
      const now = new Date().toISOString();
      store.record(testDependencyId, 'error1', 'msg1', now);

      const isDup = store.isDuplicate(testDependencyId, 'error2', 'msg2');

      expect(isDup).toBe(false);
    });

    it('should return false when no entries', () => {
      const isDup = store.isDuplicate(testDependencyId, 'error1', 'msg1');
      expect(isDup).toBe(false);
    });
  });

  describe('getErrorCount24h', () => {
    it('should count errors (excluding recoveries)', () => {
      const now = new Date().toISOString();
      store.record(testDependencyId, 'error1', 'msg1', now);
      store.record(testDependencyId, 'error2', 'msg2', now);
      store.record(testDependencyId, null, null, now); // recovery

      const count = store.getErrorCount24h(testDependencyId);

      expect(count).toBe(2);
    });
  });

  describe('deleteOlderThan', () => {
    it('should delete old records', () => {
      const old = new Date('2020-01-01').toISOString();
      store.record(testDependencyId, 'error', 'msg', old);

      const deleted = store.deleteOlderThan('2021-01-01');

      expect(deleted).toBe(1);
    });
  });

  describe('deleteByDependencyId', () => {
    it('should delete all records for dependency', () => {
      const now = new Date().toISOString();
      store.record(testDependencyId, 'error1', 'msg1', now);
      store.record(testDependencyId, 'error2', 'msg2', now);

      const deleted = store.deleteByDependencyId(testDependencyId);

      expect(deleted).toBe(2);
    });
  });
});
