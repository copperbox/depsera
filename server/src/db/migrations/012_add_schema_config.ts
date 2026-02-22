import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`ALTER TABLE services ADD COLUMN schema_config TEXT`);
}

export function down(db: Database): void {
  // SQLite doesn't support DROP COLUMN prior to 3.35.0
  // Rebuild the table without schema_config
  db.exec(`
    CREATE TABLE services_backup (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      team_id TEXT NOT NULL,
      health_endpoint TEXT NOT NULL,
      metrics_endpoint TEXT,
      poll_interval_ms INTEGER NOT NULL DEFAULT 30000,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_poll_success INTEGER,
      last_poll_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT
    );

    INSERT INTO services_backup SELECT
      id, name, team_id, health_endpoint, metrics_endpoint,
      poll_interval_ms, is_active, last_poll_success, last_poll_error,
      created_at, updated_at
    FROM services;

    DROP TABLE services;

    ALTER TABLE services_backup RENAME TO services;

    CREATE INDEX idx_services_team_id ON services(team_id);
  `);
}
