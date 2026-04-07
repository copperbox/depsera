import Database from 'better-sqlite3';
import { ApiKeyUsageBucket } from '../../db/types';
import { ApiKeyUsageStore } from './ApiKeyUsageStore';

describe('ApiKeyUsageStore', () => {
  let db: Database.Database;
  let store: ApiKeyUsageStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE api_key_usage_buckets (
        api_key_id      TEXT    NOT NULL,
        bucket_start    TEXT    NOT NULL,
        granularity     TEXT    NOT NULL CHECK(granularity IN ('minute', 'hour')),
        push_count      INTEGER NOT NULL DEFAULT 0,
        rejected_count  INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (api_key_id, bucket_start, granularity)
      );
      CREATE INDEX idx_usage_buckets_key_start ON api_key_usage_buckets(api_key_id, bucket_start);
      CREATE INDEX idx_usage_buckets_start ON api_key_usage_buckets(bucket_start);

      CREATE TABLE team_api_keys (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        rate_limit_rpm INTEGER,
        rate_limit_admin_locked INTEGER NOT NULL DEFAULT 0,
        last_used_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_by TEXT
      );
    `);
    store = new ApiKeyUsageStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('bulkUpsert (DPS-100j)', () => {
    it('should insert new rows correctly', () => {
      store.bulkUpsert([
        { api_key_id: 'key-1', bucket_start: '2025-01-15T14:32:00', granularity: 'minute', push_count: 5, rejected_count: 1 },
      ]);

      const rows = db.prepare('SELECT * FROM api_key_usage_buckets').all() as ApiKeyUsageBucket[];
      expect(rows).toHaveLength(1);
      expect(rows[0].api_key_id).toBe('key-1');
      expect(rows[0].bucket_start).toBe('2025-01-15T14:32:00');
      expect(rows[0].granularity).toBe('minute');
      expect(rows[0].push_count).toBe(5);
      expect(rows[0].rejected_count).toBe(1);
    });

    it('should accumulate push_count and rejected_count on conflict', () => {
      store.bulkUpsert([
        { api_key_id: 'key-1', bucket_start: '2025-01-15T14:32:00', granularity: 'minute', push_count: 5, rejected_count: 1 },
      ]);

      // Upsert same bucket again
      store.bulkUpsert([
        { api_key_id: 'key-1', bucket_start: '2025-01-15T14:32:00', granularity: 'minute', push_count: 3, rejected_count: 2 },
      ]);

      const rows = db.prepare('SELECT * FROM api_key_usage_buckets').all() as ApiKeyUsageBucket[];
      expect(rows).toHaveLength(1);
      expect(rows[0].push_count).toBe(8);     // 5 + 3
      expect(rows[0].rejected_count).toBe(3); // 1 + 2
    });

    it('should handle mixed new and existing entries in one transaction', () => {
      store.bulkUpsert([
        { api_key_id: 'key-1', bucket_start: '2025-01-15T14:32:00', granularity: 'minute', push_count: 5, rejected_count: 0 },
      ]);

      store.bulkUpsert([
        // Existing row — should accumulate
        { api_key_id: 'key-1', bucket_start: '2025-01-15T14:32:00', granularity: 'minute', push_count: 3, rejected_count: 0 },
        // New row
        { api_key_id: 'key-2', bucket_start: '2025-01-15T14:32:00', granularity: 'minute', push_count: 10, rejected_count: 0 },
      ]);

      const rows = db.prepare('SELECT * FROM api_key_usage_buckets ORDER BY api_key_id').all() as ApiKeyUsageBucket[];
      expect(rows).toHaveLength(2);
      expect(rows[0].api_key_id).toBe('key-1');
      expect(rows[0].push_count).toBe(8); // 5 + 3
      expect(rows[1].api_key_id).toBe('key-2');
      expect(rows[1].push_count).toBe(10);
    });

    it('should do nothing when entries is empty', () => {
      store.bulkUpsert([]);

      const rows = db.prepare('SELECT * FROM api_key_usage_buckets').all();
      expect(rows).toHaveLength(0);
    });
  });

  describe('getBuckets (DPS-100k)', () => {
    beforeEach(() => {
      store.bulkUpsert([
        { api_key_id: 'key-1', bucket_start: '2025-01-15T14:00:00', granularity: 'minute', push_count: 10, rejected_count: 0 },
        { api_key_id: 'key-1', bucket_start: '2025-01-15T14:01:00', granularity: 'minute', push_count: 20, rejected_count: 1 },
        { api_key_id: 'key-1', bucket_start: '2025-01-15T14:02:00', granularity: 'minute', push_count: 30, rejected_count: 0 },
        { api_key_id: 'key-1', bucket_start: '2025-01-15T14:00:00', granularity: 'hour', push_count: 100, rejected_count: 5 },
        { api_key_id: 'key-1', bucket_start: '2025-01-15T15:00:00', granularity: 'hour', push_count: 200, rejected_count: 0 },
        { api_key_id: 'key-2', bucket_start: '2025-01-15T14:00:00', granularity: 'minute', push_count: 50, rejected_count: 0 },
      ]);
    });

    it('should return rows in the specified time range ordered by bucket_start ASC', () => {
      const buckets = store.getBuckets('key-1', 'minute', '2025-01-15T14:00:00', '2025-01-15T14:01:00');

      expect(buckets).toHaveLength(2);
      expect(buckets[0].bucket_start).toBe('2025-01-15T14:00:00');
      expect(buckets[1].bucket_start).toBe('2025-01-15T14:01:00');
    });

    it('should return only rows matching the specified granularity', () => {
      const minuteBuckets = store.getBuckets('key-1', 'minute', '2025-01-15T14:00:00', '2025-01-15T15:00:00');
      const hourBuckets = store.getBuckets('key-1', 'hour', '2025-01-15T14:00:00', '2025-01-15T15:00:00');

      expect(minuteBuckets).toHaveLength(3);
      expect(minuteBuckets.every(b => b.granularity === 'minute')).toBe(true);

      expect(hourBuckets).toHaveLength(2);
      expect(hourBuckets.every(b => b.granularity === 'hour')).toBe(true);
    });

    it('should return empty array for a key with no data', () => {
      const buckets = store.getBuckets('key-nonexistent', 'minute', '2025-01-15T14:00:00', '2025-01-15T15:00:00');
      expect(buckets).toEqual([]);
    });

    it('should not return rows outside the time range', () => {
      const buckets = store.getBuckets('key-1', 'minute', '2025-01-15T14:00:00', '2025-01-15T14:00:00');
      expect(buckets).toHaveLength(1);
      expect(buckets[0].bucket_start).toBe('2025-01-15T14:00:00');
    });
  });

  describe('getSummaryForKeys (DPS-100k)', () => {
    beforeEach(() => {
      store.bulkUpsert([
        { api_key_id: 'key-1', bucket_start: '2025-01-15T14:00:00', granularity: 'minute', push_count: 10, rejected_count: 1 },
        { api_key_id: 'key-1', bucket_start: '2025-01-15T14:01:00', granularity: 'minute', push_count: 20, rejected_count: 2 },
        { api_key_id: 'key-2', bucket_start: '2025-01-15T14:00:00', granularity: 'minute', push_count: 50, rejected_count: 5 },
      ]);
    });

    it('should aggregate push_count and rejected_count correctly across rows', () => {
      const summary = store.getSummaryForKeys(['key-1'], '2025-01-15T14:00:00', '2025-01-15T14:01:00');

      const key1 = summary.get('key-1');
      expect(key1).toBeDefined();
      expect(key1!.push_count).toBe(30);     // 10 + 20
      expect(key1!.rejected_count).toBe(3);  // 1 + 2
    });

    it('should handle multiple keys', () => {
      const summary = store.getSummaryForKeys(['key-1', 'key-2'], '2025-01-15T14:00:00', '2025-01-15T14:01:00');

      expect(summary.get('key-1')!.push_count).toBe(30);
      expect(summary.get('key-2')!.push_count).toBe(50);
    });

    it('should not include keys that have no data in the range', () => {
      const summary = store.getSummaryForKeys(['key-1', 'key-nonexistent'], '2025-01-15T14:00:00', '2025-01-15T14:01:00');

      expect(summary.has('key-1')).toBe(true);
      expect(summary.has('key-nonexistent')).toBe(false);
    });

    it('should return empty map for empty key IDs array', () => {
      const summary = store.getSummaryForKeys([], '2025-01-15T14:00:00', '2025-01-15T14:01:00');
      expect(summary.size).toBe(0);
    });
  });

  describe('prune methods (DPS-100l)', () => {
    beforeEach(() => {
      store.bulkUpsert([
        // Old minute rows
        { api_key_id: 'key-1', bucket_start: '2025-01-14T10:00:00', granularity: 'minute', push_count: 5, rejected_count: 0 },
        { api_key_id: 'key-1', bucket_start: '2025-01-14T10:01:00', granularity: 'minute', push_count: 5, rejected_count: 0 },
        // Recent minute row
        { api_key_id: 'key-1', bucket_start: '2025-01-15T14:00:00', granularity: 'minute', push_count: 10, rejected_count: 0 },
        // Old hour rows
        { api_key_id: 'key-1', bucket_start: '2025-01-14T10:00:00', granularity: 'hour', push_count: 100, rejected_count: 0 },
        // Recent hour row
        { api_key_id: 'key-1', bucket_start: '2025-01-15T14:00:00', granularity: 'hour', push_count: 200, rejected_count: 0 },
      ]);
    });

    describe('pruneMinuteBuckets', () => {
      it('should delete minute rows older than cutoff', () => {
        const deleted = store.pruneMinuteBuckets('2025-01-15T00:00:00');

        expect(deleted).toBe(2); // two old minute rows

        const remaining = db.prepare('SELECT * FROM api_key_usage_buckets WHERE granularity = ?').all('minute') as ApiKeyUsageBucket[];
        expect(remaining).toHaveLength(1);
        expect(remaining[0].bucket_start).toBe('2025-01-15T14:00:00');
      });

      it('should not delete hour rows', () => {
        store.pruneMinuteBuckets('2025-01-15T00:00:00');

        const hourRows = db.prepare('SELECT * FROM api_key_usage_buckets WHERE granularity = ?').all('hour') as ApiKeyUsageBucket[];
        expect(hourRows).toHaveLength(2);
      });
    });

    describe('pruneHourBuckets', () => {
      it('should delete hour rows older than cutoff', () => {
        const deleted = store.pruneHourBuckets('2025-01-15T00:00:00');

        expect(deleted).toBe(1); // one old hour row

        const remaining = db.prepare('SELECT * FROM api_key_usage_buckets WHERE granularity = ?').all('hour') as ApiKeyUsageBucket[];
        expect(remaining).toHaveLength(1);
        expect(remaining[0].bucket_start).toBe('2025-01-15T14:00:00');
      });

      it('should not delete minute rows', () => {
        store.pruneHourBuckets('2025-01-15T00:00:00');

        const minuteRows = db.prepare('SELECT * FROM api_key_usage_buckets WHERE granularity = ?').all('minute') as ApiKeyUsageBucket[];
        expect(minuteRows).toHaveLength(3);
      });
    });

    describe('pruneOrphanedBuckets', () => {
      it('should delete rows for keys not in team_api_keys table after grace period', () => {
        // key-1 has no entry in team_api_keys -> orphaned
        // Old rows should be pruned
        const deleted = store.pruneOrphanedBuckets('2025-01-15T00:00:00');

        // Rows older than cutoff and orphaned are deleted
        expect(deleted).toBeGreaterThan(0);
      });

      it('should retain rows for keys that exist in team_api_keys', () => {
        // Insert a team_api_keys entry for key-1
        db.prepare(`
          INSERT INTO team_api_keys (id, team_id, name, key_hash, key_prefix)
          VALUES ('key-1', 'team-1', 'Test', 'hash1', 'dps_test')
        `).run();

        const deleted = store.pruneOrphanedBuckets('2025-01-15T00:00:00');

        expect(deleted).toBe(0);

        const rows = db.prepare('SELECT * FROM api_key_usage_buckets').all();
        expect(rows).toHaveLength(5); // all rows retained
      });

      it('should retain orphaned rows within the grace period', () => {
        // All rows have bucket_start >= '2025-01-14T10:00:00'
        // Using a cutoff before all rows means nothing is pruned
        const deleted = store.pruneOrphanedBuckets('2025-01-14T09:00:00');

        expect(deleted).toBe(0);
      });
    });
  });
});
