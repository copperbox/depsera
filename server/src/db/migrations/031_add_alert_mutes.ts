import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  // Create alert_mutes table
  db.exec(`
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
    CREATE UNIQUE INDEX idx_alert_mutes_dependency ON alert_mutes(dependency_id) WHERE dependency_id IS NOT NULL;
    CREATE UNIQUE INDEX idx_alert_mutes_canonical ON alert_mutes(team_id, canonical_name) WHERE canonical_name IS NOT NULL;
    CREATE INDEX idx_alert_mutes_team_id ON alert_mutes(team_id);
    CREATE INDEX idx_alert_mutes_expires_at ON alert_mutes(expires_at);
  `);

  // Recreate alert_history to add 'muted' to the CHECK constraint
  // (SQLite cannot ALTER CHECK constraints, so we must recreate the table)
  db.exec(`
    CREATE TABLE alert_history_backup AS SELECT * FROM alert_history;
    DROP TABLE alert_history;
    CREATE TABLE alert_history (
      id TEXT PRIMARY KEY,
      alert_channel_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      dependency_id TEXT,
      event_type TEXT NOT NULL,
      payload TEXT,
      sent_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'suppressed', 'muted')),
      FOREIGN KEY (alert_channel_id) REFERENCES alert_channels(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
      FOREIGN KEY (dependency_id) REFERENCES dependencies(id) ON DELETE SET NULL
    );
    INSERT INTO alert_history SELECT * FROM alert_history_backup;
    DROP TABLE alert_history_backup;
    CREATE INDEX idx_alert_history_channel_id ON alert_history(alert_channel_id);
    CREATE INDEX idx_alert_history_sent_at ON alert_history(sent_at);
  `);
}

export function down(db: Database): void {
  // Restore alert_history without 'muted' status
  db.exec(`
    DELETE FROM alert_history WHERE status = 'muted';
    CREATE TABLE alert_history_backup AS SELECT * FROM alert_history;
    DROP TABLE alert_history;
    CREATE TABLE alert_history (
      id TEXT PRIMARY KEY,
      alert_channel_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      dependency_id TEXT,
      event_type TEXT NOT NULL,
      payload TEXT,
      sent_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'suppressed')),
      FOREIGN KEY (alert_channel_id) REFERENCES alert_channels(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
      FOREIGN KEY (dependency_id) REFERENCES dependencies(id) ON DELETE SET NULL
    );
    INSERT INTO alert_history SELECT * FROM alert_history_backup;
    DROP TABLE alert_history_backup;
    CREATE INDEX idx_alert_history_channel_id ON alert_history(alert_channel_id);
    CREATE INDEX idx_alert_history_sent_at ON alert_history(sent_at);
  `);

  db.exec(`DROP TABLE IF EXISTS alert_mutes`);
}
