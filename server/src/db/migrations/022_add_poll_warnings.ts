import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`ALTER TABLE services ADD COLUMN poll_warnings TEXT`);
}

export function down(db: Database): void {
  // SQLite doesn't support DROP COLUMN in older versions,
  // but better-sqlite3 with modern SQLite does
  db.exec(`ALTER TABLE services DROP COLUMN poll_warnings`);
}
