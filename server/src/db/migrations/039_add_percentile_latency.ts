import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`ALTER TABLE dependency_latency_history ADD COLUMN p50_ms REAL`);
  db.exec(`ALTER TABLE dependency_latency_history ADD COLUMN p95_ms REAL`);
  db.exec(`ALTER TABLE dependency_latency_history ADD COLUMN p99_ms REAL`);
  db.exec(`ALTER TABLE dependency_latency_history ADD COLUMN min_ms REAL`);
  db.exec(`ALTER TABLE dependency_latency_history ADD COLUMN max_ms REAL`);
  db.exec(`ALTER TABLE dependency_latency_history ADD COLUMN request_count INTEGER`);
  db.exec(`ALTER TABLE dependency_latency_history ADD COLUMN source TEXT NOT NULL DEFAULT 'poll'`);
}

export function down(db: Database): void {
  // SQLite doesn't support DROP COLUMN in all versions
  // These columns are nullable/defaulted and harmless if left in place
  // For a full rollback, recreate the table without these columns
}
