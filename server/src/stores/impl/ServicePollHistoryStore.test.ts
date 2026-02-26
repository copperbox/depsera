import Database from 'better-sqlite3';
import { ServicePollHistoryStore } from './ServicePollHistoryStore';

describe('ServicePollHistoryStore', () => {
  let db: Database.Database;
  let store: ServicePollHistoryStore;
  const testServiceId = 'svc-123';

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE service_poll_history (
        id TEXT PRIMARY KEY,
        service_id TEXT NOT NULL,
        error TEXT,
        recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    store = new ServicePollHistoryStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('record', () => {
    it('should create an error entry', () => {
      const timestamp = new Date().toISOString();
      const result = store.record(testServiceId, 'Connection refused', timestamp);

      expect(result.id).toBeDefined();
      expect(result.service_id).toBe(testServiceId);
      expect(result.error).toBe('Connection refused');
      expect(result.recorded_at).toBe(timestamp);
    });

    it('should create a recovery entry (null error)', () => {
      const timestamp = new Date().toISOString();
      const result = store.record(testServiceId, null, timestamp);

      expect(result.id).toBeDefined();
      expect(result.service_id).toBe(testServiceId);
      expect(result.error).toBeNull();
    });
  });

  describe('getByServiceId', () => {
    it('should return entries ordered by time desc', () => {
      const t1 = '2024-01-01T00:00:00Z';
      const t2 = '2024-01-02T00:00:00Z';
      const t3 = '2024-01-03T00:00:00Z';

      store.record(testServiceId, 'error1', t1);
      store.record(testServiceId, null, t2);
      store.record(testServiceId, 'error2', t3);

      const entries = store.getByServiceId(testServiceId, 10);

      expect(entries).toHaveLength(3);
      expect(entries[0].recorded_at).toBe(t3);
      expect(entries[1].recorded_at).toBe(t2);
      expect(entries[2].recorded_at).toBe(t1);
    });

    it('should respect limit parameter', () => {
      store.record(testServiceId, 'error1', '2024-01-01T00:00:00Z');
      store.record(testServiceId, 'error2', '2024-01-02T00:00:00Z');
      store.record(testServiceId, 'error3', '2024-01-03T00:00:00Z');

      const entries = store.getByServiceId(testServiceId, 2);

      expect(entries).toHaveLength(2);
      // Should return the two most recent
      expect(entries[0].error).toBe('error3');
      expect(entries[1].error).toBe('error2');
    });

    it('should return empty array when no entries', () => {
      const entries = store.getByServiceId(testServiceId, 10);
      expect(entries).toHaveLength(0);
    });

    it('should not return entries from other services', () => {
      store.record(testServiceId, 'error1', new Date().toISOString());
      store.record('other-svc', 'error2', new Date().toISOString());

      const entries = store.getByServiceId(testServiceId, 10);

      expect(entries).toHaveLength(1);
      expect(entries[0].service_id).toBe(testServiceId);
    });
  });

  describe('getLastEntry', () => {
    it('should return the most recent entry', () => {
      store.record(testServiceId, 'error1', '2024-01-01T00:00:00Z');
      store.record(testServiceId, 'error2', '2024-01-02T00:00:00Z');

      const last = store.getLastEntry(testServiceId);

      expect(last).toBeDefined();
      expect(last?.error).toBe('error2');
    });

    it('should return undefined when no entries exist', () => {
      const last = store.getLastEntry(testServiceId);
      expect(last).toBeUndefined();
    });
  });

  describe('getErrorCount24h', () => {
    it('should count only error entries (non-null error) in last 24h', () => {
      const now = new Date().toISOString();
      store.record(testServiceId, 'error1', now);
      store.record(testServiceId, 'error2', now);
      store.record(testServiceId, null, now); // recovery - should not count

      const count = store.getErrorCount24h(testServiceId);

      expect(count).toBe(2);
    });

    it('should not count entries older than 24h', () => {
      const old = '2020-01-01T00:00:00Z';
      store.record(testServiceId, 'old error', old);

      const count = store.getErrorCount24h(testServiceId);

      expect(count).toBe(0);
    });

    it('should return 0 when no entries exist', () => {
      const count = store.getErrorCount24h(testServiceId);
      expect(count).toBe(0);
    });
  });

  describe('deleteOlderThan', () => {
    it('should delete entries older than timestamp', () => {
      store.record(testServiceId, 'old error', '2020-01-01T00:00:00Z');
      store.record(testServiceId, 'recent error', new Date().toISOString());

      const deleted = store.deleteOlderThan('2021-01-01T00:00:00Z');

      expect(deleted).toBe(1);
      const remaining = store.getByServiceId(testServiceId, 10);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].error).toBe('recent error');
    });

    it('should return 0 when nothing to delete', () => {
      const deleted = store.deleteOlderThan('2021-01-01T00:00:00Z');
      expect(deleted).toBe(0);
    });
  });

  describe('deleteByServiceId', () => {
    it('should delete all entries for a service', () => {
      store.record(testServiceId, 'error1', new Date().toISOString());
      store.record(testServiceId, 'error2', new Date().toISOString());
      store.record('other-svc', 'error3', new Date().toISOString());

      const deleted = store.deleteByServiceId(testServiceId);

      expect(deleted).toBe(2);
      const remaining = store.getByServiceId(testServiceId, 10);
      expect(remaining).toHaveLength(0);
      // Other service entries should be untouched
      const otherEntries = store.getByServiceId('other-svc', 10);
      expect(otherEntries).toHaveLength(1);
    });

    it('should return 0 when no entries for service', () => {
      const deleted = store.deleteByServiceId(testServiceId);
      expect(deleted).toBe(0);
    });
  });
});
