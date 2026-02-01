import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`
    CREATE TABLE dependency_aliases (
      id TEXT PRIMARY KEY,
      alias TEXT NOT NULL UNIQUE,
      canonical_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    ALTER TABLE dependencies ADD COLUMN canonical_name TEXT;
  `);
}

export function down(db: Database): void {
  db.exec(`
    DROP TABLE IF EXISTS dependency_aliases;
  `);
  // Note: SQLite doesn't support DROP COLUMN in older versions
}
