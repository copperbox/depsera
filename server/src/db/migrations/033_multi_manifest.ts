import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  // DPS-76a: Rebuild team_manifest_config to support multiple configs per team
  // SQLite table-rebuild pattern: create new → copy data → drop old → rename

  db.exec(`
    CREATE TABLE team_manifest_config_new (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Default',
      manifest_url TEXT NOT NULL,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      sync_policy TEXT,
      last_sync_at TEXT,
      last_sync_status TEXT,
      last_sync_error TEXT,
      last_sync_summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      UNIQUE(team_id, name)
    )
  `);

  // Copy existing rows with name = 'Default'
  db.exec(`
    INSERT INTO team_manifest_config_new
      (id, team_id, name, manifest_url, is_enabled, sync_policy,
       last_sync_at, last_sync_status, last_sync_error, last_sync_summary,
       created_at, updated_at)
    SELECT
      id, team_id, 'Default', manifest_url, is_enabled, sync_policy,
      last_sync_at, last_sync_status, last_sync_error, last_sync_summary,
      created_at, updated_at
    FROM team_manifest_config
  `);

  db.exec(`DROP TABLE team_manifest_config`);
  db.exec(`ALTER TABLE team_manifest_config_new RENAME TO team_manifest_config`);

  // Index for looking up all configs for a team
  db.exec(`CREATE INDEX idx_manifest_config_team_id ON team_manifest_config(team_id)`);

  // DPS-76b: Add manifest_config_id to manifest_sync_history
  db.exec(`ALTER TABLE manifest_sync_history ADD COLUMN manifest_config_id TEXT REFERENCES team_manifest_config(id) ON DELETE SET NULL`);
  db.exec(`CREATE INDEX idx_sync_history_config_id ON manifest_sync_history(manifest_config_id)`);

  // DPS-76c: Add manifest_config_id to drift_flags
  db.exec(`ALTER TABLE drift_flags ADD COLUMN manifest_config_id TEXT REFERENCES team_manifest_config(id) ON DELETE SET NULL`);
  db.exec(`CREATE INDEX idx_drift_flags_config_id ON drift_flags(manifest_config_id)`);

  // DPS-76d: Add manifest_config_id to services (for manifest-managed services)
  db.exec(`ALTER TABLE services ADD COLUMN manifest_config_id TEXT REFERENCES team_manifest_config(id) ON DELETE SET NULL`);
  db.exec(`CREATE INDEX idx_services_config_id ON services(manifest_config_id)`);

  // DPS-76e: Backfill manifest_config_id from existing team_id→config mapping
  // For each team that has a config, set manifest_config_id on related rows
  db.exec(`
    UPDATE manifest_sync_history
    SET manifest_config_id = (
      SELECT tmc.id FROM team_manifest_config tmc
      WHERE tmc.team_id = manifest_sync_history.team_id
      LIMIT 1
    )
    WHERE EXISTS (
      SELECT 1 FROM team_manifest_config tmc
      WHERE tmc.team_id = manifest_sync_history.team_id
    )
  `);

  db.exec(`
    UPDATE drift_flags
    SET manifest_config_id = (
      SELECT tmc.id FROM team_manifest_config tmc
      WHERE tmc.team_id = drift_flags.team_id
      LIMIT 1
    )
    WHERE EXISTS (
      SELECT 1 FROM team_manifest_config tmc
      WHERE tmc.team_id = drift_flags.team_id
    )
  `);

  db.exec(`
    UPDATE services
    SET manifest_config_id = (
      SELECT tmc.id FROM team_manifest_config tmc
      WHERE tmc.team_id = services.team_id
      LIMIT 1
    )
    WHERE manifest_managed = 1
      AND EXISTS (
        SELECT 1 FROM team_manifest_config tmc
        WHERE tmc.team_id = services.team_id
      )
  `);
}

export function down(db: Database): void {
  // Remove manifest_config_id from services
  db.exec(`DROP INDEX IF EXISTS idx_services_config_id`);
  db.exec(`ALTER TABLE services DROP COLUMN manifest_config_id`);

  // Remove manifest_config_id from drift_flags
  db.exec(`DROP INDEX IF EXISTS idx_drift_flags_config_id`);
  db.exec(`ALTER TABLE drift_flags DROP COLUMN manifest_config_id`);

  // Remove manifest_config_id from manifest_sync_history
  db.exec(`DROP INDEX IF EXISTS idx_sync_history_config_id`);
  db.exec(`ALTER TABLE manifest_sync_history DROP COLUMN manifest_config_id`);

  // Rebuild team_manifest_config back to original schema with UNIQUE(team_id)
  db.exec(`
    CREATE TABLE team_manifest_config_old (
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

  // Copy back — keep only one config per team (the first by created_at)
  db.exec(`
    INSERT INTO team_manifest_config_old
      (id, team_id, manifest_url, is_enabled, sync_policy,
       last_sync_at, last_sync_status, last_sync_error, last_sync_summary,
       created_at, updated_at)
    SELECT
      id, team_id, manifest_url, is_enabled, sync_policy,
      last_sync_at, last_sync_status, last_sync_error, last_sync_summary,
      created_at, updated_at
    FROM team_manifest_config
    WHERE id IN (
      SELECT id FROM team_manifest_config
      GROUP BY team_id
      HAVING MIN(created_at)
    )
  `);

  db.exec(`DROP INDEX IF EXISTS idx_manifest_config_team_id`);
  db.exec(`DROP TABLE team_manifest_config`);
  db.exec(`ALTER TABLE team_manifest_config_old RENAME TO team_manifest_config`);
}
