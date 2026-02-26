import Database from 'better-sqlite3';
import { StatusChangeEventStore } from './StatusChangeEventStore';

describe('StatusChangeEventStore', () => {
  let db: Database.Database;
  let store: StatusChangeEventStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE status_change_events (
        id TEXT PRIMARY KEY,
        service_id TEXT NOT NULL,
        service_name TEXT NOT NULL,
        dependency_name TEXT NOT NULL,
        previous_healthy INTEGER,
        current_healthy INTEGER NOT NULL,
        recorded_at TEXT NOT NULL
      )
    `);
    store = new StatusChangeEventStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('record', () => {
    it('should record a status change event', () => {
      const timestamp = new Date().toISOString();
      const result = store.record('svc-1', 'My Service', 'Database', true, false, timestamp);

      expect(result.id).toBeDefined();
      expect(result.service_id).toBe('svc-1');
      expect(result.service_name).toBe('My Service');
      expect(result.dependency_name).toBe('Database');
      expect(result.previous_healthy).toBe(1);
      expect(result.current_healthy).toBe(0);
      expect(result.recorded_at).toBe(timestamp);
    });

    it('should handle null previous_healthy for new dependencies', () => {
      const timestamp = new Date().toISOString();
      const result = store.record('svc-1', 'My Service', 'Cache', null, true, timestamp);

      expect(result.previous_healthy).toBeNull();
      expect(result.current_healthy).toBe(1);
    });

    it('should record recovery event (critical to healthy)', () => {
      const timestamp = new Date().toISOString();
      const result = store.record('svc-1', 'My Service', 'API', false, true, timestamp);

      expect(result.previous_healthy).toBe(0);
      expect(result.current_healthy).toBe(1);
    });
  });

  describe('getRecent', () => {
    it('should return events sorted by most recent first', () => {
      const t1 = '2024-01-01T00:00:00.000Z';
      const t2 = '2024-01-02T00:00:00.000Z';
      const t3 = '2024-01-03T00:00:00.000Z';

      store.record('svc-1', 'Service A', 'DB', true, false, t1);
      store.record('svc-2', 'Service B', 'Cache', false, true, t3);
      store.record('svc-1', 'Service A', 'DB', false, true, t2);

      const events = store.getRecent(10);

      expect(events).toHaveLength(3);
      expect(events[0].recorded_at).toBe(t3);
      expect(events[1].recorded_at).toBe(t2);
      expect(events[2].recorded_at).toBe(t1);
    });

    it('should respect the limit parameter', () => {
      const now = new Date();
      for (let i = 0; i < 10; i++) {
        const t = new Date(now.getTime() + i * 1000).toISOString();
        store.record('svc-1', 'Service', `Dep-${i}`, true, false, t);
      }

      const events = store.getRecent(5);
      expect(events).toHaveLength(5);
    });

    it('should return empty array when no events', () => {
      const events = store.getRecent(10);
      expect(events).toHaveLength(0);
    });
  });

  describe('getUnstable', () => {
    it('should return dependencies grouped by name with change count', () => {
      const now = new Date();
      const recent = (minutesAgo: number) =>
        new Date(now.getTime() - minutesAgo * 60000).toISOString();

      // "Database" changes 3 times
      store.record('svc-1', 'Service A', 'Database', true, false, recent(10));
      store.record('svc-1', 'Service A', 'Database', false, true, recent(5));
      store.record('svc-1', 'Service A', 'Database', true, false, recent(1));

      // "Cache" changes 1 time
      store.record('svc-2', 'Service B', 'Cache', true, false, recent(3));

      const result = store.getUnstable(24, 5);

      expect(result).toHaveLength(2);
      expect(result[0].dependency_name).toBe('Database');
      expect(result[0].change_count).toBe(3);
      expect(result[0].current_healthy).toBe(0);
      expect(result[0].service_name).toBe('Service A');
      expect(result[1].dependency_name).toBe('Cache');
      expect(result[1].change_count).toBe(1);
    });

    it('should exclude events older than the time window', () => {
      const old = '2020-01-01T00:00:00.000Z';
      store.record('svc-1', 'Service A', 'Database', true, false, old);

      const result = store.getUnstable(24, 5);
      expect(result).toHaveLength(0);
    });

    it('should respect the limit parameter', () => {
      const now = new Date();
      for (let i = 0; i < 10; i++) {
        const t = new Date(now.getTime() - i * 60000).toISOString();
        store.record('svc-1', 'Service', `Dep-${i}`, true, false, t);
      }

      const result = store.getUnstable(24, 3);
      expect(result).toHaveLength(3);
    });

    it('should return empty array when no events in window', () => {
      const result = store.getUnstable(24, 5);
      expect(result).toHaveLength(0);
    });

    it('should pick current_healthy from the most recent event', () => {
      const now = new Date();
      // Goes unhealthy, then recovers
      store.record('svc-1', 'Service A', 'API', true, false,
        new Date(now.getTime() - 60000).toISOString());
      store.record('svc-1', 'Service A', 'API', false, true,
        new Date(now.getTime() - 30000).toISOString());

      const result = store.getUnstable(24, 5);
      expect(result[0].current_healthy).toBe(1);
    });
  });

  describe('deleteOlderThan', () => {
    it('should delete old records and return count', () => {
      store.record('svc-1', 'Service', 'DB', true, false, '2020-01-01T00:00:00.000Z');
      store.record('svc-1', 'Service', 'DB', false, true, '2024-06-01T00:00:00.000Z');

      const deleted = store.deleteOlderThan('2021-01-01T00:00:00.000Z');

      expect(deleted).toBe(1);
      expect(store.getRecent(10)).toHaveLength(1);
    });

    it('should return 0 when nothing to delete', () => {
      const deleted = store.deleteOlderThan('2021-01-01T00:00:00.000Z');
      expect(deleted).toBe(0);
    });
  });
});
