import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      updated_by TEXT,
      FOREIGN KEY (updated_by) REFERENCES users(id)
    )
  `);

  // Seed default span retention of 7 days
  db.exec(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('span_retention_days', '7')`);
}

export function down(db: Database): void {
  db.exec(`DROP TABLE IF EXISTS app_settings`);
}
