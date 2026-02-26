import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`ALTER TABLE dependencies ADD COLUMN skipped INTEGER NOT NULL DEFAULT 0`);
}

export function down(db: Database): void {
  db.exec(`ALTER TABLE dependencies DROP COLUMN skipped`);
}
