import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`
    CREATE TABLE service_poll_history (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL,
      error TEXT,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_sph_service ON service_poll_history(service_id);
    CREATE INDEX idx_sph_time ON service_poll_history(recorded_at);
  `);
}

export function down(db: Database): void {
  db.exec('DROP TABLE IF EXISTS service_poll_history');
}
