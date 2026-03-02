import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`ALTER TABLE teams ADD COLUMN contact TEXT`);
}

export function down(db: Database): void {
  // SQLite doesn't support DROP COLUMN in older versions — recreate table
  db.exec(`
    CREATE TABLE teams_backup AS SELECT id, name, key, description, created_at, updated_at FROM teams;
    DROP TABLE teams;
    CREATE TABLE teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      key TEXT,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO teams SELECT * FROM teams_backup;
    DROP TABLE teams_backup;
    CREATE UNIQUE INDEX idx_teams_key ON teams(key) WHERE key IS NOT NULL;
  `);
}
