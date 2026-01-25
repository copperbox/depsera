import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  // Add new columns to dependencies table
  db.exec(`
    ALTER TABLE dependencies ADD COLUMN check_details TEXT;
    ALTER TABLE dependencies ADD COLUMN error TEXT;
    ALTER TABLE dependencies ADD COLUMN error_message TEXT;
  `);

  // Create error history table for trend analysis
  db.exec(`
    CREATE TABLE dependency_error_history (
      id TEXT PRIMARY KEY,
      dependency_id TEXT NOT NULL,
      error TEXT,
      error_message TEXT,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (dependency_id) REFERENCES dependencies(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_error_history_dependency ON dependency_error_history(dependency_id);
    CREATE INDEX idx_error_history_time ON dependency_error_history(recorded_at);
  `);
}

export function down(db: Database): void {
  db.exec(`DROP TABLE IF EXISTS dependency_error_history`);
  // Note: SQLite doesn't support DROP COLUMN in older versions
  // Would need table rebuild for full rollback of column changes
}
