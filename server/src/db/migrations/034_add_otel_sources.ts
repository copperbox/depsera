import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  // DPS-77a: Add health_endpoint_format column to services
  db.exec(`
    ALTER TABLE services ADD COLUMN health_endpoint_format TEXT NOT NULL DEFAULT 'default'
  `);

  // Backfill: services with schema_config should be 'schema'
  db.exec(`
    UPDATE services SET health_endpoint_format = 'schema' WHERE schema_config IS NOT NULL
  `);

  // DPS-77b: Create team_api_keys table for OTLP push authentication
  db.exec(`
    CREATE TABLE team_api_keys (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      last_used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // Unique index on key_hash for fast lookup during authentication
  db.exec(`CREATE UNIQUE INDEX idx_team_api_keys_key_hash ON team_api_keys(key_hash)`);

  // Index for listing keys by team
  db.exec(`CREATE INDEX idx_team_api_keys_team_id ON team_api_keys(team_id)`);
}

export function down(db: Database): void {
  // Drop team_api_keys table and indexes
  db.exec(`DROP INDEX IF EXISTS idx_team_api_keys_team_id`);
  db.exec(`DROP INDEX IF EXISTS idx_team_api_keys_key_hash`);
  db.exec(`DROP TABLE IF EXISTS team_api_keys`);

  // Remove health_endpoint_format column from services
  db.exec(`ALTER TABLE services DROP COLUMN health_endpoint_format`);
}
