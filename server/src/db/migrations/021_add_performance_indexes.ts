import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`
    -- Covering index for the latency subquery
    CREATE INDEX idx_latency_history_dep_time_latency
      ON dependency_latency_history(dependency_id, recorded_at, latency_ms);

    -- Composite for the LEFT JOIN filter
    CREATE INDEX idx_dep_associations_dep_dismissed
      ON dependency_associations(dependency_id, is_dismissed);
  `);
}

export function down(db: Database): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_latency_history_dep_time_latency;
    DROP INDEX IF EXISTS idx_dep_associations_dep_dismissed;
  `);
}
