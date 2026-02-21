import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT`);
}

export function down(db: Database): void {
  // SQLite doesn't support DROP COLUMN before 3.35.0; rebuild table without password_hash
  db.exec(`
    CREATE TABLE users_backup (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      oidc_subject TEXT UNIQUE,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO users_backup SELECT id, email, name, oidc_subject, role, is_active, created_at, updated_at FROM users;
    DROP TABLE users;
    ALTER TABLE users_backup RENAME TO users;
  `);
}
