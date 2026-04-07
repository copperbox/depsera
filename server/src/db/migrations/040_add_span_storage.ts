import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`
    CREATE TABLE spans (
      id TEXT PRIMARY KEY,
      trace_id TEXT NOT NULL,
      span_id TEXT NOT NULL,
      parent_span_id TEXT,
      service_name TEXT NOT NULL,
      team_id TEXT NOT NULL,
      name TEXT NOT NULL,
      kind INTEGER NOT NULL DEFAULT 0,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_ms REAL NOT NULL,
      status_code INTEGER DEFAULT 0,
      status_message TEXT,
      attributes TEXT,
      resource_attributes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
    )
  `);

  db.exec(`CREATE INDEX idx_spans_trace_id ON spans(trace_id)`);
  db.exec(`CREATE INDEX idx_spans_service_team ON spans(service_name, team_id)`);
  db.exec(`CREATE INDEX idx_spans_start_time ON spans(start_time)`);
  db.exec(`CREATE INDEX idx_spans_kind ON spans(kind)`);
  db.exec(`CREATE INDEX idx_spans_created_at ON spans(created_at)`);
}

export function down(db: Database): void {
  db.exec(`DROP INDEX IF EXISTS idx_spans_created_at`);
  db.exec(`DROP INDEX IF EXISTS idx_spans_kind`);
  db.exec(`DROP INDEX IF EXISTS idx_spans_start_time`);
  db.exec(`DROP INDEX IF EXISTS idx_spans_service_team`);
  db.exec(`DROP INDEX IF EXISTS idx_spans_trace_id`);
  db.exec(`DROP TABLE IF EXISTS spans`);
}
