import { Database } from 'better-sqlite3';

export const up = (db: Database): void => {
  // Add type column to dependencies table
  // Types: database, rest, soap, grpc, graphql, message_queue, cache, file_system, smtp, other
  db.exec(`
    ALTER TABLE dependencies
    ADD COLUMN type TEXT DEFAULT 'other'
    CHECK (type IN ('database', 'rest', 'soap', 'grpc', 'graphql', 'message_queue', 'cache', 'file_system', 'smtp', 'other'))
  `);
};

export const down = (db: Database): void => {
  // SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
  db.exec(`
    CREATE TABLE dependencies_backup (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      impact TEXT,
      healthy INTEGER,
      health_state INTEGER,
      health_code INTEGER,
      latency_ms INTEGER,
      last_checked TEXT,
      last_status_change TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
      UNIQUE (service_id, name)
    );

    INSERT INTO dependencies_backup
    SELECT id, service_id, name, description, impact, healthy, health_state,
           health_code, latency_ms, last_checked, last_status_change, created_at, updated_at
    FROM dependencies;

    DROP TABLE dependencies;

    ALTER TABLE dependencies_backup RENAME TO dependencies;

    CREATE INDEX IF NOT EXISTS idx_dependencies_service_id ON dependencies(service_id);
    CREATE INDEX IF NOT EXISTS idx_dependencies_healthy ON dependencies(healthy);
  `);
};
