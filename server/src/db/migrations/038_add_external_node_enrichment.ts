import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`
    CREATE TABLE external_node_enrichment (
      id TEXT PRIMARY KEY,
      canonical_name TEXT NOT NULL UNIQUE,
      display_name TEXT,
      description TEXT,
      impact TEXT,
      contact TEXT,
      service_type TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT,
      FOREIGN KEY (updated_by) REFERENCES users(id)
    )
  `);
}

export function down(db: Database): void {
  db.exec(`DROP TABLE IF EXISTS external_node_enrichment`);
}
