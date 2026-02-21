import Database, { Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import { runMigrations } from './migrate';
import { seedDatabase } from './seed';

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/database.sqlite');

export const db: DatabaseType = new Database(dbPath);

export function initializeDatabase(): void {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Enable WAL mode for better concurrent performance
  db.pragma('journal_mode = WAL');

  // Run migrations
  runMigrations(db);

  // Seed database in development (skip in local auth mode — admin is bootstrapped separately)
  if (process.env.NODE_ENV !== 'production' && process.env.LOCAL_AUTH !== 'true') {
    seedDatabase(db);
  }

  console.log('Database initialized');
}

export function closeDatabase(): void {
  if (db.open) {
    db.close();
    console.log('Database connection closed');
  }
}

export default db;

// Re-export migration utilities for CLI usage
export { runMigrations, getMigrationStatus, rollbackMigration } from './migrate';
export { seedDatabase, clearDatabase, clearServices } from './seed';
