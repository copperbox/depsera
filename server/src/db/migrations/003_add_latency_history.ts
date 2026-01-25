import { Database } from 'better-sqlite3';

export const up = (db: Database): void => {
  db.exec(`
    CREATE TABLE dependency_latency_history (
      id TEXT PRIMARY KEY,
      dependency_id TEXT NOT NULL,
      latency_ms INTEGER NOT NULL,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (dependency_id) REFERENCES dependencies(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_latency_history_dependency ON dependency_latency_history(dependency_id);
    CREATE INDEX idx_latency_history_time ON dependency_latency_history(recorded_at);
  `);
};

export const down = (db: Database): void => {
  db.exec(`
    DROP INDEX IF EXISTS idx_latency_history_time;
    DROP INDEX IF EXISTS idx_latency_history_dependency;
    DROP TABLE IF EXISTS dependency_latency_history;
  `);
};
