import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dependency_canonical_overrides (
      id TEXT PRIMARY KEY,
      canonical_name TEXT NOT NULL UNIQUE,
      contact_override TEXT,
      impact_override TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT,
      FOREIGN KEY (updated_by) REFERENCES users(id)
    )
  `);
}

export function down(db: Database): void {
  db.exec('DROP TABLE IF EXISTS dependency_canonical_overrides');
}
