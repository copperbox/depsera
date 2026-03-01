import { Database } from 'better-sqlite3';

export function up(db: Database): void {
  // Add nullable key column to teams
  db.exec(`ALTER TABLE teams ADD COLUMN key TEXT`);

  // Backfill existing teams: derive key from name
  const teams = db.prepare('SELECT id, name FROM teams').all() as { id: string; name: string }[];
  const usedKeys = new Set<string>();

  for (const team of teams) {
    let base = team.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9_-]/g, '');

    // Ensure key starts with alphanumeric
    if (base.length === 0 || !/^[a-z0-9]/.test(base)) {
      base = 'team-' + base;
    }
    // Trim to max length leaving room for suffix
    if (base.length > 120) {
      base = base.slice(0, 120);
    }

    let key = base;
    let suffix = 1;
    while (usedKeys.has(key)) {
      key = `${base}-${suffix}`;
      suffix++;
    }
    usedKeys.add(key);

    db.prepare('UPDATE teams SET key = ? WHERE id = ?').run(key, team.id);
  }

  // Create unique partial index (WHERE key IS NOT NULL)
  db.exec(`CREATE UNIQUE INDEX idx_teams_key ON teams(key) WHERE key IS NOT NULL`);
}

export function down(db: Database): void {
  db.exec(`DROP INDEX IF EXISTS idx_teams_key`);
  // SQLite doesn't support DROP COLUMN in older versions — recreate table
  db.exec(`
    CREATE TABLE teams_backup AS SELECT id, name, description, created_at, updated_at FROM teams;
    DROP TABLE teams;
    CREATE TABLE teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO teams SELECT * FROM teams_backup;
    DROP TABLE teams_backup;
  `);
}
