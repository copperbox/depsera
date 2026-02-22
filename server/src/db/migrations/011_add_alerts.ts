import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`
    CREATE TABLE alert_channels (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      channel_type TEXT NOT NULL CHECK (channel_type IN ('slack', 'webhook')),
      config TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_alert_channels_team_id ON alert_channels(team_id);

    CREATE TABLE alert_rules (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      severity_filter TEXT NOT NULL CHECK (severity_filter IN ('critical', 'warning', 'all')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_alert_rules_team_id ON alert_rules(team_id);

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

    CREATE INDEX idx_alert_history_channel_id ON alert_history(alert_channel_id);
    CREATE INDEX idx_alert_history_sent_at ON alert_history(sent_at);
  `);
}

export function down(db: Database): void {
  db.exec(`
    DROP TABLE IF EXISTS alert_history;
    DROP TABLE IF EXISTS alert_rules;
    DROP TABLE IF EXISTS alert_channels;
  `);
}
