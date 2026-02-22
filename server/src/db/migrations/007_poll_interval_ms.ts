import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  // Rebuild services table to replace polling_interval with poll_interval_ms
  db.exec(`
    CREATE TABLE services_new (
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
    )
  `);

  // Copy data, converting polling_interval (seconds) to poll_interval_ms (milliseconds)
  db.exec(`
    INSERT INTO services_new (id, name, team_id, health_endpoint, metrics_endpoint, poll_interval_ms, is_active, last_poll_success, last_poll_error, created_at, updated_at)
    SELECT id, name, team_id, health_endpoint, metrics_endpoint, COALESCE(polling_interval * 1000, 30000), is_active, last_poll_success, last_poll_error, created_at, updated_at
    FROM services
  `);

  db.exec('DROP TABLE services');
  db.exec('ALTER TABLE services_new RENAME TO services');

  // Recreate indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_services_team_id ON services(team_id)');
}

export function down(db: Database): void {
  // Rebuild with polling_interval (seconds)
  db.exec(`
    CREATE TABLE services_old (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      team_id TEXT NOT NULL,
      health_endpoint TEXT NOT NULL,
      metrics_endpoint TEXT,
      polling_interval INTEGER NOT NULL DEFAULT 30,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_poll_success INTEGER,
      last_poll_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT
    )
  `);

  db.exec(`
    INSERT INTO services_old (id, name, team_id, health_endpoint, metrics_endpoint, polling_interval, is_active, last_poll_success, last_poll_error, created_at, updated_at)
    SELECT id, name, team_id, health_endpoint, metrics_endpoint, poll_interval_ms / 1000, is_active, last_poll_success, last_poll_error, created_at, updated_at
    FROM services
  `);

  db.exec('DROP TABLE services');
  db.exec('ALTER TABLE services_old RENAME TO services');
  db.exec('CREATE INDEX IF NOT EXISTS idx_services_team_id ON services(team_id)');
}
