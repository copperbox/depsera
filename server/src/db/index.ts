import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import logger from '../utils/logger';
import { runMigrations } from './migrate';

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/database.sqlite');

export const db: DatabaseType = new Database(dbPath);

export function initializeDatabase(): void {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Enable WAL mode for better concurrent performance
  db.pragma('journal_mode = WAL');

  // Full synchronous mode — ensures durability even on power loss
  db.pragma('synchronous = FULL');

  // Auto-checkpoint WAL every 1000 pages (~4MB) to prevent unbounded WAL growth
  db.pragma('wal_autocheckpoint = 1000');

  // Run migrations
  runMigrations(db);

  logger.info('database initialized');
}

export function closeDatabase(): void {
  if (db.open) {
    db.close();
    logger.info('database connection closed');
  }
}

export default db;

// Re-export migration utilities for CLI usage
export { runMigrations, getMigrationStatus, rollbackMigration } from './migrate';
export { clearDatabase, clearServices } from './seed';
