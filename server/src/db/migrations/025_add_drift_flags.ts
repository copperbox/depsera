import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  // DPS-48h: Create drift_flags table
  db.exec(`
    CREATE TABLE drift_flags (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      drift_type TEXT NOT NULL,
      field_name TEXT,
      manifest_value TEXT,
      current_value TEXT,
      status TEXT NOT NULL,
      first_detected_at TEXT NOT NULL,
      last_detected_at TEXT NOT NULL,
      resolved_at TEXT,
      resolved_by TEXT,
      sync_history_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
      FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (sync_history_id) REFERENCES manifest_sync_history(id) ON DELETE SET NULL
    )
  `);

  db.exec(`CREATE INDEX idx_drift_flags_team_id ON drift_flags(team_id)`);
  db.exec(`CREATE INDEX idx_drift_flags_service_id ON drift_flags(service_id)`);
  db.exec(`CREATE INDEX idx_drift_flags_status ON drift_flags(status)`);
  db.exec(`CREATE INDEX idx_drift_flags_team_status ON drift_flags(team_id, status)`);
}

export function down(db: Database): void {
  db.exec(`DROP TABLE IF EXISTS drift_flags`);
}
