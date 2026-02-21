import Database from 'better-sqlite3';
import { LatencyHistoryStore } from './LatencyHistoryStore';

describe('LatencyHistoryStore', () => {
  let db: Database.Database;
  let store: LatencyHistoryStore;
  const testDependencyId = 'dep-123';

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE dependency_latency_history (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        recorded_at TEXT NOT NULL
      )
    `);
    store = new LatencyHistoryStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('record', () => {
    it('should record latency data point', () => {
      const timestamp = new Date().toISOString();
      const result = store.record(testDependencyId, 50, timestamp);

      expect(result.id).toBeDefined();
      expect(result.dependency_id).toBe(testDependencyId);
      expect(result.latency_ms).toBe(50);
      expect(result.recorded_at).toBe(timestamp);
    });
  });

  describe('getStats24h', () => {
    it('should return stats for last 24 hours', () => {
      const now = new Date();
      store.record(testDependencyId, 10, now.toISOString());
      store.record(testDependencyId, 20, now.toISOString());
      store.record(testDependencyId, 30, now.toISOString());

      const stats = store.getStats24h(testDependencyId);

      expect(stats.avgLatencyMs24h).toBe(20);
      expect(stats.minLatencyMs24h).toBe(10);
      expect(stats.maxLatencyMs24h).toBe(30);
      expect(stats.dataPointCount).toBe(3);
    });

    it('should return null values when no data', () => {
      const stats = store.getStats24h(testDependencyId);

      expect(stats.avgLatencyMs24h).toBeNull();
      expect(stats.minLatencyMs24h).toBeNull();
      expect(stats.maxLatencyMs24h).toBeNull();
      expect(stats.dataPointCount).toBe(0);
    });
  });

  describe('getAvgLatency24h', () => {
    it('should return average latency', () => {
      const now = new Date();
      store.record(testDependencyId, 10, now.toISOString());
      store.record(testDependencyId, 20, now.toISOString());

      const avg = store.getAvgLatency24h(testDependencyId);

      expect(avg).toBe(15);
    });

    it('should return null when no data', () => {
      const avg = store.getAvgLatency24h(testDependencyId);
      expect(avg).toBeNull();
    });
  });

  describe('getHistory', () => {
    it('should return history for dependency', () => {
      const now = new Date();
      store.record(testDependencyId, 50, now.toISOString());
      store.record(testDependencyId, 60, now.toISOString());

      const history = store.getHistory(testDependencyId);

      expect(history).toHaveLength(2);
      expect(history[0].latency_ms).toBeDefined();
      expect(history[0].recorded_at).toBeDefined();
    });

    it('should respect limit option', () => {
      const now = new Date();
      store.record(testDependencyId, 50, now.toISOString());
      store.record(testDependencyId, 60, now.toISOString());
      store.record(testDependencyId, 70, now.toISOString());

      const history = store.getHistory(testDependencyId, { limit: 2 });

      expect(history).toHaveLength(2);
    });

    it('should filter by startTime', () => {
      const old = new Date('2024-01-01');
      const recent = new Date();
      store.record(testDependencyId, 50, old.toISOString());
      store.record(testDependencyId, 60, recent.toISOString());

      const history = store.getHistory(testDependencyId, {
        startTime: new Date('2024-06-01').toISOString(),
      });

      expect(history.length).toBeLessThanOrEqual(1);
    });

    it('should filter by endTime', () => {
      const recent = new Date();
      store.record(testDependencyId, 50, recent.toISOString());

      const history = store.getHistory(testDependencyId, {
        endTime: new Date('2024-01-01').toISOString(),
      });

      expect(history).toHaveLength(0);
    });
  });

  describe('getLatencyBuckets', () => {
    it('should return 1-minute buckets for 1h range', () => {
      const now = new Date();
      // Insert data points at the same minute
      store.record(testDependencyId, 10, now.toISOString());
      store.record(testDependencyId, 20, now.toISOString());
      store.record(testDependencyId, 30, now.toISOString());

      const buckets = store.getLatencyBuckets(testDependencyId, '1h');

      expect(buckets).toHaveLength(1);
      expect(buckets[0].min).toBe(10);
      expect(buckets[0].avg).toBe(20);
      expect(buckets[0].max).toBe(30);
      expect(buckets[0].count).toBe(3);
      expect(buckets[0].timestamp).toBeDefined();
    });

    it('should group data into separate buckets for different minutes', () => {
      const base = new Date();
      // Two data points at minute 0
      const t1 = new Date(base);
      t1.setSeconds(0, 0);
      store.record(testDependencyId, 10, t1.toISOString());
      store.record(testDependencyId, 20, t1.toISOString());

      // One data point 2 minutes later (different minute bucket)
      const t2 = new Date(t1);
      t2.setMinutes(t1.getMinutes() - 1);
      store.record(testDependencyId, 50, t2.toISOString());

      const buckets = store.getLatencyBuckets(testDependencyId, '1h');

      expect(buckets).toHaveLength(2);
      // Sorted ASC by timestamp
      expect(buckets[0].count + buckets[1].count).toBe(3);
    });

    it('should return empty array when no data', () => {
      const buckets = store.getLatencyBuckets(testDependencyId, '24h');
      expect(buckets).toHaveLength(0);
    });

    it('should exclude data outside the range', () => {
      const old = new Date('2020-01-01');
      store.record(testDependencyId, 50, old.toISOString());

      const buckets = store.getLatencyBuckets(testDependencyId, '1h');
      expect(buckets).toHaveLength(0);
    });

    it('should return buckets sorted chronologically', () => {
      const now = new Date();
      const earlier = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago

      store.record(testDependencyId, 100, now.toISOString());
      store.record(testDependencyId, 50, earlier.toISOString());

      const buckets = store.getLatencyBuckets(testDependencyId, '1h');

      expect(buckets.length).toBeGreaterThanOrEqual(1);
      if (buckets.length > 1) {
        expect(buckets[0].timestamp < buckets[1].timestamp).toBe(true);
      }
    });

    it('should work with all valid range values', () => {
      const now = new Date();
      store.record(testDependencyId, 42, now.toISOString());

      for (const range of ['1h', '6h', '24h', '7d', '30d'] as const) {
        const buckets = store.getLatencyBuckets(testDependencyId, range);
        expect(buckets.length).toBeGreaterThanOrEqual(1);
        expect(buckets[0].avg).toBe(42);
      }
    });
  });

  describe('deleteOlderThan', () => {
    it('should delete old records', () => {
      const old = new Date('2020-01-01').toISOString();
      store.record(testDependencyId, 50, old);

      const deleted = store.deleteOlderThan('2021-01-01');

      expect(deleted).toBe(1);
    });
  });

  describe('deleteByDependencyId', () => {
    it('should delete all records for dependency', () => {
      const now = new Date().toISOString();
      store.record(testDependencyId, 50, now);
      store.record(testDependencyId, 60, now);

      const deleted = store.deleteByDependencyId(testDependencyId);

      expect(deleted).toBe(2);
      expect(store.getHistory(testDependencyId)).toHaveLength(0);
    });
  });
});
