import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  // Recreate alert_mutes with service_id column and updated CHECK constraint
  // SQLite doesn't support ALTER TABLE ... ADD CHECK, so we must recreate
  db.exec(`
    CREATE TABLE alert_mutes_backup AS SELECT * FROM alert_mutes;
    DROP TABLE alert_mutes;

    CREATE TABLE alert_mutes (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      dependency_id TEXT,
      canonical_name TEXT,
      service_id TEXT,
      reason TEXT,
      created_by TEXT NOT NULL,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (dependency_id) REFERENCES dependencies(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id),
      CHECK (
        (dependency_id IS NOT NULL AND canonical_name IS NULL AND service_id IS NULL) OR
        (dependency_id IS NULL AND canonical_name IS NOT NULL AND service_id IS NULL) OR
        (dependency_id IS NULL AND canonical_name IS NULL AND service_id IS NOT NULL)
      )
    );

    INSERT INTO alert_mutes (id, team_id, dependency_id, canonical_name, reason, created_by, expires_at, created_at)
      SELECT id, team_id, dependency_id, canonical_name, reason, created_by, expires_at, created_at
      FROM alert_mutes_backup;

    DROP TABLE alert_mutes_backup;

    CREATE UNIQUE INDEX idx_alert_mutes_dependency ON alert_mutes(dependency_id) WHERE dependency_id IS NOT NULL;
    CREATE UNIQUE INDEX idx_alert_mutes_canonical ON alert_mutes(team_id, canonical_name) WHERE canonical_name IS NOT NULL;
    CREATE UNIQUE INDEX idx_alert_mutes_service ON alert_mutes(team_id, service_id) WHERE service_id IS NOT NULL;
    CREATE INDEX idx_alert_mutes_team_id ON alert_mutes(team_id);
    CREATE INDEX idx_alert_mutes_expires_at ON alert_mutes(expires_at);
  `);
}

export function down(db: Database): void {
  // Remove service mutes and restore original schema
  db.exec(`
    DELETE FROM alert_mutes WHERE service_id IS NOT NULL;

    CREATE TABLE alert_mutes_backup AS SELECT * FROM alert_mutes;
    DROP TABLE alert_mutes;

    CREATE TABLE alert_mutes (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      dependency_id TEXT,
      canonical_name TEXT,
      reason TEXT,
      created_by TEXT NOT NULL,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (dependency_id) REFERENCES dependencies(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id),
      CHECK (
        (dependency_id IS NOT NULL AND canonical_name IS NULL) OR
        (dependency_id IS NULL AND canonical_name IS NOT NULL)
      )
    );

    INSERT INTO alert_mutes (id, team_id, dependency_id, canonical_name, reason, created_by, expires_at, created_at)
      SELECT id, team_id, dependency_id, canonical_name, reason, created_by, expires_at, created_at
      FROM alert_mutes_backup;

    DROP TABLE alert_mutes_backup;

    CREATE UNIQUE INDEX idx_alert_mutes_dependency ON alert_mutes(dependency_id) WHERE dependency_id IS NOT NULL;
    CREATE UNIQUE INDEX idx_alert_mutes_canonical ON alert_mutes(team_id, canonical_name) WHERE canonical_name IS NOT NULL;
    CREATE INDEX idx_alert_mutes_team_id ON alert_mutes(team_id);
    CREATE INDEX idx_alert_mutes_expires_at ON alert_mutes(expires_at);
  `);
}
