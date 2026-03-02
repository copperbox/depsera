import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  // Fix hidden manifest associations (bug fix)
  db.exec(`
    UPDATE dependency_associations
    SET is_dismissed = 0, is_auto_suggested = 0
    WHERE manifest_managed = 1 AND is_dismissed = 1
  `);

  // Remove stale auto-suggestions
  db.exec(`
    DELETE FROM dependency_associations
    WHERE manifest_managed = 0 AND is_auto_suggested = 1
  `);

  // Drop suggestion-related index
  db.exec(`DROP INDEX IF EXISTS idx_dep_associations_dep_dismissed`);

  // SQLite doesn't support DROP COLUMN in older versions, so recreate the table
  db.exec(`
    CREATE TABLE dependency_associations_new (
      id TEXT PRIMARY KEY,
      dependency_id TEXT NOT NULL,
      linked_service_id TEXT NOT NULL,
      association_type TEXT NOT NULL DEFAULT 'other',
      manifest_managed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (dependency_id) REFERENCES dependencies(id) ON DELETE CASCADE,
      FOREIGN KEY (linked_service_id) REFERENCES services(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    INSERT INTO dependency_associations_new (id, dependency_id, linked_service_id, association_type, manifest_managed, created_at)
    SELECT id, dependency_id, linked_service_id, association_type, manifest_managed, created_at
    FROM dependency_associations
  `);

  db.exec(`DROP TABLE dependency_associations`);
  db.exec(`ALTER TABLE dependency_associations_new RENAME TO dependency_associations`);

  // Re-create needed indexes
  db.exec(`CREATE INDEX idx_dep_associations_dependency_id ON dependency_associations(dependency_id)`);
  db.exec(`CREATE INDEX idx_dep_associations_linked_service_id ON dependency_associations(linked_service_id)`);
}

export function down(db: Database): void {
  // Add back the dropped columns
  db.exec(`ALTER TABLE dependency_associations ADD COLUMN is_auto_suggested INTEGER NOT NULL DEFAULT 0`);
  db.exec(`ALTER TABLE dependency_associations ADD COLUMN confidence_score REAL`);
  db.exec(`ALTER TABLE dependency_associations ADD COLUMN is_dismissed INTEGER NOT NULL DEFAULT 0`);
  db.exec(`ALTER TABLE dependency_associations ADD COLUMN match_reason TEXT`);
  db.exec(`CREATE INDEX idx_dep_associations_dep_dismissed ON dependency_associations(dependency_id, is_dismissed)`);
}
