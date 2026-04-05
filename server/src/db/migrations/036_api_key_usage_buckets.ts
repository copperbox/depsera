import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  // DPS-85a: Create api_key_usage_buckets table for per-key usage tracking
  // No ON DELETE CASCADE by design — orphaned rows for deleted keys are retained 7 days
  // then pruned by the retention job
  db.exec(`
    CREATE TABLE api_key_usage_buckets (
      api_key_id      TEXT    NOT NULL,
      bucket_start    TEXT    NOT NULL,
      granularity     TEXT    NOT NULL CHECK(granularity IN ('minute', 'hour')),
      push_count      INTEGER NOT NULL DEFAULT 0,
      rejected_count  INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (api_key_id, bucket_start, granularity)
    )
  `);

  // Composite index for per-key time-range queries
  db.exec(`CREATE INDEX idx_usage_buckets_key_start ON api_key_usage_buckets(api_key_id, bucket_start)`);

  // Index on bucket_start alone to support retention DELETE statements
  db.exec(`CREATE INDEX idx_usage_buckets_start ON api_key_usage_buckets(bucket_start)`);
}

export function down(db: Database): void {
  db.exec(`DROP INDEX IF EXISTS idx_usage_buckets_start`);
  db.exec(`DROP INDEX IF EXISTS idx_usage_buckets_key_start`);
  db.exec(`DROP TABLE IF EXISTS api_key_usage_buckets`);
}
