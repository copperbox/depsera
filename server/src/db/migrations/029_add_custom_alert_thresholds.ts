import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`ALTER TABLE alert_rules ADD COLUMN use_custom_thresholds INTEGER NOT NULL DEFAULT 0`);
  db.exec(`ALTER TABLE alert_rules ADD COLUMN cooldown_minutes INTEGER`);
  db.exec(`ALTER TABLE alert_rules ADD COLUMN rate_limit_per_hour INTEGER`);
}

export function down(db: Database): void {
  // SQLite doesn't support DROP COLUMN in older versions — recreate table
  db.exec(`
    CREATE TABLE alert_rules_backup AS
      SELECT id, team_id, severity_filter, is_active, created_at, updated_at
      FROM alert_rules;
    DROP TABLE alert_rules;
    CREATE TABLE alert_rules (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      severity_filter TEXT NOT NULL CHECK (severity_filter IN ('critical', 'warning', 'all')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    );
    INSERT INTO alert_rules SELECT * FROM alert_rules_backup;
    DROP TABLE alert_rules_backup;
    CREATE INDEX idx_alert_rules_team_id ON alert_rules(team_id);
  `);
}
