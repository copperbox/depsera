import Database from 'better-sqlite3';
import path from 'path';
import { runMigrations } from './migrate';
import { seedDatabase } from './seed';

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/database.sqlite');

export const db = new Database(dbPath);

export function initializeDatabase(): void {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Enable WAL mode for better concurrent performance
  db.pragma('journal_mode = WAL');

  // Run migrations
  runMigrations(db);

  // Seed database in development
  if (process.env.NODE_ENV !== 'production') {
    seedDatabase(db);
  }

  console.log('Database initialized');
}

export default db;

// Re-export migration utilities for CLI usage
export { runMigrations, getMigrationStatus, rollbackMigration } from './migrate';
export { seedDatabase, clearDatabase } from './seed';
