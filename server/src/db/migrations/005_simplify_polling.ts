import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  // Add poll result tracking columns to services
  db.exec(`
    ALTER TABLE services ADD COLUMN last_poll_success INTEGER;
    ALTER TABLE services ADD COLUMN last_poll_error TEXT;
  `);

  // SQLite doesn't support DROP COLUMN in older versions, so we rebuild the table
  // to remove polling_interval. However, for compatibility we'll keep the column
  // but it's no longer used by the application. All services poll every 30s.
  // We just leave polling_interval in place to avoid a complex table rebuild.
}

export function down(_db: Database): void {
  // Note: SQLite doesn't support DROP COLUMN in older versions
  // Would need table rebuild for full rollback of column changes
}
