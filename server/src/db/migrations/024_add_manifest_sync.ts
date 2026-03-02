import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  // DPS-48a: Create team_manifest_config table
  db.exec(`
    CREATE TABLE team_manifest_config (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL UNIQUE,
      manifest_url TEXT NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      sync_policy TEXT,
      last_sync_at TEXT,
      last_sync_status TEXT,
      last_sync_error TEXT,
      last_sync_summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    )
  `);

  // DPS-48b: Create manifest_sync_history table
  db.exec(`
    CREATE TABLE manifest_sync_history (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      triggered_by TEXT,
      manifest_url TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT,
      errors TEXT,
      warnings TEXT,
      duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id),
      FOREIGN KEY (triggered_by) REFERENCES users(id)
    )
  `);

  // DPS-48c: Add manifest columns to services table
  db.exec(`ALTER TABLE services ADD COLUMN manifest_key TEXT`);
  db.exec(`ALTER TABLE services ADD COLUMN manifest_managed INTEGER DEFAULT 0`);
  db.exec(`ALTER TABLE services ADD COLUMN manifest_last_synced_values TEXT`);

  // Partial unique index: one manifest_key per team (only where key is set)
  db.exec(`
    CREATE UNIQUE INDEX idx_services_team_manifest_key
    ON services(team_id, manifest_key)
    WHERE manifest_key IS NOT NULL
  `);

  // DPS-48d: Add manifest_team_id to dependency_aliases
  db.exec(`ALTER TABLE dependency_aliases ADD COLUMN manifest_team_id TEXT REFERENCES teams(id) ON DELETE SET NULL`);

  // DPS-48e: Rebuild dependency_canonical_overrides for team-scoping
  // SQLite table rebuild pattern: create new → copy data → drop old → rename
  db.exec(`
    CREATE TABLE dependency_canonical_overrides_new (
      id TEXT PRIMARY KEY,
      canonical_name TEXT NOT NULL,
      team_id TEXT,
      contact_override TEXT,
      impact_override TEXT,
      manifest_managed INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT,
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (updated_by) REFERENCES users(id)
    )
  `);

  // Copy existing data with team_id = NULL (global overrides)
  db.exec(`
    INSERT INTO dependency_canonical_overrides_new
      (id, canonical_name, team_id, contact_override, impact_override, manifest_managed, created_at, updated_at, updated_by)
    SELECT
      id, canonical_name, NULL, contact_override, impact_override, 0, created_at, updated_at, updated_by
    FROM dependency_canonical_overrides
  `);

  db.exec(`DROP TABLE dependency_canonical_overrides`);
  db.exec(`ALTER TABLE dependency_canonical_overrides_new RENAME TO dependency_canonical_overrides`);

  // Partial unique indexes for team-scoped and global overrides
  db.exec(`
    CREATE UNIQUE INDEX idx_canonical_overrides_team_scoped
    ON dependency_canonical_overrides(team_id, canonical_name)
    WHERE team_id IS NOT NULL
  `);
  db.exec(`
    CREATE UNIQUE INDEX idx_canonical_overrides_global
    ON dependency_canonical_overrides(canonical_name)
    WHERE team_id IS NULL
  `);

  // DPS-48f: Add manifest_managed to dependency_associations
  db.exec(`ALTER TABLE dependency_associations ADD COLUMN manifest_managed INTEGER DEFAULT 0`);
}

export function down(db: Database): void {
  // Reverse DPS-48f: Remove manifest_managed from dependency_associations
  // SQLite doesn't support DROP COLUMN before 3.35.0, use rebuild pattern
  db.exec(`ALTER TABLE dependency_associations DROP COLUMN manifest_managed`);

  // Reverse DPS-48e: Rebuild dependency_canonical_overrides back to original schema
  db.exec(`
    CREATE TABLE dependency_canonical_overrides_old (
      id TEXT PRIMARY KEY,
      canonical_name TEXT NOT NULL UNIQUE,
      contact_override TEXT,
      impact_override TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT,
      FOREIGN KEY (updated_by) REFERENCES users(id)
    )
  `);

  // Copy only global overrides back (team-scoped ones will be lost)
  db.exec(`
    INSERT INTO dependency_canonical_overrides_old
      (id, canonical_name, contact_override, impact_override, created_at, updated_at, updated_by)
    SELECT
      id, canonical_name, contact_override, impact_override, created_at, updated_at, updated_by
    FROM dependency_canonical_overrides
    WHERE team_id IS NULL
  `);

  db.exec(`DROP TABLE dependency_canonical_overrides`);
  db.exec(`ALTER TABLE dependency_canonical_overrides_old RENAME TO dependency_canonical_overrides`);

  // Reverse DPS-48d: Remove manifest_team_id from dependency_aliases
  db.exec(`ALTER TABLE dependency_aliases DROP COLUMN manifest_team_id`);

  // Reverse DPS-48c: Remove manifest columns from services
  db.exec(`DROP INDEX IF EXISTS idx_services_team_manifest_key`);
  db.exec(`ALTER TABLE services DROP COLUMN manifest_last_synced_values`);
  db.exec(`ALTER TABLE services DROP COLUMN manifest_managed`);
  db.exec(`ALTER TABLE services DROP COLUMN manifest_key`);

  // Reverse DPS-48b: Drop manifest_sync_history
  db.exec(`DROP TABLE IF EXISTS manifest_sync_history`);

  // Reverse DPS-48a: Drop team_manifest_config
  db.exec(`DROP TABLE IF EXISTS team_manifest_config`);
}
