import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`ALTER TABLE dependency_associations ADD COLUMN match_reason TEXT`);
}

export function down(db: Database): void {
  // SQLite doesn't support DROP COLUMN prior to 3.35.0
  // Rebuild the table without match_reason
  db.exec(`
    CREATE TABLE dependency_associations_backup (
      id TEXT PRIMARY KEY,
      dependency_id TEXT NOT NULL,
      linked_service_id TEXT NOT NULL,
      association_type TEXT DEFAULT 'api_call',
      is_auto_suggested INTEGER NOT NULL DEFAULT 0,
      confidence_score REAL,
      is_dismissed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (dependency_id, linked_service_id),
      FOREIGN KEY (dependency_id) REFERENCES dependencies(id) ON DELETE CASCADE,
      FOREIGN KEY (linked_service_id) REFERENCES services(id) ON DELETE CASCADE
    );

    INSERT INTO dependency_associations_backup
      SELECT id, dependency_id, linked_service_id, association_type,
        is_auto_suggested, confidence_score, is_dismissed, created_at
      FROM dependency_associations;

    DROP TABLE dependency_associations;

    ALTER TABLE dependency_associations_backup RENAME TO dependency_associations;
  `);
}
