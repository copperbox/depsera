import { Database } from 'better-sqlite3';

export const up = (db: Database): void => {
  // Remove the CHECK constraint on dependencies.type to allow arbitrary string values
  // from custom schema mappings. SQLite doesn't support ALTER COLUMN, so we recreate the table.
  db.exec(`
    CREATE TABLE dependencies_new (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL,
      name TEXT NOT NULL,
      canonical_name TEXT,
      description TEXT,
      impact TEXT,
      type TEXT DEFAULT 'other',
      healthy INTEGER,
      health_state INTEGER,
      health_code INTEGER,
      latency_ms INTEGER,
      check_details TEXT,
      error TEXT,
      error_message TEXT,
      last_checked TEXT,
      last_status_change TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
      UNIQUE (service_id, name)
    );

    INSERT INTO dependencies_new
    SELECT id, service_id, name, canonical_name, description, impact, type, healthy,
           health_state, health_code, latency_ms, check_details, error, error_message,
           last_checked, last_status_change, created_at, updated_at
    FROM dependencies;

    DROP TABLE dependencies;

    ALTER TABLE dependencies_new RENAME TO dependencies;

    CREATE INDEX IF NOT EXISTS idx_dependencies_service_id ON dependencies(service_id);
    CREATE INDEX IF NOT EXISTS idx_dependencies_healthy ON dependencies(healthy);
    CREATE INDEX IF NOT EXISTS idx_dependencies_canonical_name ON dependencies(canonical_name);
  `);
};

export const down = (db: Database): void => {
  // Re-add the CHECK constraint
  db.exec(`
    CREATE TABLE dependencies_old (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL,
      name TEXT NOT NULL,
      canonical_name TEXT,
      description TEXT,
      impact TEXT,
      type TEXT DEFAULT 'other'
        CHECK (type IN ('database', 'rest', 'soap', 'grpc', 'graphql', 'message_queue', 'cache', 'file_system', 'smtp', 'other')),
      healthy INTEGER,
      health_state INTEGER,
      health_code INTEGER,
      latency_ms INTEGER,
      check_details TEXT,
      error TEXT,
      error_message TEXT,
      last_checked TEXT,
      last_status_change TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
      UNIQUE (service_id, name)
    );

    INSERT INTO dependencies_old
    SELECT id, service_id, name, canonical_name, description, impact,
           CASE WHEN type IN ('database', 'rest', 'soap', 'grpc', 'graphql', 'message_queue', 'cache', 'file_system', 'smtp', 'other')
                THEN type ELSE 'other' END,
           healthy, health_state, health_code, latency_ms, check_details, error, error_message,
           last_checked, last_status_change, created_at, updated_at
    FROM dependencies;

    DROP TABLE dependencies;

    ALTER TABLE dependencies_old RENAME TO dependencies;

    CREATE INDEX IF NOT EXISTS idx_dependencies_service_id ON dependencies(service_id);
    CREATE INDEX IF NOT EXISTS idx_dependencies_healthy ON dependencies(healthy);
    CREATE INDEX IF NOT EXISTS idx_dependencies_canonical_name ON dependencies(canonical_name);
  `);
};
