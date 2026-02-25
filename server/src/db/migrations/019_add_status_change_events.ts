import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`
    CREATE TABLE status_change_events (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      dependency_name TEXT NOT NULL,
      previous_healthy INTEGER,
      current_healthy INTEGER NOT NULL,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_status_change_events_time ON status_change_events(recorded_at);
    CREATE INDEX idx_status_change_events_service ON status_change_events(service_id);
  `);
}

export function down(db: Database): void {
  db.exec('DROP TABLE IF EXISTS status_change_events');
}
