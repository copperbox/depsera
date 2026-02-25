import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`ALTER TABLE dependencies ADD COLUMN contact TEXT`);
}

export function down(_db: Database): void {
  // SQLite doesn't support DROP COLUMN in older versions
  // Would need table rebuild for full rollback
}
