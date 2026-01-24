import Database from 'better-sqlite3';
import path from 'path';

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/database.sqlite');

export const db = new Database(dbPath);

export function initializeDatabase(): void {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create tables here as needed
  // Example:
  // db.exec(`
  //   CREATE TABLE IF NOT EXISTS dependencies (
  //     id INTEGER PRIMARY KEY AUTOINCREMENT,
  //     name TEXT NOT NULL,
  //     version TEXT NOT NULL,
  //     created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  //   )
  // `);

  console.log('Database initialized');
}

export default db;
